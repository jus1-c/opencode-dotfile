import type { GoogleCompanionResolver } from "./google-companion-credentials.js";
import { type GoogleTokenCache } from "./google-token-cache.js";
import { type CredentialRow } from "./opencode-auth.js";
import { type ResolvedAuthIdentity } from "./resolved-auth-identity.js";
import type { GeminiCliAuthSourceKey, GoogleAgyAuthSourceKey, QuotaError } from "./types.js";
export type GoogleAuthSourceKey = GoogleAgyAuthSourceKey | GeminiCliAuthSourceKey;
export type GoogleAccount<Key extends GoogleAuthSourceKey> = {
    sourceKey: Key;
    refreshToken: string;
    projectId: string;
    email?: string;
    accessToken?: string;
    expiresAt?: number;
};
export type GoogleAuthPresence<Key extends GoogleAuthSourceKey> = {
    state: "missing";
    sourceKey?: undefined;
    accountCount: 0;
    validAccountCount: 0;
} | {
    state: "present";
    sourceKey: Key;
    accountCount: number;
    validAccountCount: number;
} | {
    state: "invalid";
    sourceKey?: Key;
    accountCount: number;
    validAccountCount: number;
    error: string;
};
export type GoogleQuotaResult<Bucket> = {
    success: true;
    buckets: Bucket[];
} | QuotaError | null;
/** Every OAuth login of one flavor, and the project id its logins fall back to. */
export type GoogleLogins = {
    rows: CredentialRow[];
    configuredProjectId: string | undefined;
};
/** The logins and companion plugin of one flavor. */
type GoogleAuthFlavor<Key extends GoogleAuthSourceKey> = {
    providerId: "google-agy" | "google-gemini-cli";
    /** Name in messages, e.g. "Gemini CLI quota API error: 500". */
    name: "Google AGY" | "Gemini CLI";
    authKeys: readonly Key[];
    projectIdEnvVar: string;
    /** OpenCode config provider whose `projectId` setting applies. */
    projectIdConfigProvider: string;
    /** Gemini CLI keeps a login OpenCode could not return "present", so its error row shows. */
    failedLoginCountsAsPresent: boolean;
    /**
     * `google` holds both flavors' logins: Google AGY reads its Antigravity logins (true),
     * Gemini CLI every other one (false). See `findAntigravityGoogleLogins`.
     */
    readsAntigravityGoogleLogins: boolean;
    companion: GoogleCompanionResolver;
};
export type GoogleQuotaFlavor<Key extends GoogleAuthSourceKey, Response, Bucket> = GoogleAuthFlavor<Key> & {
    /** Query error when the companion plugin is missing; defaults to the companion's message. */
    missingCompanionError?: string;
    quotaUrl: string;
    quotaHeaders: () => Record<string, string>;
    /** The flavor's access tokens of this process. */
    tokenCache: GoogleTokenCache;
    /** Buckets of one account's quota response; throwing marks the account as failed. */
    toBuckets: (response: Response, account: GoogleAccount<Key>) => Bucket[];
};
export declare function resolveGoogleConfiguredProjectId(flavor: {
    projectIdEnvVar: string;
    projectIdConfigProvider: string;
}, directory: string): Promise<string | undefined>;
export declare function readGoogleLogins(flavor: {
    authKeys: readonly string[];
    readsAntigravityGoogleLogins: boolean;
    projectIdEnvVar: string;
    projectIdConfigProvider: string;
}, directory: string): Promise<GoogleLogins>;
/**
 * One account per usable OAuth login among `rows`, in auth-key order. The refresh value may
 * be packed as `refreshToken|projectId|managedProjectId`. Logins that share a refresh token
 * and project are one account.
 */
export declare function resolveGoogleAccounts<Key extends GoogleAuthSourceKey>(flavor: {
    authKeys: readonly Key[];
}, rows: readonly CredentialRow[], configuredProjectId?: string): GoogleAccount<Key>[];
/** The auth state of the logins OpenCode uses: the first login of each auth key. */
export declare function inspectGoogleAuthPresence<Key extends GoogleAuthSourceKey>(flavor: GoogleAuthFlavor<Key>, logins: GoogleLogins): GoogleAuthPresence<Key>;
export declare function hasGoogleQuotaRuntimeAvailable<Key extends GoogleAuthSourceKey>(flavor: GoogleAuthFlavor<Key>, directory: string): Promise<boolean>;
/**
 * Who the flavor is signed in as: the account of every login, plus the companion plugin's
 * client. Null without logins, with a login that has no account (one OpenCode could not return,
 * for example), or without the companion's client.
 */
export declare function googleLoginsIdentity<Key extends GoogleAuthSourceKey>(flavor: GoogleAuthFlavor<Key>, logins: GoogleLogins): Promise<ResolvedAuthIdentity | null>;
/** The quota of the account of one login; null when the login has no usable account. */
export declare function queryGoogleQuota<Key extends GoogleAuthSourceKey, Response, Bucket>(flavor: GoogleQuotaFlavor<Key, Response, Bucket>, options: {
    requestTimeoutMs?: number;
    login: CredentialRow;
    directory: string;
}): Promise<GoogleQuotaResult<Bucket>>;
export {};
