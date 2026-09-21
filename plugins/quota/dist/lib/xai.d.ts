/**
 * xAI SuperGrok subscription quota fetcher.
 *
 * Uses OpenCode's read-only `xai` OAuth entry and queries the same shared
 * period meter exposed by Grok Build:
 * GET https://cli-chat-proxy.grok.com/v1/billing?format=credits
 *
 * OpenCode remains the sole owner of OAuth refresh and auth.json persistence.
 */
import type { AuthData, QuotaError } from "./types.js";
export declare const DEFAULT_XAI_AUTH_CACHE_MAX_AGE_MS = 5000;
export type XaiPeriodKind = "weekly" | "monthly" | "daily" | "period";
export interface XaiWindowValue {
    percentRemaining: number;
    resetTimeIso?: string;
    kind: XaiPeriodKind;
}
export type XaiResult = {
    success: true;
    label: "xAI SuperGrok";
    window: XaiWindowValue;
} | QuotaError | null;
export type ResolvedXaiOAuth = {
    state: "none";
} | {
    state: "configured";
    accessToken: string;
    expiresAt?: number;
};
export declare function periodKindLabel(kind: XaiPeriodKind): string;
export declare function resolveXaiOAuth(auth: AuthData | null | undefined): ResolvedXaiOAuth;
export declare function hasXaiOAuth(auth: AuthData | null | undefined): boolean;
export declare function hasXaiOAuthCached(params?: {
    maxAgeMs?: number;
}): Promise<boolean>;
export declare function queryXaiQuota(options?: {
    requestTimeoutMs?: number;
}): Promise<XaiResult>;
//# sourceMappingURL=xai.d.ts.map