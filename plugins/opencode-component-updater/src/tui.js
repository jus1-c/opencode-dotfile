import { spawn } from "node:child_process";
import { formatStatusDetail, readStatus } from "./status.js";
import { resolveUpdaterPaths } from "./paths.js";

function showAlert(api, title, message) {
  api.ui.dialog.replace(() => api.ui.DialogAlert({ title, message }));
}

function showStatus(api, paths, readSnapshot, monitorError) {
  void readSnapshot({ paths }).then((snapshot) => {
    const options = snapshot.components.map((item) => ({
      title: `${item.id}  ${item.status}`,
      value: item.id,
      description: item.summary,
      onSelect: () => showAlert(api, item.id, formatStatusDetail(item, { monitorError })),
    }));
    api.ui.dialog.replace(() => api.ui.DialogSelect({
      title: "Component Status",
      placeholder: "Select a component",
      options,
    }));
  }).catch((error) => showAlert(api, "Component Status", String(error)));
}

export function runBinaryCheck({ binary = process.env.OPENCODE_COMPONENT_UPDATER_BIN || "opencode-component-updater", pluginRoot } = {}) {
  return new Promise((resolve, reject) => {
    const env = pluginRoot && !process.env.OPENCODE_COMPONENT_UPDATER_PLUGIN_DIR
      ? { ...process.env, OPENCODE_COMPONENT_UPDATER_PLUGIN_DIR: pluginRoot }
      : process.env;
    const child = spawn(binary, ["check", "--quiet"], { detached: false, shell: false, stdio: "ignore", windowsHide: true, env });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`${binary} check exited ${code}`)));
  });
}

export function createTuiPlugin({
  pluginRoot,
  readSnapshot = readStatus,
  runCheck = runBinaryCheck,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
} = {}) {
  return async (api) => {
    const paths = resolveUpdaterPaths({ pluginRoot });
    let monitorError = null;
    let timer;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        await runCheck({ pluginRoot: paths.pluginRoot });
        monitorError = null;
        const snapshot = await readSnapshot({ paths });
        const available = snapshot.components.filter((item) => item.status === "update-available");
        if (available.length) {
          api.ui.toast({
            title: "Component updates",
            message: `${available.length} component update${available.length === 1 ? "" : "s"} available`,
            variant: "warning",
          });
        }
      } catch (error) {
        monitorError = error instanceof Error ? error.message : String(error);
      } finally {
        checking = false;
      }
    };
    const initial = await readSnapshot({ paths });
    const intervalHours = initial.checkIntervalHours;
    api.keymap.registerLayer({
      commands: [
        {
          name: "component-updater.status",
          title: "Component Status",
          category: "Plugin",
          namespace: "palette",
          slashName: "component_status",
          run: () => showStatus(api, paths, readSnapshot, monitorError),
        },
      ],
    });
    void check();
    timer = setIntervalImpl(() => { void check(); }, intervalHours * 60 * 60 * 1_000);
    timer.unref?.();
    api.lifecycle.onDispose(() => clearIntervalImpl(timer));
  };
}
