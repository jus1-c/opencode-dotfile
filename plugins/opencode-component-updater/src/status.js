import { readJson } from "./json.js";
import { relative, resolve, sep } from "node:path";

const selfUpdateId = "plugin.opencode-component-updater";

function componentIdentity(id, component) {
  return `${component.scope || "global"}:${id}:${component.target || "external"}`;
}

function date(value) {
  return Number.isSafeInteger(value) ? new Date(value).toISOString() : "never";
}

function stateFor(cache) {
  if (cache?.lastGood) return cache.lastGood;
  return cache || {};
}

export function statusForComponent({ id, component, state }) {
  const key = componentIdentity(id, component);
  const cache = state.components?.[key] || {};
  const checked = stateFor(cache);
  if (!component.enabled) return { id, key, component, cache, checked, status: "disabled", summary: "Disabled" };
  if (!checked.status) return { id, key, component, cache, checked, status: "stale", summary: "Not checked" };
  return { id, key, component, cache, checked, status: checked.status, summary: checked.summary || checked.status };
}

function selfUpdateStatus(state) {
  const cache = state.selfUpdate || {};
  const checked = stateFor(cache);
  return {
    id: selfUpdateId,
    key: "updater:self-update",
    component: {
      scope: "updater",
      kind: "updater",
      name: "opencode-component-updater",
      target: checked.source?.root || null,
    },
    cache,
    checked,
    status: checked.status || "stale",
    summary: checked.summary || "Not checked",
  };
}

function overlapsUpdaterTarget(target, pluginRoot) {
  if (typeof target !== "string" || !target || !pluginRoot) return false;
  const left = resolve(target);
  const right = resolve(pluginRoot);
  const within = (root, candidate) => {
    const path = relative(root, candidate);
    return path === "" || (path !== ".." && !path.startsWith(`..${sep}`));
  };
  return within(left, right) || within(right, left);
}

export async function readStatus({ paths }) {
  const [config, state] = await Promise.all([
    readJson(paths.configPath, { defaults: {}, components: {} }),
    readJson(paths.statePath, { components: {} }),
  ]);
  const components = config?.components && typeof config.components === "object" ? config.components : {};
  return {
    state,
    checkIntervalHours: Number.isSafeInteger(config?.defaults?.checkIntervalHours) ? config.defaults.checkIntervalHours : 24,
    components: [
      selfUpdateStatus(state),
      ...Object.entries(components)
        .filter(([id, component]) => id !== selfUpdateId && !overlapsUpdaterTarget(component?.target, paths.pluginRoot))
        .map(([id, component]) => statusForComponent({ id, component, state })),
    ].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function formatStatusDetail(item, { monitorError = null } = {}) {
  const { component, cache, checked } = item;
  const source = checked.source?.type || checked.source?.primary || "not checked";
  return [
    `Component: ${item.id}`,
    `Scope: ${component.scope || "global"}`,
    `Kind: ${component.kind || "unknown"}`,
    `Target: ${component.target || "external/system-managed"}`,
    "",
    `Status: ${item.status}`,
    `Summary: ${item.summary}`,
    `Source: ${source}`,
    `Installed: ${checked.current || "unknown"}`,
    `Cached latest: ${checked.latest || "unknown"}`,
    `Last good check: ${date(checked.checkedAt || checked.lastCheckedAt)}`,
    `Last attempt: ${date(cache.lastAttempt?.checkedAt)}`,
    `Last attempt result: ${cache.lastAttempt?.summary || "none"}`,
    `Last applied: ${date(cache.lastApplied?.appliedAt)}`,
    `Last backup: ${cache.lastApplied?.backup || "none"}`,
    ...(monitorError ? ["", `Automatic check: ${monitorError}`] : []),
  ].join("\n");
}
