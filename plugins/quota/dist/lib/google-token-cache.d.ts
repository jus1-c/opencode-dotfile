/**
 * Process-local access-token caches for the Google quota providers, one per provider.
 *
 * Access tokens and account correlation material are intentionally never
 * persisted. The legacy v1 disk cache contained account PII and an unkeyed
 * refresh-token verifier, so it is never read and is removed before every get and set.
 */
type GoogleAccessTokenCacheEntry = {
    accessToken: string;
    expiresAt: number;
};
export type GoogleTokenCache = {
    /** The entry of `key`, unless it expires within `skewMs`. */
    get(params: {
        key: string;
        skewMs: number;
    }): Promise<GoogleAccessTokenCacheEntry | null>;
    set(params: {
        key: string;
        entry: GoogleAccessTokenCacheEntry;
    }): Promise<void>;
};
export declare function makeAccountCacheKey(params: {
    refreshToken: string;
    projectId: string;
}): string;
/** An empty cache; its operations run one at a time, each after removing the legacy file. */
export declare function createGoogleTokenCache(): GoogleTokenCache;
export {};
