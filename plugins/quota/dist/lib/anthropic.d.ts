/**
 * Anthropic Claude quota probing.
 *
 * OpenCode-backed checks ask each stored Claude login once at Anthropic's OAuth usage endpoint.
 * Claude Code-backed checks, and checks without an OpenCode login, probe the local Claude
 * CLI/runtime for install/auth state; when Claude auth
 * is confirmed but local quota windows are missing, the usage endpoint is asked with Claude's
 * own OAuth credentials (macOS Keychain first, then the local credentials file).
 */
import type { ErrorFacts } from "../core/errors.js";
import { type CredentialRow } from "./opencode-auth.js";
import { type ResolvedAuthIdentity } from "./resolved-auth-identity.js";
export interface AnthropicQuotaResult {
    success: true;
    /** None on a plan without a 5-hour limit, such as Ultra. */
    five_hour?: {
        percentRemaining: number;
        resetTimeIso?: string;
    };
    /** None on a plan without a weekly limit, such as Enterprise. */
    seven_day?: {
        percentRemaining: number;
        resetTimeIso?: string;
    };
    extra_usage?: {
        percentRemaining: number;
    };
    fable_weekly?: {
        percentRemaining: number;
        resetTimeIso?: string;
    };
}
interface AnthropicQuotaError {
    success: false;
    error: string;
    facts?: ErrorFacts;
    /** Anthropic rejected the token (HTTP 401 or 403). */
    rejected?: true;
}
type AnthropicAuthStatus = "authenticated" | "unauthenticated" | "unknown";
type AnthropicQuotaSource = "claude-auth-status-json" | "claude-credentials-oauth-api" | "none";
/** What the Claude CLI and Claude's own credentials gave, without OpenCode's logins. */
export interface AnthropicDiagnostics {
    installed: boolean;
    version: string | null;
    authStatus: AnthropicAuthStatus;
    quotaSupported: boolean;
    quotaSource: AnthropicQuotaSource;
    /** Set when Claude's own OAuth token was read for the usage probe. */
    oauthCredentialSource?: "claude-credentials";
    /**
     * The Claude CLI the probe ran: the configured path, `claude (PATH)`, or an
     * install-folder path. Null when no Claude CLI was found.
     */
    binaryPath: string | null;
    checkedCommands: string[];
    message?: string;
    /** The facts of the usage request that failed. */
    facts?: ErrorFacts;
    quota?: AnthropicQuotaResult;
}
interface AnthropicProbeOptions {
    binaryPath?: string;
    requestTimeoutMs?: number;
}
type ClaudeCommandInvocation = {
    file: string;
    args: string[];
    display: string;
    /** Set when `args` holds one cmd.exe command line that must not be quoted a second time. */
    windowsVerbatimArguments?: boolean;
};
type ResolvedAnthropicOAuth = {
    state: "none";
} | {
    state: "failed";
    error: string;
} | {
    state: "expired";
    expiresAt: number;
} | {
    state: "configured";
    accessToken: string;
    expiresAt?: number;
};
/** A Claude sign-in's state; `none` for a row that is not an OAuth login or has no token. */
export declare function resolveAnthropicOAuth(row: CredentialRow, options?: {
    nowMs?: number;
}): ResolvedAnthropicOAuth;
export type AnthropicLogin = {
    row: CredentialRow;
    auth: Exclude<ResolvedAnthropicOAuth, {
        state: "none";
    }>;
};
/**
 * Every OpenCode Claude sign-in with a token, in OpenCode's order (the one it uses first). A
 * sign-in OpenCode could not return, or whose token expired, stays, so it shows as its own error.
 */
export declare function readAnthropicLogins(): Promise<AnthropicLogin[]>;
export declare function buildClaudeCommandInvocation(binaryPath: string, args: string[], runtime?: {
    platform?: NodeJS.Platform;
    comspec?: string;
}): ClaudeCommandInvocation;
/**
 * Quota from Claude CLI `auth status --json`: only the 5h and 7d windows, and only when both are
 * there. A plan without one of them (Ultra, Enterprise) has Usage Credits or Fable weekly that
 * only the OAuth usage endpoint reads, so that reply is not local quota and the endpoint runs.
 */
declare function parseUsageResponse(data: unknown): AnthropicQuotaResult | null;
/** Quota from the OAuth usage endpoint: the 5h and 7d windows, Usage Credits and Fable weekly. */
declare function parseOAuthUsageResponse(data: unknown): AnthropicQuotaResult | null;
export declare function queryAnthropicQuotaWithOAuth(accessToken: string, requestTimeoutMs?: number): Promise<AnthropicQuotaResult | AnthropicQuotaError>;
export declare function clearAnthropicDiagnosticsCacheForTests(): void;
export declare function getAnthropicDiagnostics(options?: AnthropicProbeOptions): Promise<AnthropicDiagnostics>;
export declare function hasAnthropicCredentialsConfigured(options?: AnthropicProbeOptions & {
    useClaudeCodeCredentials?: boolean;
}): Promise<boolean>;
/**
 * Who Claude is signed in as: every OpenCode login when there are some, since only they are
 * checked then; else the Claude CLI's credentials.
 */
export declare function anthropicLoginsIdentity(logins: readonly AnthropicLogin[], options?: AnthropicProbeOptions): Promise<ResolvedAuthIdentity | null>;
export { parseOAuthUsageResponse, parseUsageResponse };
