import type { DebugDetail } from "../core/types.js";
import { type ApiKeySpec, type VendorKeys } from "../lib/api-key-resolver.js";
export declare function statusDetailsFromRecord(values: Readonly<Record<string, string | undefined>>): DebugDetail[];
export declare function configStatusDetails(diagnostics: {
    state: string;
    source: string | null;
    checkedPaths: readonly string[];
}): DebugDetail[];
export declare function simpleApiKeyStatusDetails(diagnostics: {
    configured: boolean;
    source: string | null;
    checkedPaths: readonly string[];
    credentialDatabasePaths: readonly string[];
}): DebugDetail[];
type KeyState = {
    state: "none";
    source: null;
} | {
    state: "configured";
    source: string;
} | {
    state: "invalid";
    source: "opencode.db";
    error: string;
};
/** The key the vendor uses first: the env or config key, else its first stored login. */
export declare function vendorKeyState(keys: VendorKeys): KeyState;
/** Where a vendor's API key was looked for, and what its first key holds. */
export declare function vendorKeyDetails(spec: ApiKeySpec, keys: VendorKeys, directory: string): DebugDetail[];
export declare function apiKeyStatusDetails(diagnostics: {
    state: string;
    source: string | null;
    checkedPaths: readonly string[];
    credentialDatabasePaths: readonly string[];
    error?: string;
}): DebugDetail[];
export {};
