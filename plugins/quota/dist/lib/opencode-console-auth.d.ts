/**
 * OpenCode Console credential reader
 *
 * OpenCode 2 keeps its OpenCode Console sign-in (`opencode auth login opencode`)
 * under the `opencode` integration as an OAuth connection created by the device
 * flow (`client_id: opencode-cli`, default server `https://opencode.ai/console`,
 * stored as `metadata.server`). Consumers call the console APIs with
 * `consoleBaseUrl` and `consoleHeaders`: the access token as
 * `Authorization: Bearer`, plus `metadata.orgID` as `x-org-id` when present.
 *
 * The login is read through OpenCode's plugin API, which refreshes a token that
 * is about to expire (and saves the new one) before returning it. A failed
 * refresh is reported as `invalid`.
 *
 * OpenCode Zen and OpenCode Go share this one login: the same identity rule and
 * the same words for a login that can't be used.
 */
import { type ResolvedAuthIdentity } from "./resolved-auth-identity.js";
export interface OpenCodeConsoleCredential {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    accountId?: string;
    orgId?: string;
    orgName?: string;
    email?: string;
    server?: string;
}
export type OpenCodeConsoleAuthState = {
    state: "none";
    reason?: "not_oauth";
} | {
    state: "configured";
    credential: OpenCodeConsoleCredential;
} | {
    state: "expired";
    credential: OpenCodeConsoleCredential;
} | {
    state: "invalid";
    error: string;
};
export declare function resolveOpenCodeConsoleAuth(params?: {
    nowMs?: number;
}): Promise<OpenCodeConsoleAuthState>;
/**
 * Why an expired or failed Console login can't be used (`detail`), and the error both Zen and Go
 * show for it, which reads as "Sign in again".
 */
export declare function consoleSignInFailure(auth: Extract<OpenCodeConsoleAuthState, {
    state: "expired" | "invalid";
}>): {
    detail: string;
    message: string;
};
/**
 * Who the Console login is, for `providerId`'s cache: org + account (member budgets are per
 * account), else the account, else the token. The Console URL qualifies it because org ids can
 * collide across self-hosted Console URLs.
 */
export declare function consoleLoginIdentity(providerId: string, credential: OpenCodeConsoleCredential): Promise<ResolvedAuthIdentity | null>;
/** The Console server the login belongs to. */
export declare function consoleBaseUrl(credential: OpenCodeConsoleCredential): string;
/** Console API request headers; `x-org-id` only when the login has an org. */
export declare function consoleHeaders(credential: OpenCodeConsoleCredential): Record<string, string>;
