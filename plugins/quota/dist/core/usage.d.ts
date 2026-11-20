import type { SessionTokens, Words } from "./types.js";
import type { UsageRange } from "./usage-ranges.js";
export { DEFAULT_USAGE_RANGE, parseUsageArguments, USAGE_RANGES, type UsageRange, usageRangeLabel, } from "./usage-ranges.js";
export type UsageQuery = {
    range: UsageRange;
    /** The session for "session", which also counts its subagent sessions. */
    sessionID?: string;
    /** For "session": false counts the session alone, without its subagent sessions. */
    subagents?: boolean;
    /** Local dates like "2026-01-31" for "between", both included. */
    from?: string;
    to?: string;
};
/** Token counts by kind; `processed` = `cachedInput` + `uncachedInput` + `output`. */
type UsageTokens = {
    processed: number;
    cachedInput: number;
    uncachedInput: number;
    output: number;
};
/** Cost or tokens by the kinds that have their own price. */
export type UsageByType = {
    input: number;
    cacheRead: number;
    cacheWrite: number;
    /** Output and reasoning. */
    output: number;
};
/** One breakdown line. Shares are 0..1 of the report's total, and 0 when that total is 0. */
export type UsageRow = {
    costUsd: number;
    costShare: number;
    /** Processed tokens. */
    tokens: number;
    tokenShare: number;
    /** Processed tokens of models without a price; they add no cost. */
    unpricedTokens: number;
};
export type UsageProviderRow = UsageRow & {
    /** OpenCode's provider id, for example "anthropic" or "github-copilot". */
    providerID: string;
    sessions: number;
    /** This provider's requests, counted like `totals.requests`. */
    requests: number;
};
/** `date` is a local day like "2026-01-31". */
export type UsageDayRow = UsageRow & {
    date: string;
};
export type UsageModelRow = UsageRow & {
    providerID: string;
    modelID: string;
    /** True when any of its messages had a price (a price can depend on the prompt's size). */
    priced: boolean;
    costByType: UsageByType;
    tokensByType: UsageByType;
    /**
     * The model's days with usage, oldest first; days without usage are left out. A day is priced
     * when any of the model's messages that day had a price.
     */
    days: Array<{
        date: string;
        costUsd: number;
        tokens: number;
        priced: boolean;
    }>;
};
export type UsageReport = {
    range: UsageRange;
    /** The time window (epoch ms, both included); absent for "all" and "session". */
    sinceMs?: number;
    untilMs?: number;
    /** Present for "session". */
    sessionID?: string;
    generatedAtMs: number;
    totals: {
        costUsd: number;
        sessions: number;
        /** Completed assistant messages with usage metadata, plus usage-bearing compactions. */
        requests: number;
        tokens: UsageTokens;
        tokensByType: UsageByType;
        costByType: UsageByType;
        cacheSavingsUsd: number;
        unpricedTokens: number;
        /** `unpricedTokens` / `tokens.processed`. */
        unpricedShare: number;
    };
    /** Most cost first, then most tokens. */
    providers: UsageProviderRow[];
    /** Most cost first, then most tokens. */
    models: UsageModelRow[];
    /** Every local day of the range (or from the first to the last message), oldest first. */
    days: UsageDayRow[];
    /**
     * OpenCode's name for each provider of `providers` that OpenCode lists, by provider id, like
     * "Moonshot AI" for "moonshotai". The server plugin adds it (`withProviderNames`).
     */
    providerNames?: Record<string, string>;
};
/**
 * The usage report for `query` at `nowMs`. Identical questions (same database, price list,
 * local day and query) share one read of the history: a request made while the same
 * report is being built waits for it, and a finished report answers again for 30 s, so its
 * numbers can be up to 30 s old. A failed report is not kept.
 */
export declare function usageReport(query: UsageQuery, nowMs?: number): Promise<UsageReport>;
/**
 * The report with OpenCode's names for its providers, from OpenCode's provider list: each on
 * one line, and an empty name left out.
 */
export declare function withProviderNames(report: UsageReport, openCodeProviders: ReadonlyArray<{
    id: string;
    name: string;
}>): UsageReport;
/**
 * The tokens a session used so far, counted as the Usage tab counts them: "in" is uncached
 * input (cache writes included), "out" is output with reasoning, compactions that recorded
 * usage count, and a fork's copies of its parent's messages don't. `scope: "tree"` adds its
 * subagent sessions. `models` holds each model's input by kind for the low cache line.
 * Undefined when no message used a token, or the session or OpenCode's database can't be read.
 * Identical reads share their work for 30 s while the database and its WAL are unchanged, unless
 * the read starts within 2 s of the last write to them.
 */
export declare function sessionUsage(sessionID: string, scope: Words["sessionTokens"]): Promise<SessionTokens | undefined>;
