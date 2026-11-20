/**
 * One API key resolver for every API-key vendor.
 *
 * Order (first wins): environment variables, then the key OpenCode ends up with from the config
 * files that count for the session's folder (`providers.<id>.settings.apiKey`, or the legacy
 * `provider.<id>.options.apiKey`, with `{env:NAME}` templates), then OpenCode's stored logins.
 * Each vendor's spec is its `apiKey` in `provider-registration.ts`.
 */
import { type CredentialRow } from "./opencode-auth.js";
import { QUOTA_PROVIDER_REGISTRATION_SOURCE } from "./provider-registration.js";
/** Where an API key may live for one vendor. */
export interface ApiKeySpec {
    /** Checked first, in order. Also the only names allowed in `{env:NAME}` config templates. */
    envVars: readonly string[];
    /** Provider ids read from the OpenCode config files, in order. */
    providerKeys: readonly string[];
    /** OpenCode login integration ids, in order. Default: `providerKeys`. */
    authKeys?: readonly string[];
    /** Read key logins only: the same integration can also hold an OAuth sign-in. */
    keyLoginsOnly?: boolean;
}
/** An API-key vendor; a broken stored login (wrong type, empty key, unreadable) is an error. */
export interface ApiKeyLoginSpec extends ApiKeySpec {
    authKeys: readonly string[];
    /** Used in login errors, e.g. "Z.ai auth entry has invalid shape". */
    displayName: string;
    /** Replaces the "Unsupported <name> auth type" error (it would echo the stored type). */
    unsupportedTypeError?: string;
    /** A stored login that is not a usable API key is left out instead of shown as an error. */
    skipBrokenLogins?: boolean;
}
type ApiKeyVendorId = Extract<(typeof QUOTA_PROVIDER_REGISTRATION_SOURCE)[number], {
    apiKey: object;
}>["id"];
/** Each API-key vendor's spec, from its `apiKey` in provider-registration.ts. */
export declare const API_KEY_VENDORS: Readonly<Record<ApiKeyVendorId, ApiKeyLoginSpec>>;
export type ApiKeySource = `env:${string}` | "opencode.json" | "opencode.jsonc" | "opencode.db";
export interface ApiKeyResult {
    key: string;
    source: ApiKeySource;
}
type ApiKeyLoginResult = {
    state: "none";
} | {
    state: "configured";
    apiKey: string;
} | {
    state: "invalid";
    error: string;
};
type DiagnosticPaths = {
    checkedPaths: string[];
    credentialDatabasePaths: string[];
};
export type ApiKeyLoginDiagnostics = ({
    state: "none";
    source: null;
} & DiagnosticPaths) | ({
    state: "configured";
    source: ApiKeySource;
} & DiagnosticPaths) | ({
    state: "invalid";
    source: "opencode.db";
    error: string;
} & DiagnosticPaths);
/** The login of the first auth key, in order, that has one among `rows`. */
export declare function firstLoginRow(rows: readonly CredentialRow[], authKeys: readonly string[]): CredentialRow | undefined;
/**
 * Read one provider's settings the way OpenCode 2 normalizes its config.
 *
 * A native `providers.<id>` entry replaces the legacy `provider.<id>` entry,
 * whose `options` OpenCode 2 migrates into `settings` unless it drops the entry.
 */
export declare function getProviderConfigSettings(config: unknown, providerKey: string): Record<string, unknown> | null;
/**
 * Read one provider string setting from the OpenCode config files that count for `directory`:
 * the value OpenCode ends up with, when it is a non-empty string.
 */
export declare function readProviderConfigString(providerKey: string, settingKey: string, directory: string): Promise<string | undefined>;
/** Environment variables, then the OpenCode config files that count for `directory`. */
export declare function resolveApiKeyFromEnvAndConfig(spec: ApiKeySpec, directory: string): Promise<ApiKeyResult | null>;
/** Env vars that are set and the OpenCode config files for `directory` that exist (no values). */
export declare function getApiKeyCheckedPaths(spec: Pick<ApiKeySpec, "envVars">, directory: string): string[];
export declare function resolveApiKey(spec: ApiKeySpec, directory: string): Promise<ApiKeyResult | null>;
/** The vendor's stored login that decides: the active one of its first auth key (cached 5 s). */
export declare function readApiKeyLoginRow(spec: ApiKeyLoginSpec): Promise<CredentialRow | undefined>;
/** A stored login as an API key: `none` without one, `invalid` when it is not a usable key. */
export declare function parseApiKeyLogin(spec: ApiKeyLoginSpec, row: CredentialRow | undefined): ApiKeyLoginResult;
export declare function resolveApiKeyLoginWithDiagnostics(spec: ApiKeyLoginSpec, directory: string): Promise<{
    auth: ApiKeyLoginResult;
    diagnostics: ApiKeyLoginDiagnostics;
}>;
export declare function resolveApiKeyLogin(spec: ApiKeyLoginSpec, directory: string): Promise<ApiKeyLoginResult>;
export declare function getApiKeyLoginDiagnostics(spec: ApiKeyLoginSpec, directory: string): Promise<ApiKeyLoginDiagnostics>;
export type KeyLogin = {
    row: CredentialRow;
    auth: Exclude<ApiKeyLoginResult, {
        state: "none";
    }>;
};
/**
 * Every key login of the vendor stored in OpenCode, in OpenCode's order, with what each one
 * holds. `selectRows` narrows the logins further, for example to drop alias duplicates.
 */
export declare function readKeyLogins(spec: ApiKeyLoginSpec, options?: {
    selectRows?: (rows: CredentialRow[]) => CredentialRow[];
}): Promise<KeyLogin[]>;
/**
 * The keys a vendor checks: the env or config key when one is set, else every stored login.
 * `broken` is the error of the first stored login when it is not a usable key and no stored
 * key login is listed (for example an OAuth login of a key-only vendor); vendors that skip
 * broken logins never have one.
 */
export type VendorKeys = {
    envOrConfig: ApiKeyResult | null;
    logins: KeyLogin[];
    broken: string | null;
};
export declare function readVendorKeys(spec: ApiKeyLoginSpec, directory: string, options?: {
    selectRows?: (rows: CredentialRow[]) => CredentialRow[];
}): Promise<VendorKeys>;
/** True when the vendor has a key to check, or a broken login to show. */
export declare function hasVendorKey(keys: VendorKeys): boolean;
export {};
