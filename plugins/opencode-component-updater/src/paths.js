import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function resolveUpdaterPaths({ pluginRoot, env = process.env, home = homedir() }) {
  if (!pluginRoot) throw new Error("pluginRoot is required");

  const configHome = env.XDG_CONFIG_HOME || join(home, ".config");
  const stateHome = env.XDG_STATE_HOME || join(home, ".local", "state");
  const opencodeConfigRoot = env.OPENCODE_CONFIG_DIR || join(configHome, "opencode");
  const stateRoot = env.OPENCODE_COMPONENT_UPDATER_STATE_DIR || join(stateHome, "opencode", "component-updater");
  const configPath = env.OPENCODE_COMPONENT_UPDATER_CONFIG || join(opencodeConfigRoot, "component-updater", "components.json");

  return {
    pluginRoot: resolve(pluginRoot),
    opencodeConfigRoot: resolve(opencodeConfigRoot),
    stateRoot: resolve(stateRoot),
    configPath: resolve(configPath),
    statePath: resolve(stateRoot, "state.json"),
    backupRoot: resolve(stateRoot, "backups"),
  };
}
