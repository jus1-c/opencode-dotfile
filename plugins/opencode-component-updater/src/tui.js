import { spawn } from "node:child_process";
import { formatStatusDetail, readStatus } from "./status.js";
import { resolveUpdaterPaths } from "./paths.js";

const statusCommandID = "opencode-component-updater.status";
const updateCommandID = "opencode-component-updater.update";
const rollbackCommandID = "opencode-component-updater.rollback";
// Ordinary upgrade never updates the updater, so offering it would repeat forever.
const selfUpdateID = "plugin.opencode-component-updater";

function upgradableComponents(snapshot) {
  return snapshot.components.filter((item) => item.id !== selfUpdateID && item.status === "update-available");
}

function notify(context, message, variant = "info") {
  context.ui.toast.show({ message, variant });
}

export function binaryName() {
  return process.env.OPENCODE_COMPONENT_UPDATER_BIN
    || `${process.env.HOME || process.env.USERPROFILE}/.local/bin/opencode-component-updater`;
}

function binaryEnv(pluginRoot) {
  if (!pluginRoot || process.env.OPENCODE_COMPONENT_UPDATER_PLUGIN_DIR) return process.env;
  return { ...process.env, OPENCODE_COMPONENT_UPDATER_PLUGIN_DIR: pluginRoot };
}

export function runBinaryCheck({ binary = binaryName(), pluginRoot } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["check", "--quiet"], {
      detached: false,
      shell: false,
      stdio: "ignore",
      windowsHide: true,
      env: binaryEnv(pluginRoot),
    });
    child.once("error", reject);
    child.once("close", (code) => (code === 0 ? resolve() : reject(new Error(`${binary} check exited ${code}`))));
  });
}

// runBinary streams one mutating command and resolves with its exit code.
export function runBinary({ binary = binaryName(), args, pluginRoot, onLine = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      detached: false,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: binaryEnv(pluginRoot),
    });
    let buffered = "";
    const consume = (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) onLine(trimmed);
      }
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    child.once("error", reject);
    child.once("close", (code) => {
      const trimmed = buffered.trim();
      if (trimmed) onLine(trimmed);
      resolve(code ?? 1);
    });
  });
}

async function reloadLocations(context) {
  try {
    await context.client.location.reload()
    return true
  } catch (error) {
    notify(context, `Reload failed: ${error instanceof Error ? error.message : String(error)}`, "warning")
    return false
  }
}

async function showStatus(context, paths, readSnapshot, monitorError) {
  const snapshot = await readSnapshot({ paths })
  const options = snapshot.components.map((item) => ({
    title: `${item.id}  ${item.status}`,
    value: item.id,
    description: item.summary,
  }))
  if (options.length === 0) {
    await context.ui.dialog.alert({ title: "Component Status", message: "No components are configured." })
    return
  }
  const selected = await context.ui.dialog.select({
    title: "Component Status",
    placeholder: "Select a component",
    options,
  })
  if (!selected) return
  const item = snapshot.components.find((entry) => entry.id === selected)
  if (!item) return
  await context.ui.dialog.alert({ title: item.id, message: formatStatusDetail(item, { monitorError }) })
}

async function runUpgrade(context, paths, runCommand, readSnapshot) {
  const snapshot = await readSnapshot({ paths })
  const available = upgradableComponents(snapshot)
  const detail = available.length === 0
    ? "No cached updates. The updater re-checks every component before applying."
    : `Updates available:\n${available.map((item) => `  ${item.id}  ${item.summary}`).join("\n")}`
  const confirmed = await context.ui.dialog.confirm({
    title: "Upgrade components",
    message: `${detail}\n\nOpenCode stays open. Running sessions continue with fresh services at the next step.`,
    label: { confirm: "Upgrade", cancel: "Cancel" },
  })
  if (!confirmed) return
  const lines = []
  notify(context, "Upgrading components...")
  const code = await runCommand({
    args: ["upgrade", "--allow-running"],
    pluginRoot: paths.pluginRoot,
    onLine: (line) => {
      lines.push(line)
      notify(context, line, "info")
    },
  })
  if (code === 0) {
    await reloadLocations(context)
    notify(context, "Components upgraded and locations reloaded.", "success")
    return
  }
  const tail = lines.slice(-12).join("\n")
  await context.ui.dialog.alert({
    title: code === 4 ? "Upgrade partially completed" : "Upgrade failed",
    message: tail || `Updater exited ${code}.`,
  })
}

async function runRollback(context, paths, runCommand, readSnapshot) {
  const snapshot = await readSnapshot({ paths })
  const applied = snapshot.components.filter((item) => item.cache?.lastApplied)
  if (applied.length === 0) {
    await context.ui.dialog.alert({ title: "Rollback", message: "No component has an applied update to roll back." })
    return
  }
  const selected = await context.ui.dialog.select({
    title: "Rollback component",
    placeholder: "Select a component",
    options: applied.map((item) => ({
      title: item.id,
      value: item.id,
      description: `applied ${new Date(item.cache.lastApplied.appliedAt).toISOString()}`,
    })),
  })
  if (!selected) return
  const componentID = selected.replace(/^[a-z]+\./, "")
  const confirmed = await context.ui.dialog.confirm({
    title: "Restore backup",
    message: `Restore the last backup of ${selected}?`,
    label: { confirm: "Restore", cancel: "Cancel" },
  })
  if (!confirmed) return
  const lines = []
  const code = await runCommand({
    args: ["rollback", componentID, "--allow-running"],
    pluginRoot: paths.pluginRoot,
    onLine: (line) => lines.push(line),
  })
  if (code === 0) {
    await reloadLocations(context)
    notify(context, `${selected} restored.`, "success")
    return
  }
  await context.ui.dialog.alert({
    title: "Rollback failed",
    message: lines.slice(-12).join("\n") || `Updater exited ${code}.`,
  })
}

export function createTuiPlugin({
  pluginRoot,
  readSnapshot = readStatus,
  runCheck = runBinaryCheck,
  runCommand = runBinary,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
} = {}) {
  return async (context) => {
    const paths = resolveUpdaterPaths({ pluginRoot })
    let monitorError = null
    let timer
    let checking = false

    const check = async () => {
      if (checking) return
      checking = true
      try {
        await runCheck({ pluginRoot: paths.pluginRoot })
        monitorError = null
        const snapshot = await readSnapshot({ paths })
        const available = upgradableComponents(snapshot)
        if (available.length) {
          notify(
            context,
            `${available.length} component update${available.length === 1 ? "" : "s"} available`,
            "warning",
          )
        }
      } catch (error) {
        monitorError = error instanceof Error ? error.message : String(error)
      } finally {
        checking = false
      }
    }

    const initial = await readSnapshot({ paths })
    const intervalHours = initial.checkIntervalHours

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: statusCommandID,
          title: "Component Status",
          group: "Component Updater",
          palette: true,
          slash: { name: "component-status" },
          run: () => showStatus(context, paths, readSnapshot, monitorError),
        },
        {
          id: updateCommandID,
          title: "Component Update",
          group: "Component Updater",
          palette: true,
          slash: { name: "component-update" },
          run: () => runUpgrade(context, paths, runCommand, readSnapshot),
        },
        {
          id: rollbackCommandID,
          title: "Component Rollback",
          group: "Component Updater",
          palette: true,
          slash: { name: "component-rollback" },
          run: () => runRollback(context, paths, runCommand, readSnapshot),
        },
      ],
    }))

    void check()
    timer = setIntervalImpl(() => { void check() }, intervalHours * 60 * 60 * 1_000)
    timer.unref?.()
    return () => clearIntervalImpl(timer)
  }
}
