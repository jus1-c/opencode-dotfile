import type { ProviderSnapshot, SessionModel } from "../core/types.js";
import type { UsageReport } from "../core/usage.js";
import type { LoadedSettings, V5Conversion } from "../settings/index.js";
import type { MaintainerAnnouncementsSummary } from "./maintainer-announcements.js";
import { type PricingSnapshotSource } from "./modelsdev-pricing.js";
import type { CredentialSourceDiagnostics } from "./opencode-auth.js";
/** Folder and file names this plugin and OpenCode use; a shown path is made only of these. */
export declare const KNOWN_PATH_PARTS: ReadonlySet<string>;
/** File names this plugin and OpenCode read or write. */
export declare const KNOWN_FILE_NAMES: ReadonlySet<string>;
/** Paths outside the home dir this plugin looks at. */
export declare const KNOWN_ABSOLUTE_PATHS: ReadonlySet<string>;
type ProviderAvailability = {
    id: string;
    enabled: boolean;
    available: boolean;
    matchesCurrentModel?: boolean;
};
export type StatusOrigin = "slash_command" | "tool" | "tui" | "cli";
/** What the report is made from: the facts gathered once, for the text and the JSON payload. */
export type QuotaStatusReportParams = {
    origin: StatusOrigin;
    /** OpenCode's version and release channel; the CLI runs without OpenCode. */
    opencode?: {
        version: string;
        channel: string;
    };
    settings: Pick<LoadedSettings, "path" | "exists" | "issues" | "notRead" | "settings" | "fromFile">;
    /** The v5 settings conversion: written when this server started, or done in memory. */
    conversion?: V5Conversion;
    /** The project folder quota is computed for. */
    workspaceRoot: string;
    /** The session's model; undefined without a session. */
    sessionModel?: SessionModel;
    /** Every known provider, enabled or not: one section each, in this order. */
    providerAvailability: ProviderAvailability[];
    /**
     * The store's snapshot of each provider it checked: the enabled and available ones, and the
     * unavailable ones for their setup details.
     */
    providers: readonly ProviderSnapshot[];
    credentialSource: CredentialSourceDiagnostics;
    maintainerAnnouncements?: {
        summary: MaintainerAnnouncementsSummary;
    };
    /** The last 30 days of usage, for the models without a price; null when it can't be read. */
    usage?: UsageReport | null;
    generatedAtMs?: number;
    /** The home dir the report shows as "~"; defaults to the computer's (tests set it). */
    homeDir?: string;
};
/** Where a debug value is shown: the home dir, and the env variables its provider reads. */
type DetailContext = {
    homeDir: string;
    envNames: readonly string[];
};
/**
 * A debug value's rule: the value as shown, or undefined when it is not one the rule allows.
 * Every rule prints only members of its own set, numbers and times it formats in their range,
 * its provider's own env variable names and known paths.
 */
type DebugRule = (value: string, context: DetailContext) => string | undefined;
type DebugRules = Readonly<Record<string, DebugRule>>;
/**
 * The rules of a provider's debug details: `shared` are the setup details every section has and,
 * for a provider that reads an API key, its key details; `own` are the provider's own.
 */
export declare function debugDetailRules(providerId: string): {
    shared: DebugRules;
    own: DebugRules;
};
/** `opencode-quota status --json`: the format version, then what the report says, as data. */
export type QuotaStatusPayload = {
    version: "6";
    generatedAt: string;
    /** Where the settings come from and what they say about providers and prices. */
    config: {
        settingsPath: string;
        settingsFileExists: boolean;
        /** Ids, as `providers.off` names them, of the providers not switched off; "auto" when none is off. */
        enabledProviders: string[] | "auto";
        onlyCurrentModel: boolean;
        pricingSnapshotSource: PricingSnapshotSource;
    };
    providers: ProviderAvailability[];
    pricing: {
        selection: PricingSnapshotSource;
        activeSource: string;
        snapshot: {
            source: string;
            generatedAt: string | null;
            units: string;
        };
        snapshotPath: string;
        refreshStatePath: string;
    };
    /** One per enabled and available provider: ok when its check had no error. */
    liveProbes: Array<{
        id: string;
        ok: boolean;
    }>;
};
export type QuotaStatusReport = {
    text: string;
    json: QuotaStatusPayload;
    /** True when an enabled and available provider's check returned a row. */
    hasComparableProviderData: boolean;
};
/**
 * The report as text, with the home dir shown as "~", and as the `status --json` payload, from
 * one set of facts.
 */
export declare function renderQuotaStatusReport(params: QuotaStatusReportParams): Promise<QuotaStatusReport>;
export {};
