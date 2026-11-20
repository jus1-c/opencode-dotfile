import type { ErrorFacts } from "../core/errors.js";
import type { ProviderRow } from "../providers/contract.js";
import type { RemoteApiQuotaProviderDefinition } from "./quota-providers.js";
export declare const QUOTA_PROVIDER_MAX_BODY_BYTES: number;
export type QuotaProviderAuthSource = "env" | "opencode.json" | "opencode.jsonc" | "opencode.db";
export interface QuotaProviderAuthResolution {
    key?: string;
    source: QuotaProviderAuthSource | null;
    checkedPaths: string[];
    credentialDatabasePaths: string[];
}
/** Why a check got no rows, as its /quota_status check names it. */
export type RemoteFailureOutcome = "switched_off" | "http_error" | "redirect_error" | "timeout" | "body_too_large" | "invalid_content_type" | "invalid_json" | "invalid_response" | "network_error";
/**
 * The rows of one reply (each key is the part of the row id after `custom.<definition id>.`),
 * or why there are none: the words, the outcome, and the request's facts when it gave them.
 */
export type RemoteQuotaProviderResult = {
    success: true;
    rows: ProviderRow[];
    rowErrors?: string[];
} | {
    success: false;
    error: string;
    outcome: RemoteFailureOutcome;
    facts?: ErrorFacts;
};
export declare function resolveQuotaProviderApiKey(source: RemoteApiQuotaProviderDefinition, directory: string): Promise<QuotaProviderAuthResolution>;
export declare function fetchRemoteQuotaProvider(source: RemoteApiQuotaProviderDefinition, apiKey: string, requestTimeoutMs?: number): Promise<RemoteQuotaProviderResult>;
