import type { ProviderRow } from "../providers/contract.js";
export declare const QUOTA_PROVIDER_REMOTE_FORMATS: readonly ["quota-v1", "openrouter-key-v1", "json-v1"];
export declare const QUOTA_PROVIDER_MODES: readonly ["remote-api", "local-estimate"];
export declare const QUOTA_PROVIDER_WINDOW_TYPES: readonly ["utc-day", "rolling"];
export declare const QUOTA_PROVIDERS_AGGREGATE_ID = "quota-providers";
/**
 * The built-in of this id reads the official CLI now, so a leftover tuning tunes nothing: it is
 * ignored rather than left to collide with the built-in, which would void every other definition.
 */
export declare function isRetiredEstimateTuning(definition: {
    id: string;
    mode: unknown;
}): boolean;
/**
 * The custom definitions that run: not switched off. A switched-off definition is never fetched
 * and its key is never sent.
 */
export declare function customQuotaProviderDefinitions(definitions: readonly QuotaProviderDefinition[]): QuotaProviderDefinition[];
/**
 * Where a remote custom provider sends its key, for the user to check before switching it on:
 * the URL's origin and path (the scheme shows http or https), and where the key comes from.
 * Never the key itself. `insecure` is true for plain HTTP to any host but localhost, 127.0.0.1
 * or ::1. Null for a local estimate, which sends nothing.
 */
export declare function describeQuotaProviderRequest(definition: QuotaProviderDefinition): {
    url: string;
    key: string;
    insecure: boolean;
} | null;
export declare function resolveQuotaProviderSessionModelIdentity(params: {
    currentModel: string;
    currentProviderID?: string;
}): {
    providerId: string;
    modelId: string;
} | null;
/**
 * The row key a custom source's mapping or entry name gets: spaces become "_", and the name
 * stays as it is when that leaves only letters, digits, "_" and "-" ("Daily limit" →
 * "Daily_limit", "Daily-limit" → "Daily-limit"). Other characters are dropped and a short hash
 * of the exact name is added, so names stay apart ("日次" → 8 hex digits).
 */
export declare function customRowKey(name: string): string;
/** What a custom row means; custom configs may still say `rate_limit` and `spend` (ADR 0001). */
export type CustomResultType = "quota" | "rate_limit" | "usage" | "spend" | "budget" | "balance" | "status";
/**
 * One custom row. `key` is the part of its id after `custom.<definition id>.`; its label is the
 * configured label without a trailing colon, or else its name; its window is the one its name
 * or label names ("Daily" → day).
 */
export declare function customRow(params: {
    key: string;
    name: string;
    label?: string;
    resultType: CustomResultType;
    method: "remote_api" | "local_estimation";
    value: {
        percentRemaining: number;
    } | {
        text: string;
    };
    resetsAt?: string;
}): ProviderRow;
export declare function selectEligibleQuotaProviderDefinitions(params: {
    definitions: readonly QuotaProviderDefinition[];
    availableProviderIds: ReadonlySet<string>;
    onlyCurrentModel?: boolean;
    currentModel?: string;
    currentProviderID?: string;
}): QuotaProviderDefinition[];
export type QuotaProviderRemoteFormat = (typeof QUOTA_PROVIDER_REMOTE_FORMATS)[number];
type QuotaProviderMode = (typeof QUOTA_PROVIDER_MODES)[number];
type QuotaProviderWindowType = (typeof QUOTA_PROVIDER_WINDOW_TYPES)[number];
export type JsonV1Path = string[];
export type JsonV1NumberSource = {
    path: JsonV1Path;
    divideBy?: 100 | 1_000 | 1_000_000;
} | {
    literal: number;
};
export type JsonV1TextSource = {
    path: JsonV1Path;
} | {
    literal: string;
};
export type JsonV1TimestampEncoding = "iso-8601" | "unix-seconds" | "unix-milliseconds";
export type JsonV1TimestampSource = {
    path: JsonV1Path;
    encoding: JsonV1TimestampEncoding;
} | {
    literal: string | number;
    encoding: JsonV1TimestampEncoding;
};
export type JsonV1Metric = {
    type: "percentage";
    percentage: JsonV1NumberSource;
    meaning: "remaining" | "used";
} | {
    type: "used-limit";
    used: JsonV1NumberSource;
    limit: JsonV1NumberSource;
} | {
    type: "remaining-limit";
    remaining: JsonV1NumberSource;
    limit: JsonV1NumberSource;
} | {
    type: "spend-budget";
    spend: JsonV1NumberSource;
    budget: JsonV1NumberSource;
} | {
    type: "remaining-budget";
    remaining: JsonV1NumberSource;
    budget: JsonV1NumberSource;
} | {
    type: "value";
    valueType: "used" | "limit" | "remaining" | "balance" | "spend" | "budget";
    value: JsonV1NumberSource;
} | {
    type: "status";
    value: JsonV1TextSource;
};
export interface JsonV1Mapping {
    resultType: CustomResultType;
    name: string;
    label?: string;
    unit?: string;
    unitPosition?: "prefix" | "suffix";
    resetTime?: JsonV1TimestampSource;
    observedTime?: JsonV1TimestampSource;
    metric: JsonV1Metric;
}
export interface JsonV1Adapter {
    rowsPath?: JsonV1Path;
    mappings: JsonV1Mapping[];
}
interface QuotaProviderDefinitionBase {
    id: string;
    /** Effective OpenCode provider id. Input omits this when it is the same as id. */
    providerId: string;
    /** Normalized display label; omitted input defaults to id. */
    label: string;
    mode: QuotaProviderMode;
    /** Exact OpenCode model ids, without a provider prefix. Omission covers the provider. */
    modelIds?: string[];
    /** Hard minimum between automatic checks of this definition, in whole milliseconds. */
    minIntervalMs?: number;
    /**
     * `false` switches the definition off: it is never fetched and its key is never sent. Omission
     * means on. Agents add definitions switched off; only the user switches them on.
     */
    enabled?: boolean;
}
interface RemoteApiQuotaProviderDefinitionBase extends QuotaProviderDefinitionBase {
    mode: "remote-api";
    /** Canonical absolute HTTPS URL, or loopback HTTP URL. */
    url: string;
    apiKeyEnv?: string;
}
export type RemoteApiQuotaProviderDefinition = (RemoteApiQuotaProviderDefinitionBase & {
    format: "quota-v1" | "openrouter-key-v1";
    adapter?: never;
}) | (RemoteApiQuotaProviderDefinitionBase & {
    format: "json-v1";
    adapter: JsonV1Adapter;
});
export interface LocalEstimateWindow {
    id: string;
    label: string;
    type: QuotaProviderWindowType;
    /** Present only for rolling windows. */
    durationMinutes?: number;
    requestLimit: number;
    usdBudget?: number;
}
export interface LocalEstimateQuotaProviderDefinition extends QuotaProviderDefinitionBase {
    mode: "local-estimate";
    windows: LocalEstimateWindow[];
    /**
     * Exact source model id -> models.dev provider/model fallback.
     * Automatic models.dev matching always wins.
     */
    pricingModelMap?: Record<string, string>;
}
export type QuotaProviderDefinition = RemoteApiQuotaProviderDefinition | LocalEstimateQuotaProviderDefinition;
interface QuotaProviderValidationIssue {
    key: string;
    message: string;
}
type QuotaProvidersValidationResult = {
    value: QuotaProviderDefinition[];
    issues: [];
} | {
    value?: undefined;
    issues: QuotaProviderValidationIssue[];
};
/** Every top-level field a definition can have, in either mode. */
export declare const QUOTA_PROVIDER_FIELDS: readonly string[];
export declare const JSON_V1_MAX_DISPLAY_CODE_POINTS = 160;
/** Most items a reply's list may hold; each becomes its own row. */
export declare const JSON_V1_MAX_ITEMS = 100;
export declare const JSON_V1_MAX_NUMBER_MAGNITUDE = 1000000000000000;
export declare const CUSTOM_RESULT_TYPES: ReadonlySet<string>;
export declare function normalizeJsonV1Timestamp(value: unknown, encoding: JsonV1TimestampEncoding): string | null;
/** Validate and normalize the complete global-only quotaProviders array atomically. */
export declare function validateQuotaProviders(value: unknown): QuotaProvidersValidationResult;
export declare function cloneQuotaProviders(definitions: readonly QuotaProviderDefinition[]): QuotaProviderDefinition[];
export {};
