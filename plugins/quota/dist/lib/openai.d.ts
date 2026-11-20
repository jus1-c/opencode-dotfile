/**
 * OpenAI (ChatGPT) quota fetcher
 *
 * Reads OpenCode's OpenAI OAuth logins and queries
 * https://chatgpt.com/backend-api/wham/usage
 */
import type { FixedWindowProjectionEvidence } from "./entries.js";
import { type CredentialRow } from "./opencode-auth.js";
import { type ResolvedAuthIdentity } from "./resolved-auth-identity.js";
import type { QuotaError } from "./types.js";
type OpenAIWindowKind = "hourly" | "weekly" | "monthly";
type OpenAIWindowValue = {
    percentRemaining: number;
    resetTimeIso?: string;
    fixedWindow?: FixedWindowProjectionEvidence;
};
type OpenAIWindows = Partial<Record<OpenAIWindowKind | "codeReview", OpenAIWindowValue>>;
export declare const OPENAI_AUTH_SOURCE_KEYS: readonly ["openai", "codex", "chatgpt"];
type OpenAIAuthSourceKey = (typeof OPENAI_AUTH_SOURCE_KEYS)[number];
export type OpenAICredits = {
    balance?: string;
    unlimited?: boolean;
};
export type OpenAIResult = {
    success: true;
    label: string;
    windows: OpenAIWindows;
    credits?: OpenAICredits;
} | QuotaError;
/** A stored OpenAI login: one OpenCode could not return, or one with an access token. */
export type OpenAIOAuthLogin = {
    state: "failed";
    sourceKey: OpenAIAuthSourceKey;
    error: string;
} | {
    state: "configured";
    sourceKey: OpenAIAuthSourceKey;
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    accountId?: string;
};
type ResolvedOpenAIOAuth = {
    state: "none";
} | OpenAIOAuthLogin;
/** One row's OpenAI sign-in: `none` for a row that is not an OAuth login or has no token. */
export declare function resolveOpenAIOAuth(row: CredentialRow): ResolvedOpenAIOAuth;
/**
 * The login OpenCode reports as active, the first of `openai`, `codex`, `chatgpt` with a token
 * or a resolve error (cached briefly).
 */
export declare function readOpenAIAuthCached(): Promise<ResolvedOpenAIOAuth>;
/** A stored OpenAI login (OAuth or API key) with its OAuth sign-in, when it has one. */
export type OpenAILogin = {
    row: CredentialRow;
    oauth?: OpenAIOAuthLogin;
};
/** Every stored OpenAI login, OAuth and API key; a failed one stays so it shows as an error. */
export declare function readOpenAILogins(): Promise<OpenAILogin[]>;
/**
 * Who OpenAI is signed in as: each OAuth sign-in's account (or token), and each other login by
 * its connection, since its rows do not depend on a secret. A failed login can't be told apart.
 */
export declare function openaiLoginsIdentity(logins: readonly OpenAILogin[]): Promise<ResolvedAuthIdentity | null>;
export declare function queryOpenAIQuota(options: {
    auth: OpenAIOAuthLogin;
    requestTimeoutMs?: number;
    loginLabel?: string;
}): Promise<OpenAIResult>;
export {};
