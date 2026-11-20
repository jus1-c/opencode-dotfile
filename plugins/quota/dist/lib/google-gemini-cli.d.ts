import type { GoogleQuotaFlavor } from "./google-oauth-quota.js";
import type { GeminiCliAuthSourceKey, GeminiCliQuotaBucket } from "./types.js";
export declare const GEMINI_CLI_AUTH_KEYS: readonly ["google-gemini-cli", "gemini-cli", "opencode-gemini-auth", "gemini", "google"];
export type RetrieveUserQuotaResponse = {
    buckets?: {
        remainingAmount?: string;
        remainingFraction?: number;
        resetTime?: string;
        tokenType?: string;
        modelId?: string;
    }[];
};
export declare const GEMINI_CLI_FLAVOR: GoogleQuotaFlavor<GeminiCliAuthSourceKey, RetrieveUserQuotaResponse, GeminiCliQuotaBucket>;
