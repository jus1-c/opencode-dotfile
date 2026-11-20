/**
 * The plugin RPC between OpenCode Quota's server plugin and its clients. The server
 * registers it in its setup and computes quota there; clients call it by this definition.
 * Imports from `@opencode/*` and `./core/*` stay type-only, so loading this file loads no
 * OpenCode package and no server code.
 *
 * Methods: `snapshot` (the last known quota, instantly), `refresh`, `notices` (the Home
 * notice line), `noticeList` (the active maintainer notices), `status` (the /quota_status report),
 * `usage` (request count, tokens and cost from OpenCode's history for one range),
 * `downloadPrices` (a new price list from models.dev), `settings` (the server settings a client
 * may change), `saveSettings` (a patch of the server settings file, and custom provider
 * switches), `settingsSchema` (every setting's rule, for a client that builds its controls from
 * them, and where settings.jsonc is); the `changed` event carries every new snapshot.
 */
import type { Rpc } from "@opencode/plugin";
import type { QuotaSnapshot } from "./core/types.js";
import type { UsageQuery, UsageReport } from "./core/usage.js";
import type { ClientSettings, CustomSwitch, SettingRule, SettingsIssue } from "./settings/index.js";
export declare const QUOTA_RPC_ID = "slkiser.opencode-quota";
export type QuotaRpcSnapshotInput = {
    sessionID?: string;
};
export type QuotaRpcRefreshReason = "poll" | "turn" | "manual";
export type QuotaRpcRefreshInput = {
    reason: QuotaRpcRefreshReason;
    providerIds?: string[];
    sessionID?: string;
};
/** Answer of `snapshot` and `refresh`, and the data of the `changed` event. */
export type QuotaRpcSnapshotOutput = {
    snapshot: QuotaSnapshot;
};
export type QuotaRpcNoticesInput = Record<string, never>;
/** The maintainer notice line for the bottom of Home; "" when there is none to show now. */
export type QuotaRpcNoticesOutput = {
    homeLine: string;
};
/** The /quota_status report as text; with a session, it also checks that session's model. */
export type QuotaRpcStatusInput = {
    sessionID?: string;
};
export type QuotaRpcStatusOutput = {
    text: string;
};
export type Notice = {
    id: string;
    message: string;
    url?: string;
};
export type QuotaRpcNoticeListInput = Record<string, never>;
/** The active maintainer notices for the providers quota shows. */
export type QuotaRpcNoticeListOutput = {
    notices: Notice[];
};
export type QuotaRpcUsageInput = UsageQuery;
export type QuotaRpcUsageOutput = {
    report: UsageReport;
};
export type QuotaRpcDownloadPricesInput = Record<string, never>;
/** `message` says what happened, for a toast. */
export type QuotaRpcDownloadPricesOutput = {
    ok: boolean;
    message: string;
};
export type QuotaRpcSettingsInput = Record<string, never>;
export type QuotaRpcSettingsOutput = ClientSettings;
/**
 * A JSON merge patch of settings.jsonc; file-only keys are refused. `customEnabled` switches
 * custom providers on or off by id: the user's switch in the quota window's Providers tab, with
 * the fingerprint of the definition the tab showed.
 */
export type QuotaRpcSaveSettingsInput = {
    patch: Record<string, unknown>;
    customEnabled?: Record<string, CustomSwitch>;
};
/** Nothing is saved unless `ok`; `issues` say why. */
export type QuotaRpcSaveSettingsOutput = {
    ok: boolean;
    issues: SettingsIssue[];
};
export type QuotaRpcSettingsSchemaInput = Record<string, never>;
/**
 * `rules`: `SETTINGS_SCHEMA`, every setting by dotted key in file order (a default that is
 * undefined, as an unset color's, is left out). `path`: settings.jsonc's absolute path.
 */
export type QuotaRpcSettingsSchemaOutput = {
    rules: Record<string, SettingRule>;
    path: string;
};
/** An absolute path of a quota settings file: `…/opencode-quota/settings.jsonc`. */
export declare function isSettingsFilePath(path: unknown): path is string;
type StandardValueSchema = Extract<Rpc.PortableValueSchema, {
    "~standard": unknown;
}>;
type StandardEventSchema = Extract<Rpc.PortableEventDefinition["schema"], {
    "~standard": unknown;
}>;
type Typed<T> = {
    "~standard": {
        types?: {
            input: T;
            output: T;
        };
    };
};
type QuotaRpcSchema<T> = StandardValueSchema & Typed<T>;
type QuotaRpcEventSchema<T> = StandardEventSchema & Typed<T>;
export declare const QuotaRpc: {
    id: string;
    events: {
        changed: {
            schema: QuotaRpcEventSchema<QuotaRpcSnapshotOutput>;
        };
    };
    methods: {
        snapshot: {
            input: QuotaRpcSchema<QuotaRpcSnapshotInput>;
            output: QuotaRpcSchema<QuotaRpcSnapshotOutput>;
        };
        refresh: {
            input: QuotaRpcSchema<QuotaRpcRefreshInput>;
            output: QuotaRpcSchema<QuotaRpcSnapshotOutput>;
        };
        notices: {
            input: QuotaRpcSchema<QuotaRpcNoticesInput>;
            output: QuotaRpcSchema<QuotaRpcNoticesOutput>;
        };
        noticeList: {
            input: QuotaRpcSchema<QuotaRpcNoticeListInput>;
            output: QuotaRpcSchema<QuotaRpcNoticeListOutput>;
        };
        status: {
            input: QuotaRpcSchema<QuotaRpcStatusInput>;
            output: QuotaRpcSchema<QuotaRpcStatusOutput>;
        };
        usage: {
            input: QuotaRpcSchema<UsageQuery>;
            output: QuotaRpcSchema<QuotaRpcUsageOutput>;
        };
        downloadPrices: {
            input: QuotaRpcSchema<QuotaRpcDownloadPricesInput>;
            output: QuotaRpcSchema<QuotaRpcDownloadPricesOutput>;
        };
        settings: {
            input: QuotaRpcSchema<QuotaRpcSettingsInput>;
            output: QuotaRpcSchema<ClientSettings>;
        };
        saveSettings: {
            input: QuotaRpcSchema<QuotaRpcSaveSettingsInput>;
            output: QuotaRpcSchema<QuotaRpcSaveSettingsOutput>;
        };
        settingsSchema: {
            input: QuotaRpcSchema<QuotaRpcSettingsSchemaInput>;
            output: QuotaRpcSchema<QuotaRpcSettingsSchemaOutput>;
        };
    };
};
export {};
