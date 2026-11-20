import { readFile } from "fs/promises";
import { dedupeNonEmptyStrings, extractPluginSpecsFromParsedConfig, extractProviderIdsFromParsedConfig, } from "./config-file-utils.js";
import { isRecord } from "./json-guards.js";
import { applyConfigDocumentEdit, ConfigDocumentError, parseConfigDocument, planConfigDocumentEdit, } from "./opencode-config-editor.js";
import { globalConfigWriteTarget, readOpenCodeConfigs, } from "./opencode-config-files.js";
import { getCanonicalQuotaProviderId, getQuotaProviderRuntimeIds, normalizeQuotaProviderId, } from "./provider-metadata.js";
const COMPANION_PLUGIN_PROVIDER_IDS = [
    { providerId: "google-gemini-cli", matches: ["opencode-gemini-auth"] },
    { providerId: "cursor", matches: ["cursor-opencode-provider"] },
];
function mergeOpenCodeConfig(base, next) {
    const merged = { ...base, ...next };
    if (isRecord(base.provider) || isRecord(next.provider)) {
        merged.provider = {
            ...(isRecord(base.provider) ? base.provider : {}),
            ...(isRecord(next.provider) ? next.provider : {}),
        };
    }
    if (isRecord(base.providers) || isRecord(next.providers)) {
        merged.providers = {
            ...(isRecord(base.providers) ? base.providers : {}),
            ...(isRecord(next.providers) ? next.providers : {}),
        };
    }
    if (Array.isArray(base.plugin) || Array.isArray(next.plugin)) {
        merged.plugin = [
            ...(Array.isArray(base.plugin) ? base.plugin : []),
            ...(Array.isArray(next.plugin) ? next.plugin : []),
        ];
    }
    if (Array.isArray(base.plugins) || Array.isArray(next.plugins)) {
        merged.plugins = [
            ...(Array.isArray(base.plugins) ? base.plugins : []),
            ...(Array.isArray(next.plugins) ? next.plugins : []),
        ];
    }
    return merged;
}
function inferProviderIdsFromPluginSpecs(specs) {
    const normalizedSpecs = specs.map((spec) => spec.replace(/\\/g, "/").toLowerCase());
    return COMPANION_PLUGIN_PROVIDER_IDS.flatMap(({ providerId, matches }) => normalizedSpecs.some((spec) => matches.some((match) => spec.includes(match)))
        ? [providerId]
        : []);
}
/** Every OpenCode config file that counts for `directory`, merged; see `mergeOpenCodeConfig`. */
async function loadMergedOpenCodeConfig(directory) {
    let config = {};
    for (const document of await readOpenCodeConfigs(directory)) {
        config = mergeOpenCodeConfig(config, document.config);
    }
    return config;
}
/** The providers the OpenCode config files that count for `directory` declare or imply. */
export async function loadConfiguredProviderIds(directory) {
    const config = await loadMergedOpenCodeConfig(directory);
    return dedupeNonEmptyStrings([
        ...extractProviderIdsFromParsedConfig(config),
        ...inferProviderIdsFromPluginSpecs(extractPluginSpecsFromParsedConfig(config)),
    ]);
}
function isDetectedProviderDeclared(providerId, configuredProviderIds) {
    const runtimeIds = getQuotaProviderRuntimeIds(providerId);
    return [providerId, ...runtimeIds].some((id) => configuredProviderIds.has(id));
}
/**
 * Adds providers proven available at runtime, and declared in no OpenCode config file that
 * counts for the session, to the global OpenCode config only; see `globalConfigWriteTarget`.
 */
export async function reconcileDetectedProvidersInGlobalConfig(options) {
    const detectedProviderIds = dedupeNonEmptyStrings(options.detectedProviderIds
        .map((providerId) => normalizeQuotaProviderId(providerId))
        .filter((providerId) => {
        const canonicalId = getCanonicalQuotaProviderId(providerId);
        return Boolean(canonicalId && canonicalId !== "quota-providers");
    }));
    if (detectedProviderIds.length === 0) {
        return { path: null, format: null, addedProviderIds: [], changed: false };
    }
    const effectiveConfig = await loadMergedOpenCodeConfig(options.directory);
    const configuredProviderIds = new Set(extractProviderIdsFromParsedConfig(effectiveConfig));
    const addedProviderIds = detectedProviderIds.filter((providerId) => !isDetectedProviderDeclared(providerId, configuredProviderIds));
    const target = globalConfigWriteTarget();
    if (addedProviderIds.length === 0) {
        return { path: target.path, format: target.format, addedProviderIds, changed: false };
    }
    const raw = target.existed ? await readFile(target.path, "utf8") : "{}\n";
    const root = parseConfigDocument(raw, target.path);
    if (root.provider !== undefined && !isRecord(root.provider)) {
        throw new ConfigDocumentError(`Cannot add detected providers because provider is not an object: ${target.path}`, target.path);
    }
    const provider = isRecord(root.provider) ? { ...root.provider } : {};
    for (const providerId of addedProviderIds) {
        provider[providerId] = {};
    }
    const edit = await planConfigDocumentEdit({
        target,
        desiredData: { ...root, provider },
        managedComments: addedProviderIds.map((providerId) => ({
            path: ["provider", providerId],
            text: `// Detected ${providerId} authentication; opencode-quota added this global provider declaration.`,
        })),
    });
    await applyConfigDocumentEdit(edit);
    return {
        path: target.path,
        format: target.format,
        addedProviderIds,
        changed: edit.changed,
    };
}
//# sourceMappingURL=opencode-config-providers.js.map