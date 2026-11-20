/**
 * One API key resolver for every API-key vendor.
 *
 * Order (first wins): environment variables, then the key OpenCode ends up with from the config
 * files that count for the session's folder (`providers.<id>.settings.apiKey`, or the legacy
 * `provider.<id>.options.apiKey`, with `{env:NAME}` templates), then OpenCode's stored logins.
 * Each vendor's spec is its `apiKey` in `provider-registration.ts`.
 */
import { sanitizeDisplayText } from "./display-sanitize.js";
import { resolveEnvTemplate } from "./env-template.js";
import { asRecord, isRecord } from "./json-guards.js";
import { getCredentialDatabasePaths, readActiveCredentialRowsCached, readCredentialRows, } from "./opencode-auth.js";
import { existingOpenCodeConfigFiles, readOpenCodeConfigs, } from "./opencode-config-files.js";
import { QUOTA_PROVIDER_REGISTRATION_SOURCE } from "./provider-registration.js";
/** Each API-key vendor's spec, from its `apiKey` in provider-registration.ts. */
export const API_KEY_VENDORS = Object.fromEntries(QUOTA_PROVIDER_REGISTRATION_SOURCE.flatMap((source) => {
    if (!("apiKey" in source))
        return [];
    const { apiKey } = source;
    return [[source.id, { displayName: source.label, authKeys: apiKey.providerKeys, ...apiKey }]];
}));
/** How long a stored login read stays cached, unless the caller asks for another age. */
const API_KEY_LOGIN_CACHE_MAX_AGE_MS = 5_000;
/** The OpenCode config files that count for `directory`, the one OpenCode ranks highest first. */
async function configsByPriority(directory) {
    return [...(await readOpenCodeConfigs(directory))].reverse();
}
/** The login of the first auth key, in order, that has one among `rows`. */
export function firstLoginRow(rows, authKeys) {
    for (const authKey of authKeys) {
        const row = rows.find((candidate) => candidate.integrationId === authKey);
        if (row)
            return row;
    }
    return undefined;
}
function isMissingOr(value, check) {
    return value === undefined || check(value);
}
function isString(value) {
    return typeof value === "string";
}
function isStringList(value) {
    return Array.isArray(value) && value.every(isString);
}
function isPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
}
function isTimeout(value) {
    return value === false || isPositiveInteger(value);
}
/**
 * Whether OpenCode 2 keeps a legacy `provider.<id>` entry, as its legacy provider schema
 * decides. A field that schema types holding another type (for example `options.apiKey:
 * null`), or malformed `options.headers` or `options.body`, drops the whole entry. The
 * fields inside `models` are not checked.
 */
function isKeptLegacyProvider(entry) {
    if (!isRecord(entry) || !isMissingOr(entry.options, isRecord))
        return false;
    const options = asRecord(entry.options) ?? {};
    return (["api", "name", "id", "npm"].every((field) => isMissingOr(entry[field], isString)) &&
        ["env", "whitelist", "blacklist"].every((field) => isMissingOr(entry[field], isStringList)) &&
        ["apiKey", "baseURL", "enterpriseUrl"].every((field) => isMissingOr(options[field], isString)) &&
        isMissingOr(options.setCacheKey, (value) => typeof value === "boolean") &&
        isMissingOr(options.timeout, isTimeout) &&
        isMissingOr(options.headerTimeout, isTimeout) &&
        isMissingOr(options.chunkTimeout, isPositiveInteger) &&
        isMissingOr(options.headers, (headers) => isRecord(headers) && Object.values(headers).every(isString)) &&
        isMissingOr(options.body, isRecord));
}
/**
 * Read one provider's settings the way OpenCode 2 normalizes its config.
 *
 * A native `providers.<id>` entry replaces the legacy `provider.<id>` entry,
 * whose `options` OpenCode 2 migrates into `settings` unless it drops the entry.
 */
export function getProviderConfigSettings(config, providerKey) {
    const root = asRecord(config);
    const nativeProvider = asRecord(root?.providers)?.[providerKey];
    // Any object here, even a malformed array, replaces the legacy entry.
    if (typeof nativeProvider === "object" && nativeProvider !== null) {
        return asRecord(nativeProvider.settings);
    }
    const legacyProvider = asRecord(root?.provider)?.[providerKey];
    return isKeptLegacyProvider(legacyProvider) ? asRecord(legacyProvider.options) : null;
}
/**
 * One provider setting as OpenCode ends up with it: the value in the first of `configs` (the
 * one OpenCode ranks highest first) that has the setting. Like OpenCode's `mergeOverlay`, any
 * value there wins, so a `null` or `""` in a closer file clears the setting of every lower file.
 * Undefined when no file has it.
 */
function effectiveProviderSetting(configs, providerKey, settingKey) {
    for (const { path, config } of configs) {
        const value = getProviderConfigSettings(config, providerKey)?.[settingKey];
        if (value !== undefined)
            return { path, value };
    }
    return undefined;
}
/**
 * Read one provider string setting from the OpenCode config files that count for `directory`:
 * the value OpenCode ends up with, when it is a non-empty string.
 */
export async function readProviderConfigString(providerKey, settingKey, directory) {
    const value = effectiveProviderSetting(await configsByPriority(directory), providerKey, settingKey)?.value;
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
/**
 * The key of the first provider id, in order, whose `apiKey` as OpenCode ends up with it is
 * usable. A cleared key, or an `{env:…}` template the vendor may not fill in, is none for its id.
 */
function extractConfigApiKey(configs, spec) {
    for (const providerKey of spec.providerKeys) {
        const setting = effectiveProviderSetting(configs, providerKey, "apiKey");
        if (typeof setting?.value !== "string" || setting.value.trim().length === 0)
            continue;
        const key = resolveEnvTemplate(setting.value.trim(), spec.envVars);
        if (key) {
            return { key, source: setting.path.endsWith(".jsonc") ? "opencode.jsonc" : "opencode.json" };
        }
    }
    return null;
}
/** Environment variables, then the OpenCode config files that count for `directory`. */
export async function resolveApiKeyFromEnvAndConfig(spec, directory) {
    for (const name of spec.envVars) {
        const value = process.env[name]?.trim();
        if (value)
            return { key: value, source: `env:${name}` };
    }
    return extractConfigApiKey(await configsByPriority(directory), spec);
}
/** Env vars that are set and the OpenCode config files for `directory` that exist (no values). */
export function getApiKeyCheckedPaths(spec, directory) {
    return [
        ...spec.envVars.filter((name) => process.env[name] !== undefined).map((name) => `env:${name}`),
        ...existingOpenCodeConfigFiles(directory),
    ];
}
function loginReadOptions(spec) {
    return {
        integrationIds: spec.authKeys ?? spec.providerKeys,
        ...(spec.keyLoginsOnly ? { methods: ["key"] } : {}),
    };
}
/** The first stored login among `authKeys` that is a usable API key; others are skipped. */
function extractStoredApiKey(rows, authKeys) {
    for (const authKey of authKeys) {
        const value = rows.find((row) => row.integrationId === authKey)?.value;
        const key = value?.key;
        if (value?.type === "api" && typeof key === "string" && key.trim().length > 0) {
            return key.trim();
        }
    }
    return null;
}
export async function resolveApiKey(spec, directory) {
    const fromEnvOrConfig = await resolveApiKeyFromEnvAndConfig(spec, directory);
    if (fromEnvOrConfig)
        return fromEnvOrConfig;
    const { integrationIds, ...options } = loginReadOptions(spec);
    const rows = await readCredentialRows(integrationIds, { ...options, firstOnly: true });
    const key = extractStoredApiKey(rows, spec.authKeys ?? spec.providerKeys);
    return key ? { key, source: "opencode.db" } : null;
}
/** The vendor's stored login that decides: the active one of its first auth key (cached 5 s). */
export async function readApiKeyLoginRow(spec) {
    const rows = await readActiveCredentialRowsCached({
        maxAgeMs: API_KEY_LOGIN_CACHE_MAX_AGE_MS,
        ...loginReadOptions(spec),
    });
    return firstLoginRow(rows, spec.authKeys);
}
/** A stored login as an API key: `none` without one, `invalid` when it is not a usable key. */
export function parseApiKeyLogin(spec, row) {
    if (!row)
        return { state: "none" };
    if (row.resolveError !== undefined) {
        return { state: "invalid", error: `OpenCode could not read this login: ${row.resolveError}` };
    }
    const { type, key } = row.value;
    if (typeof type !== "string") {
        return {
            state: "invalid",
            error: `${spec.displayName} auth entry present but type is missing or invalid`,
        };
    }
    if (type !== "api") {
        const sanitized = sanitizeDisplayText(type).replace(/\s+/g, " ").trim();
        return {
            state: "invalid",
            error: spec.unsupportedTypeError ??
                `Unsupported ${spec.displayName} auth type: "${(sanitized || "unknown").slice(0, 120)}"`,
        };
    }
    const apiKey = typeof key === "string" ? key.trim() : "";
    return apiKey
        ? { state: "configured", apiKey }
        : { state: "invalid", error: `${spec.displayName} auth entry present but key is empty` };
}
export async function resolveApiKeyLoginWithDiagnostics(spec, directory) {
    const fromEnvOrConfig = await resolveApiKeyFromEnvAndConfig(spec, directory);
    const auth = fromEnvOrConfig
        ? { state: "configured", apiKey: fromEnvOrConfig.key }
        : parseApiKeyLogin(spec, await readApiKeyLoginRow(spec));
    const paths = {
        checkedPaths: getApiKeyCheckedPaths(spec, directory),
        credentialDatabasePaths: getCredentialDatabasePaths(),
    };
    if (auth.state === "none")
        return { auth, diagnostics: { state: "none", source: null, ...paths } };
    if (auth.state === "invalid") {
        return {
            auth,
            diagnostics: { state: "invalid", source: "opencode.db", error: auth.error, ...paths },
        };
    }
    return {
        auth,
        diagnostics: {
            state: "configured",
            source: fromEnvOrConfig?.source ?? "opencode.db",
            ...paths,
        },
    };
}
export async function resolveApiKeyLogin(spec, directory) {
    const fromEnvOrConfig = await resolveApiKeyFromEnvAndConfig(spec, directory);
    if (fromEnvOrConfig)
        return { state: "configured", apiKey: fromEnvOrConfig.key };
    return parseApiKeyLogin(spec, await readApiKeyLoginRow(spec));
}
export async function getApiKeyLoginDiagnostics(spec, directory) {
    return (await resolveApiKeyLoginWithDiagnostics(spec, directory)).diagnostics;
}
/**
 * Every key login of the vendor stored in OpenCode, in OpenCode's order, with what each one
 * holds. `selectRows` narrows the logins further, for example to drop alias duplicates.
 */
export async function readKeyLogins(spec, options = {}) {
    const vendorRows = (await readCredentialRows(spec.authKeys, { methods: ["key"] })).filter((row) => spec.authKeys.includes(row.integrationId));
    const rows = options.selectRows ? options.selectRows(vendorRows) : vendorRows;
    return rows.flatMap((row) => {
        const auth = parseApiKeyLogin(spec, row);
        if (auth.state === "none")
            return [];
        if (auth.state === "invalid" && spec.skipBrokenLogins)
            return [];
        return [{ row, auth }];
    });
}
export async function readVendorKeys(spec, directory, options = {}) {
    const envOrConfig = await resolveApiKeyFromEnvAndConfig(spec, directory);
    if (envOrConfig)
        return { envOrConfig, logins: [], broken: null };
    const logins = await readKeyLogins(spec, options);
    if (logins.length > 0 || spec.skipBrokenLogins)
        return { envOrConfig, logins, broken: null };
    const first = parseApiKeyLogin(spec, await readApiKeyLoginRow(spec));
    return { envOrConfig, logins, broken: first.state === "invalid" ? first.error : null };
}
/** True when the vendor has a key to check, or a broken login to show. */
export function hasVendorKey(keys) {
    return keys.envOrConfig !== null || keys.logins.length > 0 || keys.broken !== null;
}
//# sourceMappingURL=api-key-resolver.js.map