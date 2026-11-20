import type { Amount } from "../core/types.js";
import type { QuotaProviderCachePolicy, QuotaProviderContext } from "../lib/entries.js";
import { type GoogleAuthSourceKey, type GoogleQuotaFlavor } from "../lib/google-oauth-quota.js";
import { type ProviderFetchResult, type ProviderRow } from "./contract.js";
/** The parts in which the Google AGY and Gemini CLI providers differ. */
export type GoogleProviderFlavor<Key extends GoogleAuthSourceKey, Response, Bucket> = {
    quota: GoogleQuotaFlavor<Key, Response, Bucket>;
    /** Error for a login OpenCode could not return; without it the login is queried. */
    failedLoginError?: (resolveError: string) => string;
    compareBuckets?: (left: Bucket, right: Bucket) => number;
    /** The row of one bucket, or none when the bucket gives no row key. */
    row: (bucket: Bucket) => ProviderRow | undefined;
};
/** Set up when a login OpenCode uses has an account and the companion plugin is installed. */
export declare function isGoogleProviderAvailable<Key extends GoogleAuthSourceKey, Response, Bucket>(flavor: GoogleProviderFlavor<Key, Response, Bucket>, ctx: QuotaProviderContext): Promise<boolean>;
/** Who the provider is signed in as: its logins and the companion's OAuth client. */
export declare function googleCachePolicy<Key extends GoogleAuthSourceKey, Response, Bucket>(flavor: GoogleProviderFlavor<Key, Response, Bucket>): QuotaProviderCachePolicy;
/** A remaining count Google reported ("1200", "12.5") in `unit`; none for anything else. */
export declare function remainingCount(text: string | undefined, unit: string): Amount | undefined;
/** One account per OpenCode login, named after the login. */
export declare function fetchGoogleProviderQuota<Key extends GoogleAuthSourceKey, Response, Bucket>(flavor: GoogleProviderFlavor<Key, Response, Bucket>, ctx: QuotaProviderContext): Promise<ProviderFetchResult>;
