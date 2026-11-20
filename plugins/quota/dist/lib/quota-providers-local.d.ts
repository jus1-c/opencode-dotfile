import type { ProviderRow } from "../providers/contract.js";
import type { OpenCodeMessage } from "./opencode-storage.js";
import { type LocalEstimateQuotaProviderDefinition, type LocalEstimateWindow } from "./quota-providers.js";
import { type TokenBuckets } from "./token-buckets.js";
/** OpenCode's completed assistant messages in a time range. */
export type ReadCompletedMessages = (params: {
    completedSinceMs: number;
    completedUntilMs: number;
}) => Promise<OpenCodeMessage[]>;
/** A completed request: the message it came from and when it completed. */
interface CountedRequest {
    id: string;
    atMs: number;
    modelId: string;
    tokens: TokenBuckets;
}
/** One window's requests: when it resets and, for a UTC day, when it started. */
export interface WindowCount {
    window: LocalEstimateWindow;
    /** Oldest first. */
    requests: CountedRequest[];
    resetsAt?: string;
    windowStartedAt?: string;
}
/**
 * This machine's completed requests to `providerIds` (and `modelIds`, when given) in each
 * window, read from OpenCode's own messages since the longest window began. With
 * `requireModelId`, a message that names no model is left out. A message counts once. A rolling window resets when its oldest request leaves it; a UTC day at midnight UTC.
 */
export declare function countRequestWindows(params: {
    providerIds: readonly string[];
    modelIds?: readonly string[];
    requireModelId?: boolean;
    windows: readonly LocalEstimateWindow[];
    nowMs: number;
    readMessages?: ReadCompletedMessages;
}): Promise<WindowCount[]>;
/**
 * A local estimate's rows: each window's requests out of its limit and, with a USD budget, the
 * spend out of the budget. Each key is the part of the row id after `custom.<definition id>.`.
 */
export declare function collectLocalQuotaProviderEstimate(definition: LocalEstimateQuotaProviderDefinition, dependencies?: {
    nowMs?: number;
    readMessages?: ReadCompletedMessages;
}): Promise<{
    rows: ProviderRow[];
}>;
export {};
