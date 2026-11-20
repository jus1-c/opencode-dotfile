/**
 * The Quota Status report (`/quota_status`, the `quota_status` tool, `opencode-quota status`):
 * the OpenCode version and computer, where the settings come from and which differ from the
 * defaults, what each known provider returned, logins, local files and prices. Every provider
 * section is built the same way from the store's snapshot (state, rows, error, debug details).
 *
 * Users paste this report into public issues, so it is built from a closed vocabulary. Every
 * value it prints is a member of a set this plugin defines (provider ids, row keys, windows,
 * error codes, states, setting keys, the provider's own env variables, folder and file names)
 * or a number, count or time this file formats in its range. Everything else is counted or
 * stands in as a placeholder: "custom 1", "account 2", "(part 1)", "(custom path)", "(out of
 * range)", "3 other details not shown". A debug detail shows only when its key is in its
 * provider's allow list and its value passes that key's rule.
 */
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { classifyError, describeError, errorKind, httpStatus, isQuotaErrorCode, LOCAL_TOOLS, } from "../core/errors.js";
import { isQuotaWindow } from "../core/windows.js";
import { isV5SettingKey } from "../settings/convert.js";
import { defaultSettings, diffSettings, isSettingsGroup, PROVIDER_IDS as SETTINGS_PROVIDER_IDS, SETTINGS_SCHEMA, THEME_COLOR_NAMES, } from "../settings/schema.js";
import { formatShare, formatTokens } from "../view/format.js";
import { COUNT_LABELS } from "./accounting-format.js";
import { ERROR_MESSAGES as ALIBABA_TOKEN_PLAN_ERRORS, NO_QUOTA_DATA_HINT, NO_WINDOW_DATA_HINT, } from "./alibaba.js";
import { API_KEY_VENDORS } from "./api-key-resolver.js";
import { COPILOT_AUTH_KEYS } from "./copilot.js";
import { CURSOR_CANONICAL_PLUGIN_PACKAGE } from "./cursor-detection.js";
import { sanitizeSingleLineDisplayText } from "./display-sanitize.js";
import { AGY_AUTH_KEYS } from "./google-agy.js";
import { GEMINI_CLI_AUTH_KEYS } from "./google-gemini-cli.js";
import { replaceHomeDirWithTilde } from "./home-dir-display.js";
import { describePriceList, } from "./modelsdev-pricing.js";
import { OPENAI_AUTH_SOURCE_KEYS } from "./openai.js";
import { getOpenCodeDbPath } from "./opencode-db-path.js";
import { getOpencodeRuntimeDirs } from "./opencode-runtime-paths.js";
import { getOpenCodeDbStats } from "./opencode-storage.js";
import { MEMBER_BUDGET_NOTE } from "./opencode-zen.js";
import { getQuotaProviderDisplayLabel, PROVIDER_ROW_KEYS, QUOTA_PROVIDER_CATALOG, QUOTA_PROVIDER_RUNTIME_IDS, } from "./provider-metadata.js";
import { getPackageVersion } from "./version.js";
/** Rows listed per provider section; the rest are counted. */
const ROW_LIST_LIMIT = 8;
/** Models without a price listed in the pricing section; the rest are counted. */
const UNPRICED_LIST_LIMIT = 5;
/** Shown for a path outside the known folders, or with a part this plugin did not name. */
const CUSTOM_PATH = "(custom path)";
const PROVIDER_IDS = new Set(Object.keys(QUOTA_PROVIDER_CATALOG));
/** The provider ids OpenCode uses for them ("github-copilot", "codex", …), and theirs. */
const OPENCODE_PROVIDER_IDS = new Set([
    ...PROVIDER_IDS,
    ...Object.values(QUOTA_PROVIDER_RUNTIME_IDS).flat(),
]);
const CURRENCIES = new Set(Intl.supportedValuesOf("currency"));
const CREDENTIAL_SOURCE_KINDS = {
    "opencode-integration-api": true,
    sqlite: true,
};
const CREDENTIAL_FAILURE_CATEGORIES = new Set(["refresh_failed", "resolve_empty", "active_failed"]);
/** Folder and file names this plugin and OpenCode use; a shown path is made only of these. */
export const KNOWN_PATH_PARTS = new Set([
    ".config",
    ".local",
    "share",
    "state",
    ".cache",
    "opencode",
    "opencode-quota",
    "quota-providers",
    ".claude",
    "local",
    "bin",
    ".cursor",
    "cursor",
    "Library",
    "Application Support",
    "AppData",
    "Roaming",
    "Local",
]);
/** File names this plugin and OpenCode read or write. */
export const KNOWN_FILE_NAMES = new Set([
    "settings.jsonc",
    "opencode.db",
    "opencode.json",
    "opencode.jsonc",
    "auth.json",
    "cli-config.json",
    ".credentials.json",
    "copilot-quota-token.json",
    "mimo.json",
    "modelsdev-pricing.runtime.min.json",
    "modelsdev-pricing.refresh-state.json",
    "snapshot-v6.json",
    "quota-export.json",
    "google-access-tokens.json",
    "maintainer-announcements-home.json",
    "quota-toast.json",
    "quota-toast.jsonc",
    "claude",
]);
/** Paths outside the home dir this plugin looks at. */
export const KNOWN_ABSOLUTE_PATHS = new Set([
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
]);
/** Where an API key came from, besides an env variable or a path. */
const KEY_FILE_SOURCES = new Set([
    "opencode.json",
    "opencode.jsonc",
    "opencode.db",
]);
/** The providers that read a key or a cookie, by id, and the env variables they read it from. */
const KEY_VENDORS = {
    ...API_KEY_VENDORS,
    openrouter: { envVars: ["OPENROUTER_API_KEY"] },
    cursor: { envVars: ["CURSOR_API_KEY"] },
    xiaomi: { envVars: ["MIMO_USAGE_COOKIE"] },
    "anthropic-api": { envVars: ["ANTHROPIC_CONSOLE_COOKIE"] },
};
const ORIGINS = {
    slash_command: "/quota_status",
    tool: "quota_status tool",
    tui: "TUI Plugin tab",
    cli: "opencode-quota status (CLI)",
};
async function pathExists(path) {
    try {
        await stat(path);
        return true;
    }
    catch {
        return false;
    }
}
function fmtInt(n) {
    return Number.isFinite(n) ? Math.trunc(n).toLocaleString("en-US") : "(none)";
}
/** The times this report prints: from 2000 to 2100. */
const FIRST_DATE_MS = Date.UTC(2000, 0, 1);
const LAST_DATE_MS = Date.UTC(2100, 0, 1);
/** An ISO time from 2000 to 2100, "(none)" for no time, and "(invalid date)" for any other. */
function isoText(ms) {
    if (typeof ms !== "number" || ms === 0)
        return "(none)";
    return ms >= FIRST_DATE_MS && ms < LAST_DATE_MS ? new Date(ms).toISOString() : "(invalid date)";
}
/** An ISO date text ("2026-10-11T00:00:00Z") as `isoText` shows it; other text is no date. */
function dateText(text) {
    return /^\d{4}-\d{2}-\d{2}/u.test(text) ? isoText(Date.parse(text)) : "(invalid date)";
}
/** A whole number from `min` to `max`, else "(out of range)": a long number is no count. */
function inRange(value, min, max) {
    return Number.isInteger(value) && value >= min && value <= max ? String(value) : "(out of range)";
}
const DAY_MS = 24 * 60 * 60 * 1000;
/** The most days `providers.pricing.autoRefreshDays` shows: a longer wait is no setting. */
const MAX_REFRESH_DAYS = 9999;
/** A time span in ms up to `MAX_REFRESH_DAYS` days, else "(out of range)". */
function msText(ms) {
    return Number.isFinite(ms) && ms >= 0 && ms <= MAX_REFRESH_DAYS * DAY_MS
        ? fmtInt(ms)
        : "(out of range)";
}
/** "2.1.3": the first three numbers of a version, each up to 999; undefined for no version. */
function versionText(value) {
    const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(value);
    if (!match)
        return undefined;
    const parts = match.slice(1, 4).map(Number);
    return parts.every((part) => part <= 999) ? parts.join(".") : "(out of range)";
}
function joinOrNone(values) {
    return values.length > 0 ? values.join(" | ") : "(none)";
}
function kvSection(id, rows) {
    return { title: `${id}:`, rows };
}
function countText(count, one, many) {
    return `${count} ${count === 1 ? one : many}`;
}
/** Hands out 1, 2, 3, … per distinct value, in the order values are first seen. */
function numbering() {
    const seen = [];
    return (value) => {
        if (!seen.includes(value))
            seen.push(value);
        return seen.indexOf(value) + 1;
    };
}
/** The 1-based place of each custom definition id, as the settings section lists them. */
function customNumbers(params) {
    return new Map(params.settings.settings.providers.custom.map((definition, index) => [
        definition.id,
        index + 1,
    ]));
}
/** The path's parts after the home dir ("~" or `homeDir`), or undefined outside it. */
function partsUnderHome(path, homeDir) {
    for (const home of ["~", homeDir]) {
        if (!home)
            continue;
        if (path === home)
            return [];
        const separator = path.charAt(home.length);
        if (path.startsWith(home) && (separator === "/" || separator === "\\")) {
            return path.slice(home.length + 1).split(/[/\\]/u);
        }
    }
    return undefined;
}
/**
 * A path made only of known parts: under the home dir, every folder and file name one this
 * plugin or OpenCode uses ("~/.config/opencode/opencode-quota/settings.jsonc"), or a known
 * absolute path. Any other path, such as one from an env variable or the settings, shows as
 * "(custom path)", with its file name when that is a known one.
 */
function pathText(raw, homeDir) {
    const path = sanitizeSingleLineDisplayText(raw);
    if (KNOWN_ABSOLUTE_PATHS.has(path))
        return path;
    const parts = partsUnderHome(path, sanitizeSingleLineDisplayText(homeDir));
    const known = (part) => KNOWN_PATH_PARTS.has(part) || KNOWN_FILE_NAMES.has(part);
    if (parts?.every(known))
        return ["~", ...parts].join("/");
    const fileName = path.split(/[/\\]/u).at(-1) ?? "";
    return KNOWN_FILE_NAMES.has(fileName) ? `${CUSTOM_PATH}/${fileName}` : CUSTOM_PATH;
}
/** A path with the "(experimental.quotaToast)" note v5 conversion adds to a source. */
function sourceFileText(source, homeDir) {
    const note = " (experimental.quotaToast)";
    return source.endsWith(note)
        ? `${pathText(source.slice(0, -note.length), homeDir)}${note}`
        : pathText(source, homeDir);
}
/**
 * The session's model as "openai/gpt-5": ids OpenCode or the shipped price list knows, else a
 * placeholder. A downloaded price list is a file on this machine, so its ids are not trusted.
 */
function currentModelText(params, priceList) {
    const { sessionModel } = params;
    if (!sessionModel)
        return "(no session)";
    const { id: currentModel, providerID: currentProviderID } = sessionModel;
    if (currentModel) {
        const provider = currentProviderID === undefined
            ? "(unknown provider)"
            : OPENCODE_PROVIDER_IDS.has(currentProviderID) ||
                priceList.bundledProviderIds.has(currentProviderID)
                ? currentProviderID
                : "(other provider)";
        const model = priceList.bundledModelIds.has(currentModel)
            ? currentModel
            : "(model not in the shipped price list)";
        return `${provider}/${model}`;
    }
    return "(the session has no model yet)";
}
/** Known provider ids joined, and how many others there were. */
function providerIdsText(ids) {
    const known = ids.filter((id) => SETTINGS_PROVIDER_IDS.includes(id));
    const others = ids.length - known.length;
    const text = joinOrNone(known);
    return others > 0 ? `${text} (+${countText(others, "unknown id", "unknown ids")})` : text;
}
/**
 * A custom provider definition as its number, mode and model count: "custom 1 (remote-api,
 * 3 models)". Its id, provider id, URL, key, env variable and model ids are never shown. A
 * switched-off definition says so and where to switch it on.
 */
function customProviderText(definition, number) {
    if (definition.enabled === false) {
        return `custom ${number} off (switch on in /quota_settings → Providers)`;
    }
    const mode = definition.mode === "remote-api" ? "remote-api" : "local-estimate";
    const models = definition.modelIds
        ? countText(definition.modelIds.length, "model", "models")
        : "all models";
    return `custom ${number} (${mode}, ${models})`;
}
function settingsFileText(params, homeDir) {
    const { exists } = params.settings;
    const path = pathText(params.settings.path, homeDir);
    if (exists)
        return `${path} (exists)`;
    if (params.conversion)
        return `${path} (missing; the v5 settings are converted in memory)`;
    return `${path} (missing; using the defaults)`;
}
/** Our words for a settings issue, chosen by its message; never the value it names. */
const ISSUE_CODES = [
    [/^expected one JSON object/u, "not one JSON object; using the defaults"],
    [/^expected /u, "invalid value"],
    [/^unknown provider id/u, "unknown provider id"],
    [/^duplicate key/u, "duplicate key"],
    [/^cannot read it/u, "cannot read the file; using the defaults"],
    [/^file-only/u, "file-only setting"],
];
function issueCodeText(message) {
    const line = /^syntax error on line (\d+)/u.exec(message)?.[1];
    if (line !== undefined)
        return `syntax error on line ${inRange(Number(line), 1, 9999)}`;
    return codeOf(ISSUE_CODES, message) ?? "invalid";
}
function codeOf(codes, text) {
    return codes.find(([pattern]) => pattern.test(text))?.[1];
}
/** Our code for each v5 conversion note, chosen by its words; never the paths it names. */
const CONVERSION_NOTE_CODES = [
    [/ does not parse as a JSON object, so it was not converted$/u, "file_not_a_json_object"],
    [/ was not converted: v5 used .+ when both exist$/su, "jsonc_used_over_json"],
    [/^experimental\.quotaToast in .+ v5 ignored it while /su, "quota_toast_block_ignored"],
    [/ does not parse, so its experimental\.quotaToast was not converted$/u, "config_not_parsed"],
    [/^the old settings in .+ were not converted: .+ has some too$/su, "older_folder_not_converted"],
];
/** A settings key from the schema, a group, a file-level key, or the custom providers. */
function issueKeyText(key) {
    if (Object.hasOwn(SETTINGS_SCHEMA, key) || isSettingsGroup(key))
        return key;
    if (key === "$file" || key === "$patch" || key === "$conversion")
        return key;
    if (key.startsWith("providers.custom[") || key.startsWith("providers.custom.")) {
        return "providers.custom";
    }
    return undefined;
}
/** Each issue as our key and words; unknown keys are counted. */
function settingsIssueRows(issues) {
    const rows = [];
    let unknownKeys = 0;
    for (const issue of issues) {
        const key = issueKeyText(issue.key);
        if (key === undefined || issue.message.startsWith("unknown setting")) {
            unknownKeys += 1;
            continue;
        }
        rows.push({ key: "settings_issue", value: `${key}: ${issueCodeText(issue.message)}` });
    }
    if (unknownKeys > 0) {
        rows.push({
            key: "settings_issue",
            value: countText(unknownKeys, "unknown key", "unknown keys"),
        });
    }
    return rows;
}
/** v5 keys joined, and how many unknown keys there were: "showOnIdle, debug (+1 unknown key)". */
function v5KeysText(keys) {
    // "quotaProviders[0].url" is a problem inside the v5 key "quotaProviders".
    const bases = keys.map((key) => key.replace(/\[.*$/su, ""));
    const known = [...new Set(bases.filter(isV5SettingKey))];
    const others = bases.filter((key) => !isV5SettingKey(key)).length;
    const text = known.join(", ");
    if (others === 0)
        return text;
    const count = countText(others, "unknown key", "unknown keys");
    return text ? `${text} (+${count})` : count;
}
/** Where the v5 settings went: written to settings.jsonc, or not. Only v5 keys are named. */
function conversionRows(conversion, homeDir) {
    const { converted, dropped, invalid } = conversion;
    const sources = conversion.sources.map((source) => sourceFileText(source, homeDir));
    const counts = `${converted.length} converted, ${dropped.length} dropped, ${invalid.length} invalid`;
    const outcome = conversion.written
        ? "written to settings.jsonc"
        : conversion.notWrittenReason !== undefined
            ? "not written"
            : "converted in memory";
    const rows = [
        { key: "conversion", value: `from ${joinOrNone(sources)} (${counts}); ${outcome}` },
    ];
    const lists = [
        ["conversion_converted", converted],
        ["conversion_dropped", dropped],
        ["conversion_invalid", invalid],
    ];
    for (const [key, items] of lists) {
        if (items.length > 0)
            rows.push({ key, value: v5KeysText(items.map((item) => item.key)) });
    }
    if (conversion.notes.length > 0) {
        const codes = conversion.notes.map((note) => codeOf(CONVERSION_NOTE_CODES, note) ?? "(other)");
        rows.push({ key: "conversion_notes", value: codes.join(", ") });
    }
    return rows;
}
/** Settings with rows of their own (the off list, custom definitions) or no setting (version). */
const OWN_ROW_KEYS = new Set(["version", "providers.off", "providers.custom"]);
/** The separators the Settings tab steps through. */
const SEPARATORS = new Set([" · ", " | ", " / ", "  "]);
/**
 * A changed setting's value in this report's words: a switch, choice, number or color as it is,
 * a list or map as its count, a path as a known path; never a name or text the user typed.
 */
function settingValueText(rule, value, homeDir) {
    if (value === null)
        return "null";
    switch (rule.kind) {
        case "boolean":
            return value === true ? "true" : "false";
        case "choice":
            return rule.values.includes(String(value)) ? String(value) : "(other)";
        case "number": {
            if (rule.word !== undefined && value === rule.word)
                return rule.word;
            const rounded = typeof value === "number" ? Number(value.toFixed(2)) : Number.NaN;
            return Number.isFinite(rounded) && Math.abs(rounded) < 1e6
                ? String(rounded)
                : "(out of range)";
        }
        case "path":
            return typeof value === "string" ? pathText(value, homeDir) : CUSTOM_PATH;
        case "color":
            if (typeof value === "string" && THEME_COLOR_NAMES.includes(value))
                return value;
            return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value)
                ? "(custom color)"
                : "(color)";
        case "separator":
            return typeof value === "string" && SEPARATORS.has(value)
                ? JSON.stringify(value)
                : "(custom separator)";
        default: {
            const count = Array.isArray(value)
                ? value.length
                : typeof value === "object"
                    ? Object.keys(value ?? {}).length
                    : 1;
            return countText(count, "entry", "entries");
        }
    }
}
/**
 * Every setting that differs from its default, by its settings.jsonc key, under a count; the
 * request timeout too when the file sets it, since unset it is each provider's own.
 */
function changedSettingRows(loaded, homeDir) {
    const changes = diffSettings(defaultSettings(), loaded.settings, {
        before: [],
        after: loaded.fromFile,
    }).filter((change) => !OWN_ROW_KEYS.has(change.key));
    const rules = SETTINGS_SCHEMA;
    return [
        {
            key: "changed_from_defaults",
            value: changes.length > 0 ? countText(changes.length, "setting", "settings") : "(none)",
        },
        ...changes.flatMap((change) => {
            const rule = rules[change.key];
            if (!rule)
                return [];
            return [{ key: change.key, value: settingValueText(rule, change.after, homeDir), indent: 1 }];
        }),
    ];
}
/** OpenCode release channels this report names; a build's own channel name is not shown. */
const OPENCODE_CHANNELS = new Set([
    "latest",
    "beta",
    "next",
    "nightly",
    "preview",
    "canary",
    "dev",
    "local",
    "snapshot",
]);
/**
 * When and where the report was made, and what it ran on: OpenCode's version and release
 * channel, the system and CPU, and the JavaScript runtime.
 */
function environmentSection(params, nowMs) {
    const opencode = params.opencode
        ? `${versionText(params.opencode.version) ?? "(unknown version)"} (${OPENCODE_CHANNELS.has(params.opencode.channel) ? params.opencode.channel : "other channel"})`
        : "(unknown)";
    const bun = process.versions.bun;
    const runtime = bun
        ? `bun ${versionText(bun) ?? "(unknown version)"}`
        : `node ${versionText(process.versions.node) ?? "(unknown version)"}`;
    return kvSection("environment", [
        { key: "generated_at", value: isoText(nowMs) },
        { key: "origin", value: ORIGINS[params.origin] },
        { key: "opencode", value: opencode },
        { key: "os", value: `${process.platform} ${process.arch}` },
        { key: "runtime", value: runtime },
    ]);
}
/** The settings file, what is wrong in it, the v5 conversion, and what quota is set to do. */
function settingsSection(params, priceList, homeDir) {
    const rows = [
        { key: "settings_file", value: settingsFileText(params, homeDir) },
        ...settingsIssueRows(params.settings.issues),
    ];
    if (params.conversion)
        rows.push(...conversionRows(params.conversion, homeDir));
    if (params.settings.notRead.length > 0) {
        const paths = params.settings.notRead.map((path) => sourceFileText(path, homeDir));
        rows.push({ key: "not_read", value: joinOrNone(paths) });
    }
    const { providers } = params.settings.settings;
    rows.push({ key: "providers.off", value: providerIdsText(providers.off) }, ...changedSettingRows(params.settings, homeDir), { key: "current_model", value: currentModelText(params, priceList) }, { key: "workspace_root", value: pathText(params.workspaceRoot, homeDir) });
    providers.custom.forEach((definition, index) => {
        rows.push({ key: "providers.custom", value: customProviderText(definition, index + 1) });
    });
    return kvSection("settings", rows);
}
function providerIdText(id) {
    return PROVIDER_IDS.has(id) ? id : "(other provider)";
}
function providerListSection(availability) {
    return kvSection("providers", availability.map((provider) => {
        const bits = [
            provider.enabled ? "enabled" : "disabled",
            provider.available ? "available" : "unavailable",
        ];
        if (provider.matchesCurrentModel !== undefined) {
            bits.push(`matchesCurrentModel=${provider.matchesCurrentModel ? "yes" : "no"}`);
        }
        return { key: providerIdText(provider.id), value: bits.join(" ") };
    }));
}
function noticesSection(announcements) {
    const { summary } = announcements;
    return kvSection("notices", [
        { key: "source", value: summary.source === "bundled_only" ? "bundled_only" : "(other)" },
        { key: "network", value: summary.network ? "true" : "false" },
        { key: "active", value: fmtInt(summary.activeCount) },
        { key: "future", value: fmtInt(summary.futureCount) },
        { key: "expired", value: fmtInt(summary.expiredCount) },
    ]);
}
async function pathsSection(homeDir) {
    const dirs = getOpencodeRuntimeDirs();
    const dbPath = getOpenCodeDbPath();
    const shownDb = pathText(dbPath, homeDir);
    let db = `path=${shownDb} present=false`;
    if (await pathExists(dbPath)) {
        const stats = await getOpenCodeDbStats();
        db = `path=${shownDb} present=true sessions=${fmtInt(stats.sessionCount)} messages=${fmtInt(stats.messageCount)} assistant_messages=${fmtInt(stats.assistantMessageCount)}`;
    }
    const dir = (path) => pathText(path, homeDir);
    return kvSection("paths", [
        {
            key: "opencode_dirs",
            value: `data=${dir(dirs.dataDir)} config=${dir(dirs.configDir)} cache=${dir(dirs.cacheDir)} state=${dir(dirs.stateDir)}`,
        },
        { key: "opencode.db", value: `${db} (session and token history)` },
    ]);
}
/**
 * The login source and its failures: each failed login's integration id (when OpenCode or this
 * plugin knows it), failure kind and time, never its label or the error's own words.
 */
function credentialSourceSection(diagnostics) {
    const failures = diagnostics.failures.map((failure) => {
        const integration = OPENCODE_PROVIDER_IDS.has(failure.integrationId)
            ? failure.integrationId
            : "(other integration)";
        const category = CREDENTIAL_FAILURE_CATEGORIES.has(failure.category)
            ? failure.category
            : "(other failure)";
        return `${integration}: ${category} at ${isoText(failure.at)}`;
    });
    const listError = diagnostics.lastListError;
    const listErrorText = listError
        ? `${errorKind(classifyError(listError.detail))} at ${isoText(listError.at)}`
        : "(none)";
    const source = diagnostics.state === "bound"
        ? Object.hasOwn(CREDENTIAL_SOURCE_KINDS, diagnostics.kind)
            ? diagnostics.kind
            : "(other source)"
        : "unbound";
    return kvSection("credential_source", [
        { key: "source", value: source },
        { key: "list_error", value: listErrorText },
        { key: "failures", value: joinOrNone(failures) },
    ]);
}
const COMPACT = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumSignificantDigits: 3,
});
/** A decimal in three significant digits ("4.5", "1.23K", "123T"): no long number shows. */
function numberText(decimal) {
    const value = Number(decimal);
    if (!Number.isFinite(value))
        return "(not a number)";
    return Math.abs(value) < 1e15 ? COMPACT.format(value) : "(out of range)";
}
/** "4.5 USD", "12 request"; a unit this plugin does not name shows as a placeholder. */
function amountText(amount) {
    const { unit } = amount;
    let unitText = "(custom unit)";
    if (unit.kind === "currency")
        unitText = CURRENCIES.has(unit.code) ? unit.code : "(currency)";
    else if (unit.kind === "count") {
        unitText = Object.hasOwn(COUNT_LABELS, unit.unit) ? unit.unit : "(unit)";
    }
    return `${numberText(amount.decimal)} ${unitText}`;
}
/**
 * A row's facts in one line, for example "window=five_hour, 43% left, 57/100 request,
 * resets 2026-…". Its label and text are the provider's words: a text value is only noted.
 */
function rowFacts(row) {
    const parts = [];
    if (row.window !== undefined) {
        parts.push(isQuotaWindow(row.window) ? `window=${row.window}` : "window=(other)");
    }
    if (typeof row.percentRemaining === "number") {
        const percent = inRange(Math.round(row.percentRemaining), 0, 100);
        parts.push(percent === "(out of range)" ? "percent (out of range)" : `${percent}% left`);
    }
    if (row.used && row.limit)
        parts.push(`${numberText(row.used.decimal)}/${amountText(row.limit)}`);
    if (row.amount)
        parts.push(amountText(row.amount));
    if (row.flag !== undefined)
        parts.push(row.flag ? "yes" : "no");
    if (row.text !== undefined)
        parts.push("text not shown");
    if (row.resetsAt !== undefined)
        parts.push(`resets ${dateText(row.resetsAt)}`);
    return parts.join(", ");
}
/**
 * A row id from the ledger: the provider id and its row key, each `*` part as "(part 1)" and a
 * custom definition's id as "(custom 1)", numbered like the settings section.
 */
function rowIdText(row, parts, customs) {
    const [providerId = "", ...keyParts] = row.id.split(".");
    if (!PROVIDER_IDS.has(providerId))
        return "(other row)";
    const patterns = PROVIDER_ROW_KEYS[providerId].map((key) => key.split("."));
    const pattern = patterns.find((candidate) => candidate.length === keyParts.length &&
        candidate.every((part, index) => part === "*" || part === keyParts[index]));
    if (!pattern)
        return `${providerId}.(other row)`;
    const shown = pattern.map((part, index) => {
        if (part !== "*")
            return part;
        const value = keyParts[index] ?? "";
        const custom = providerId === "quota-providers" && index === 1 ? customs.get(value) : undefined;
        return custom !== undefined ? `(custom ${custom})` : `(part ${parts(value)})`;
    });
    return [providerId, ...shown].join(".");
}
/**
 * The error in our own words, with its code and HTTP status: "Provider error 503
 * (provider_error, http 503)". A local tool is named only when it is one this plugin knows.
 */
function errorText(error, providerId, nowMs) {
    if (!isQuotaErrorCode(error.code))
        return "(unknown error code)";
    const tool = error.tool !== undefined && LOCAL_TOOLS.includes(error.tool) ? error.tool : undefined;
    // A wait shows in minutes or hours: up to a week.
    const retryAtMs = typeof error.retryAtMs === "number" && error.retryAtMs <= nowMs + 7 * 24 * 60 * 60 * 1000
        ? error.retryAtMs
        : undefined;
    const known = {
        code: error.code,
        status: httpStatus(error.status),
        retryAtMs,
        tool,
        missing: error.missing === true,
    };
    const label = PROVIDER_IDS.has(providerId)
        ? getQuotaProviderDisplayLabel(providerId)
        : "the provider";
    return `${describeError(known, label, nowMs)} (${errorKind(known)})`;
}
/** "ok", or the error in our words; "partial" when rows came with the error. */
function providerState(provider, nowMs) {
    if (provider.checkedAtMs === undefined)
        return provider.refreshing ? "checking" : "not checked";
    const error = provider.error;
    if (!error)
        return "ok";
    const words = errorText(error, provider.providerId, nowMs);
    return provider.rows.length > 0 ? `partial: ${words}` : `error: ${words}`;
}
/** Shown as they are for any allowed key. */
const NO_VALUES = new Set(["(none)", "(unknown)", "unknown"]);
function oneOf(...values) {
    const allowed = new Set(values);
    return (value) => (allowed.has(value) ? value : undefined);
}
/** "a,b" when every item is one of `values`. */
function listOf(values) {
    const allowed = new Set(values);
    return (value) => (value.split(",").every((item) => allowed.has(item)) ? value : undefined);
}
function each(rule, ...keys) {
    return Object.fromEntries(keys.map((key) => [key, rule]));
}
const bool = oneOf("true", "false");
/** An error or message key: that it is set, never its words. */
const present = () => "(text not shown)";
/** An error's text as our code and HTTP status ("provider_error, http 503"), never its words. */
const errorKindOf = (value) => errorKind(classifyError(value));
/** A failed login's kind as rows.ts wrote it ("provider_error, http 503"), checked again. */
const writtenErrorKind = (value) => {
    const match = /^([a-z_]+)(?:, http [1-5]\d{2})?$/u.exec(value);
    return match && isQuotaErrorCode(match[1]) ? value : undefined;
};
/** Why a row was dropped (`validateRows`, `addRow`), never the row's own id. */
const DROPPED_ROW_REASONS = new Set([
    "not an object",
    "wrong provider",
    "no value",
    "repeated row",
    ...[
        "id",
        "label",
        "type",
        "method",
        "authority",
        "prominence",
        "account",
        "window",
        "percentRemaining",
        "used",
        "limit",
        "remaining",
        "amount",
        "flag",
        "text",
        "resetsAt",
        "windowStartedAt",
    ].map((field) => `invalid ${field}`),
]);
const droppedRow = (value) => {
    const reason = value.slice(value.lastIndexOf(": ") + 2);
    return DROPPED_ROW_REASONS.has(reason) ? reason : undefined;
};
/** A name the user chose (an organization, an enterprise): that it is set, never the name. */
const setOrNot = (value) => (value.trim() ? "set" : "not set");
/** A whole number from `min` to `max`, written with or without commas. */
function whole(min, max) {
    return (value) => {
        const plain = value.replaceAll(",", "");
        return /^\d+$/u.test(plain) ? inRange(Number(plain), min, max) : undefined;
    };
}
/** Accounts, models and state versions: a few at most. */
const count = whole(0, 999);
const time = dateText;
/** A month ("2026-10") from 2000 to 2099. */
const month = (value) => {
    if (!/^\d{4}-\d{2}$/u.test(value))
        return undefined;
    return dateText(`${value}-01`) === "(invalid date)" ? "(invalid date)" : value;
};
const version = versionText;
const status = (value) => {
    const shown = httpStatus(Number(value));
    return shown === undefined ? undefined : String(shown);
};
/** A file path, or `env:NAME` for a variable its provider reads (`env:(other)` for any other). */
function pathOrEnv(value, { homeDir, envNames }) {
    if (!value.startsWith("env:"))
        return pathText(value, homeDir);
    return envNames.includes(value.slice(4)) ? value : "env:(other)";
}
/** Paths joined by " | ". */
const pathList = (value, context) => value
    .split(" | ")
    .map((path) => pathOrEnv(path, context))
    .join(" | ");
/** Where an API key came from: `env:NAME`, a config file name, or a path. */
const keySource = (value, context) => KEY_FILE_SOURCES.has(value) ? value : pathOrEnv(value, context);
/** The Claude CLI's arguments this plugin passes. */
const CLAUDE_ARGS = new Set(["--version", "auth", "status", "--json"]);
/** Claude CLI command lines joined by " | ": the program as a path, then known arguments. */
const claudeCommands = (value, { homeDir }) => value
    .split(" | ")
    .map((command) => {
    const words = command.match(/"(?:[^"\\]|\\.)*"|[^\s"]+/gu) ?? [];
    const [program = "", ...args] = words.map((word) => {
        if (!word.startsWith('"'))
            return word;
        try {
            return String(JSON.parse(word));
        }
        catch {
            return "";
        }
    });
    const programText = program === "claude" ? "claude" : pathText(program, homeDir);
    return [programText, ...args.map((arg) => (CLAUDE_ARGS.has(arg) ? arg : "(arg)"))].join(" ");
})
    .join(" | ");
/**
 * A value of `name=value` fields after an optional head word ("yes found=openai,codex"). Every
 * part must pass its rule; a field rule may read the rest of a value (a path list).
 */
function fields(rules, head) {
    const pattern = new RegExp(`(?:^| )(${Object.keys(rules).join("|")})=`, "gu");
    return (value, context) => {
        const matches = [...value.matchAll(pattern)];
        const headText = value.slice(0, matches[0]?.index ?? value.length);
        const shown = [];
        if (headText) {
            const text = head?.(headText, context);
            if (text === undefined)
                return undefined;
            shown.push(text);
        }
        for (const [index, match] of matches.entries()) {
            const name = match[1] ?? "";
            const start = match.index + match[0].length;
            const end = matches[index + 1]?.index ?? value.length;
            const text = ruleValue(rules[name], value.slice(start, end), context);
            if (text === undefined)
                return undefined;
            shown.push(`${name}=${text}`);
        }
        return shown.length > 0 ? shown.join(" ") : undefined;
    };
}
function ruleValue(rule, value, context) {
    if (!rule)
        return undefined;
    return NO_VALUES.has(value) ? value : rule(value, context);
}
/**
 * How a provider that reads an API key (one with env variables) looked for it, as the key
 * resolver writes it, with or without a stored login's state.
 */
const API_KEY_DETAILS = {
    api_key_configured: oneOf("true", "false", "unreadable"),
    api_key_source: keySource,
    ...each(pathList, "api_key_checked_paths", "api_key_credential_database_paths"),
    auth_state: oneOf("none", "configured", "invalid"),
    auth_error: present,
};
const GOOGLE_DETAILS = {
    auth_state: oneOf("missing", "present", "invalid"),
    auth_source: oneOf(...AGY_AUTH_KEYS, ...GEMINI_CLI_AUTH_KEYS),
    ...each(count, "account_count", "valid_account_count"),
    companion_package_state: oneOf("present", "missing", "invalid"),
    companion_package_path: pathList,
    auth_error: present,
};
const CONSOLE_AUTH_STATES = ["none", "configured", "expired", "invalid"];
/** Both plans write the same availability, platform and failure kind, so they share these rules. */
const ALIBABA_PROVIDER_DETAILS = {
    cli_available: bool,
    platform: oneOf(process.platform),
    failure_kind: oneOf(...Object.keys(ALIBABA_TOKEN_PLAN_ERRORS)),
};
/** A Token Plan window that is none of the repo's windows, named by its count and unit: `2_day`.
 * The count is 1 to 999, so the report never prints a long number; a list with any other item
 * is not shown. */
const TOKEN_PLAN_COUNTED_WINDOW_RE = /^[1-9]\d{0,2}_(?:hour|day|week|month)$/u;
/** The windows the Token Plan reply carried: the repo's names for the ones it knows, and the
 * count and unit for the rest. */
const tokenPlanWindows = (value) => value
    .split(",")
    .every((item) => item === "weekly" ||
    item === "monthly" ||
    isQuotaWindow(item) ||
    TOKEN_PLAN_COUNTED_WINDOW_RE.test(item))
    ? value
    : undefined;
const ALIBABA_TOKEN_PLAN_DETAILS = {
    ...ALIBABA_PROVIDER_DETAILS,
    window_hint: oneOf(NO_QUOTA_DATA_HINT, NO_WINDOW_DATA_HINT),
    no_data_windows: tokenPlanWindows,
    seat_windows: listOf(["credits"]),
    seat_failure_kind: oneOf(...Object.keys(ALIBABA_TOKEN_PLAN_ERRORS)),
    windows: tokenPlanWindows,
};
const ALIBABA_CODING_PLAN_DETAILS = {
    ...ALIBABA_PROVIDER_DETAILS,
    windows: listOf(["five_hour", "weekly", "monthly"]),
};
/**
 * The debug details each provider's section may show besides its setup and API-key details,
 * by key; every other one is counted.
 */
const DEBUG_DETAILS = {
    anthropic: {
        ...each(bool, "cli_installed", "quota_supported"),
        cli_version: version,
        binary_path: (value, { homeDir }) => value === "claude (PATH)" ? value : pathText(value, homeDir),
        auth_status: oneOf("authenticated", "unauthenticated", "unknown"),
        quota_source: oneOf("claude-auth-status-json", "claude-credentials-oauth-api", "opencode-auth-oauth-api"),
        oauth_credential_source: oneOf("opencode-auth", "claude-credentials"),
        checked_commands: claudeCommands,
    },
    copilot: {
        pat_state: oneOf("absent", "invalid", "valid"),
        ...each(pathList, "pat_path", "pat_checked_paths"),
        pat_token_kind: oneOf("github_pat", "ghp", "ghu", "ghs", "other"),
        pat_tier: oneOf("free", "student", "pro", "pro+", "max", "business", "enterprise"),
        ...each(setOrNot, "pat_organization", "pat_enterprise"),
        billing_model: oneOf("ai_credits", "legacy_premium_requests"),
        deployment: oneOf("github.com", "ghe.com", "invalid", "none"),
        api_host: (value) => (value === "api.github.com" ? value : "github enterprise (custom host)"),
        ...each(oneOf("pat", "oauth", "none"), "enterprise_host_source", "effective_source"),
        billing_mode: oneOf("user_quota", "organization_usage", "enterprise_usage", "none"),
        billing_scope: oneOf("user", "organization", "enterprise", "none"),
        quota_api: oneOf("github_ai_credit_api", "github_legacy_premium_request_api", "copilot_internal_user", "none"),
        budget_api: oneOf("organization_budgets", "enterprise_budgets", "not_available"),
        billing_api_access_likely: bool,
        remaining_totals_state: oneOf("available", "value_only_without_denominator", "not_available_from_org_usage", "not_available_from_enterprise_usage", "reported_by_copilot_internal_user", "unavailable"),
        billing_period: month,
        oauth_configured: fields({ key: oneOf(...COPILOT_AUTH_KEYS), refresh: bool, access: bool, enterprise_host: bool }, bool),
        oauth_accounting_state: oneOf("available_via_copilot_internal_user", "invalid_enterprise_host", "not_configured"),
        override: oneOf("pat_overrides_oauth", "none"),
    },
    openai: {
        auth_configured: bool,
        auth_source: oneOf(...OPENAI_AUTH_SOURCE_KEYS, ...OPENCODE_PROVIDER_IDS),
        auth_method: oneOf("chatgpt-token-sharing"),
        token_status: oneOf("api key", "failed", "expired", "valid"),
        token_expires_at: time,
    },
    cursor: {
        plan: oneOf("Pro", "Pro Plus", "Ultra", "none"),
        billing_cycle_start_day: (value, context) => value === "(calendar month)" ? value : whole(1, 31)(value, context),
        auth_state: oneOf("missing", "present", "invalid"),
        auth_error: present,
        auth_selected_path: keySource,
        ...each(pathList, "auth_present_paths", "auth_candidate_paths"),
        ...each(pathList, "config_matches", "config_checked_paths"),
        ...each(bool, "plugin_enabled", "provider_configured"),
        canonical_plugin_package: oneOf(CURSOR_CANONICAL_PLUGIN_PACKAGE),
        cycle_source: oneOf("configured_day", "calendar_month"),
        cycle_reset_at: time,
        unknown_cursor_models: count,
    },
    "alibaba-coding-plan": ALIBABA_CODING_PLAN_DETAILS,
    "alibaba-token-plan": ALIBABA_TOKEN_PLAN_DETAILS,
    "google-gemini-cli": GOOGLE_DETAILS,
    "google-agy": GOOGLE_DETAILS,
    openrouter: {},
    commandcode: {},
    zai: {},
    zhipu: {},
    deepseek: {},
    vilao: {
        pat_metadata: oneOf("configured", "(none)"),
        ...each(pathList, "auth_paths", "local_state_path"),
    },
    xai: {},
    "minimax-coding-plan": { api_endpoint: oneOf("international", "china") },
    "minimax-china-coding-plan": { api_endpoint: oneOf("international", "china") },
    "kimi-code-plan-global": { api_endpoint: oneOf("global", "cn") },
    "kimi-code-plan-cn": { api_endpoint: oneOf("global", "cn") },
    xiaomi: {
        config_state: oneOf("none", "configured", "invalid"),
        config_source: keySource,
        config_checked_paths: pathList,
    },
    "opencode-go": {
        console_auth_state: oneOf(...CONSOLE_AUTH_STATES),
        console_error: present,
        go_source: oneOf("console", "legacy_key"),
        opencode_go_state: oneOf("not_subscribed"),
        selected_windows: listOf(["rolling", "weekly", "monthly"]),
    },
    "ollama-cloud": {
        ...each(time, "included_period_from", "included_period_until", "session_resets_at", "weekly_resets_at"),
    },
    opencode: {
        console_auth_state: oneOf(...CONSOLE_AUTH_STATES),
        budget_source: oneOf("member_budget", "credit_limit"),
        member_budget_note: oneOf(MEMBER_BUDGET_NOTE),
        auto_reload: bool,
    },
    "anthropic-api": {
        config_state: oneOf("none", "configured", "invalid"),
        config_source: keySource,
    },
    "quota-providers": {},
};
/**
 * Every section may show whether OpenCode lists the provider ("yes found=openai"), the kind of
 * an error a check noted, and why a row was dropped.
 */
const SETUP_DETAILS = {
    opencode_provider: fields({ found: listOf(OPENCODE_PROVIDER_IDS), looked_for: listOf(OPENCODE_PROVIDER_IDS) }, oneOf("yes", "no", "unreadable")),
    error_kind: writtenErrorKind,
    live_fetch_error: errorKindOf,
    dropped_row: droppedRow,
};
/** A numbered live error ("live_error_1"), shown as its kind like `live_fetch_error`. */
const LIVE_ERROR_KEY = /^live_error_\d{1,2}$/u;
/** A custom definition's check: outcome, login source, files read. */
const CUSTOM_CHECK = fields({
    outcome: oneOf("missing_credential", "success", "http_error", "redirect_error", "timeout", "body_too_large", "invalid_content_type", "invalid_json", "invalid_response", "network_error", "local_read_error"),
    http_status: status,
    credential_source: oneOf("explicit_env", "global_opencode_json", "global_opencode_jsonc", "opencode_db"),
    checked_paths: pathList,
});
/** "custom 2 check" for the debug key of the second custom definition's check. */
function customCheckKey(key, customs) {
    const id = /^custom_(.+)_check$/su.exec(key)?.[1];
    const number = id === undefined ? undefined : customs.get(id);
    return number === undefined ? undefined : `custom ${number} check`;
}
function keyEnvNames(providerId) {
    return Object.hasOwn(KEY_VENDORS, providerId) ? (KEY_VENDORS[providerId]?.envVars ?? []) : [];
}
/**
 * The rules of a provider's debug details: `shared` are the setup details every section has and,
 * for a provider that reads an API key, its key details; `own` are the provider's own.
 */
export function debugDetailRules(providerId) {
    return {
        shared: { ...SETUP_DETAILS, ...(keyEnvNames(providerId).length > 0 ? API_KEY_DETAILS : {}) },
        own: PROVIDER_IDS.has(providerId) ? DEBUG_DETAILS[providerId] : {},
    };
}
/** The debug details the provider's allow list has, and a count of the others. */
function debugRows(provider, customs, homeDir) {
    const id = provider.providerId;
    const { shared, own } = debugDetailRules(id);
    const rules = { ...shared, ...own };
    const context = { homeDir, envNames: keyEnvNames(id) };
    const rows = [];
    let hidden = 0;
    for (const item of provider.debug ?? []) {
        // A failed login's own words: its `error_kind` detail, made with it, shows its kind.
        if (item.key === "error")
            continue;
        const customKey = customCheckKey(item.key, customs);
        const rule = customKey
            ? CUSTOM_CHECK
            : Object.hasOwn(rules, item.key)
                ? rules[item.key]
                : LIVE_ERROR_KEY.test(item.key)
                    ? errorKindOf
                    : undefined;
        const value = ruleValue(rule, item.value, context);
        if (value === undefined)
            hidden += 1;
        else
            rows.push({ key: customKey ?? item.key, value });
    }
    if (hidden > 0) {
        rows.push({ key: countText(hidden, "other detail not shown", "other details not shown") });
    }
    return rows;
}
/**
 * "disabled" (turned off in the settings, never fetched) and "unavailable" (only local setup
 * details) win over the state of a check. With no provider off none is disabled; else
 * `availability.enabled` says whether the provider is on.
 */
function sectionState(availability, provider, off, nowMs) {
    if (off.length > 0 && !availability.enabled)
        return "disabled";
    if (!availability.available)
        return "unavailable";
    return provider ? providerState(provider, nowMs) : "not checked";
}
/**
 * One provider's section, the same for every provider: state, rows, debug details. Rows show
 * their ledger id, an account number and their facts; debug details show when their provider
 * allows them, and the rest are counted.
 */
function providerSection(availability, provider, params, homeDir) {
    const nowMs = params.generatedAtMs ?? Date.now();
    const off = params.settings.settings.providers.off;
    const state = sectionState(availability, provider, off, nowMs);
    const title = providerIdText(availability.id);
    const rows = [{ key: "state", value: state }];
    if (!provider)
        return kvSection(title, rows);
    if (provider.checkedAtMs !== undefined) {
        const lastRows = provider.okAtMs !== undefined && provider.okAtMs !== provider.checkedAtMs
            ? ` (rows from ${isoText(provider.okAtMs)})`
            : "";
        rows.push({ key: "checked_at", value: `${isoText(provider.checkedAtMs)}${lastRows}` });
    }
    rows.push({ key: "rows", value: String(provider.rows.length) });
    // An account is a login's label (often an email address): it shows as its number.
    const account = numbering();
    const part = numbering();
    const customs = customNumbers(params);
    for (const row of provider.rows.slice(0, ROW_LIST_LIMIT)) {
        const accountText = row.account ? ` (account ${account(row.account)})` : "";
        const id = rowIdText(row, part, customs);
        rows.push({ key: `${id}${accountText}`, value: rowFacts(row), indent: 1 });
    }
    if (provider.rows.length > ROW_LIST_LIMIT) {
        rows.push({ key: `… (${provider.rows.length - ROW_LIST_LIMIT} more)`, indent: 1 });
    }
    rows.push(...debugRows(provider, customs, homeDir));
    return kvSection(title, rows);
}
/** "openai/gpt-5" when OpenCode or the shipped price list knows both ids, else undefined. */
function knownModelText(providerId, modelId, priceList) {
    const knownProvider = OPENCODE_PROVIDER_IDS.has(providerId) || priceList.bundledProviderIds.has(providerId);
    return knownProvider && priceList.bundledModelIds.has(modelId)
        ? `${providerId}/${modelId}`
        : undefined;
}
/**
 * The models of the last 30 days with tokens without a price, which add no cost. A model shows when
 * the shipped price list has its id; the others are counted.
 */
function unpricedRows(usage, priceList) {
    if (!usage)
        return [{ key: "unpriced_30d", value: "(the usage history could not be read)" }];
    const { totals } = usage;
    if (totals.tokens.processed === 0)
        return [{ key: "unpriced_30d", value: "(no usage)" }];
    const summary = `${formatShare(totals.unpricedShare)} of ${formatTokens(totals.tokens.processed)} tokens`;
    const unpriced = usage.models.filter((model) => model.unpricedTokens > 0);
    const rows = [{ key: "unpriced_30d", value: summary }];
    const listed = unpriced
        .map((model) => ({ model, name: knownModelText(model.providerID, model.modelID, priceList) }))
        .filter((item) => item.name !== undefined)
        .slice(0, UNPRICED_LIST_LIMIT);
    for (const { model, name } of listed) {
        rows.push({
            key: name ?? "",
            value: `${formatTokens(model.unpricedTokens)} tokens`,
            indent: 1,
        });
    }
    const others = unpriced.length - listed.length;
    if (others > 0) {
        const text = countText(others, "more unpriced model", "more unpriced models");
        rows.push({ key: `… (${text})`, indent: 1 });
    }
    return rows;
}
const PRICING_UNITS = "USD per 1M tokens";
const PRICING_SOURCE_NAMES = {
    bundled: "bundled",
    runtime: "downloaded",
};
const PRICING_SELECTIONS = new Set(["auto", "bundled", "runtime"]);
/** The active price list as fixed words: where it came from, its date and its units. */
function publicPricingMeta(priceList) {
    const { meta } = priceList;
    return {
        source: PRICING_SOURCE_NAMES[priceList.source] ?? "unknown",
        generatedAt: isoText(meta.generatedAt),
        units: meta.units === PRICING_UNITS ? PRICING_UNITS : "(other units)",
    };
}
function pricingSection(params, priceList, homeDir) {
    const meta = publicPricingMeta(priceList);
    const { health, paths, refreshState } = priceList;
    const selection = params.settings.settings.providers.pricing.source;
    const configured = PRICING_SELECTIONS.has(selection) ? selection : "(other)";
    const rows = [
        {
            key: "pricing",
            value: `source=${meta.source} generated_at=${meta.generatedAt} units=${meta.units}`,
        },
        { key: "providers.pricing.source", value: `configured=${configured} active=${meta.source}` },
    ];
    if (configured === "bundled") {
        rows.push({
            key: "selection_note",
            value: "bundled: the built-in price list is used and downloaded prices are ignored",
        });
    }
    else if (configured === "runtime" && priceList.source !== "runtime") {
        rows.push({
            key: "selection_note",
            value: "runtime: no valid downloaded price list, so the built-in one is used",
        });
    }
    rows.push({
        key: "runtime_paths",
        value: `snapshot=${pathText(paths.snapshot, homeDir)} refresh_state=${pathText(paths.refreshState, homeDir)}`,
    }, {
        key: "staleness",
        value: `age_ms=${msText(health.ageMs)} max_age_ms=${msText(health.maxAgeMs)} stale=${health.stale === true}`,
    }, {
        key: "providers.pricing.autoRefreshDays",
        value: inRange(Math.round(health.maxAgeMs / DAY_MS), 1, MAX_REFRESH_DAYS),
    });
    if (refreshState) {
        // The reader keeps only the results it knows.
        const result = refreshState.lastResult ?? "(none)";
        rows.push({
            key: "refresh",
            value: `last_attempt_at=${isoText(refreshState.lastAttemptAt)} last_success_at=${isoText(refreshState.lastSuccessAt)} last_failure_at=${isoText(refreshState.lastFailureAt)} last_result=${result}`,
        });
        if (refreshState.lastError) {
            rows.push({ key: "refresh_error", value: errorKind(classifyError(refreshState.lastError)) });
        }
    }
    else {
        rows.push({ key: "refresh", value: "(no runtime refresh state yet)" });
    }
    rows.push({ key: "price_list_providers", value: fmtInt(priceList.meta.providers.length) }, ...unpricedRows(params.usage, priceList));
    return kvSection("pricing_snapshot", rows);
}
/** The payload follows the report's closed vocabulary: known ids, fixed words, known paths. */
function statusPayload(params, checked, priceList, homeDir, nowMs) {
    const { settings } = params.settings;
    const { off } = settings.providers;
    const pricingMeta = publicPricingMeta(priceList);
    return {
        version: "6",
        generatedAt: new Date(nowMs).toISOString(),
        config: {
            settingsPath: pathText(params.settings.path, homeDir),
            settingsFileExists: params.settings.exists,
            enabledProviders: off.length === 0 ? "auto" : SETTINGS_PROVIDER_IDS.filter((id) => !off.includes(id)),
            onlyCurrentModel: settings.words.onlyCurrentModel,
            pricingSnapshotSource: settings.providers.pricing.source,
        },
        providers: params.providerAvailability,
        pricing: {
            selection: settings.providers.pricing.source,
            activeSource: priceList.source,
            snapshot: {
                source: pricingMeta.source,
                // "(none)" and "(invalid date)" are no time.
                generatedAt: /^\d/u.test(pricingMeta.generatedAt) ? pricingMeta.generatedAt : null,
                units: pricingMeta.units,
            },
            snapshotPath: pathText(priceList.paths.snapshot, homeDir),
            refreshStatePath: pathText(priceList.paths.refreshState, homeDir),
        },
        liveProbes: checked.map((provider) => ({
            id: provider.providerId,
            ok: provider.error === undefined,
        })),
    };
}
/** The report as text: the heading, then each section's title and rows, a blank line between. */
function reportText(heading, sections) {
    const lines = [heading];
    for (const section of sections) {
        lines.push("", section.title);
        for (const row of section.rows) {
            const indent = row.indent === 1 ? "  " : "";
            lines.push(`${indent}- ${row.key}${row.value === undefined ? "" : `: ${row.value}`}`);
        }
    }
    return lines.join("\n");
}
/**
 * The report as text, with the home dir shown as "~", and as the `status --json` payload, from
 * one set of facts.
 */
export async function renderQuotaStatusReport(params) {
    const homeDir = params.homeDir ?? homedir();
    const nowMs = params.generatedAtMs ?? Date.now();
    const pluginVersion = (await getPackageVersion()) ?? "unknown";
    const snapshots = new Map(params.providers.map((provider) => [provider.providerId, provider]));
    const priceList = await describePriceList();
    const sections = [
        environmentSection(params, nowMs),
        settingsSection(params, priceList, homeDir),
        providerListSection(params.providerAvailability),
        ...(params.maintainerAnnouncements ? [noticesSection(params.maintainerAnnouncements)] : []),
        await pathsSection(homeDir),
        credentialSourceSection(params.credentialSource),
        ...params.providerAvailability.map((availability) => providerSection(availability, snapshots.get(availability.id), params, homeDir)),
        pricingSection(params, priceList, homeDir),
    ];
    const heading = `# Quota Status (opencode-quota v${pluginVersion})`;
    const checkedIds = new Set(params.providerAvailability
        .filter((provider) => provider.enabled && provider.available)
        .map((provider) => provider.id));
    const checked = params.providers.filter((provider) => checkedIds.has(provider.providerId));
    return {
        text: replaceHomeDirWithTilde(reportText(heading, sections), homeDir),
        json: statusPayload(params, checked, priceList, homeDir, nowMs),
        hasComparableProviderData: checked.some((provider) => provider.rows.length > 0),
    };
}
//# sourceMappingURL=quota-status.js.map