import type { GoogleQuotaFlavor } from "./google-oauth-quota.js";
import type { GoogleAgyAuthSourceKey, GoogleAgyQuotaBucket, GoogleAgyQuotaSummaryResponse } from "./types.js";
export declare const AGY_AUTH_KEYS: readonly ["google", "google-agy", "opencode-agy-auth", "google-agy-auth"];
export declare const AGY_FLAVOR: GoogleQuotaFlavor<GoogleAgyAuthSourceKey, GoogleAgyQuotaSummaryResponse, GoogleAgyQuotaBucket>;
/** Gemini before Claude/GPT before other families, then weekly before 5h. */
export declare function compareAgyBuckets(left: GoogleAgyQuotaBucket, right: GoogleAgyQuotaBucket): number;
