import { type OpenCodeConsoleCredential } from "./opencode-console-auth.js";
import type { OpenCodeGoResult } from "./types.js";
export declare function queryOpenCodeGoQuota(accessToken: string, options?: {
    requestTimeoutMs?: number;
}): Promise<OpenCodeGoResult>;
/**
 * Read OpenCode Go subscription windows from the Console API.
 *
 * The Console tracks Go plan access (five-hour, weekly, and monthly meters)
 * for the member that owns the OAuth credential, so this works for fresh
 * accounts without any pre-2.0 workspace API key. The request goes to the
 * login's Console server, scoped to the login's org when it has one.
 */
export declare function queryOpenCodeGoConsoleStatus(credential: OpenCodeConsoleCredential, options?: {
    requestTimeoutMs?: number;
}): Promise<OpenCodeGoResult>;
