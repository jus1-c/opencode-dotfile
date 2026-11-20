import { existsSync } from "fs";
import { dirname, join } from "path";
export function dedupeNonEmptyStrings(items) {
    return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}
export function findGitWorktreeRoot(startDir) {
    let current = startDir;
    while (true) {
        if (existsSync(join(current, ".git"))) {
            return current;
        }
        const parent = dirname(current);
        if (parent === current) {
            return null;
        }
        current = parent;
    }
}
/** Reads the package spec from a legacy `plugin` entry or an OpenCode 2 native `plugins` entry. */
export function getPluginSpecFromEntry(entry) {
    const spec = typeof entry === "string"
        ? entry
        : Array.isArray(entry) && typeof entry[0] === "string"
            ? entry[0]
            : entry &&
                typeof entry === "object" &&
                typeof entry.package === "string"
                ? entry.package
                : null;
    if (typeof spec !== "string") {
        return null;
    }
    const trimmed = spec.trim();
    return trimmed.length > 0 ? trimmed : null;
}
export function extractPluginSpecsFromParsedConfig(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return [];
    }
    const root = parsed;
    const pluginEntries = [];
    if (Array.isArray(root.plugin)) {
        pluginEntries.push(...root.plugin);
    }
    if (Array.isArray(root.plugins)) {
        pluginEntries.push(...root.plugins);
    }
    if (root.tui && typeof root.tui === "object" && !Array.isArray(root.tui)) {
        const tuiRoot = root.tui;
        if (Array.isArray(tuiRoot.plugin)) {
            pluginEntries.push(...tuiRoot.plugin);
        }
    }
    return dedupeNonEmptyStrings(pluginEntries
        .map((entry) => getPluginSpecFromEntry(entry))
        .filter((entry) => typeof entry === "string"));
}
export function extractProviderIdsFromParsedConfig(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return [];
    }
    // OpenCode 2 reads both the legacy `provider` map and the native `providers` map.
    const root = parsed;
    const providerIds = [];
    for (const providerMap of [root.provider, root.providers]) {
        if (providerMap && typeof providerMap === "object" && !Array.isArray(providerMap)) {
            providerIds.push(...Object.keys(providerMap));
        }
    }
    return dedupeNonEmptyStrings(providerIds);
}
//# sourceMappingURL=config-file-utils.js.map