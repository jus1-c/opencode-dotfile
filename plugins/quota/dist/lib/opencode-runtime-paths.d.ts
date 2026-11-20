export interface OpencodeRuntimeDirs {
    dataDir: string;
    configDir: string;
    cacheDir: string;
    stateDir: string;
}
/**
 * OpenCode 2's global dirs (oc2 packages/util/src/global-roots.ts): one dir per
 * kind on every platform, `$XDG_<KIND>_HOME/opencode` or the XDG default under
 * the home dir. `OPENCODE_CONFIG_DIR` replaces the config dir
 * (oc2 packages/cli/src/index.ts `Global.layerWith({ config })`).
 */
export declare function getOpencodeRuntimeDirs(params?: {
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
}): OpencodeRuntimeDirs;
