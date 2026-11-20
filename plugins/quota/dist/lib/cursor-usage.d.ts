import { type TokenBuckets } from "./token-buckets.js";
interface CursorCycleWindow {
    sinceMs: number;
    untilMs: number;
    resetTimeIso: string;
    source: "configured_day" | "calendar_month";
}
interface CursorUsageBucket {
    costUsd: number;
    tokens: TokenBuckets;
    messageCount: number;
}
interface CursorUsageSummary {
    window: CursorCycleWindow;
    observedAtMs: number;
    api: CursorUsageBucket;
    autoComposer: CursorUsageBucket;
    total: CursorUsageBucket;
    unknownModels: Array<{
        sourceModelID: string;
        messageCount: number;
        tokens: TokenBuckets;
    }>;
    /** Requests of known models without a price: prompts past Cursor's long-context threshold. */
    unpricedRequestCount: number;
}
/** A configured start day (1-28) sets the cycle; otherwise the cycle is the calendar month. */
export declare function computeCursorCycleWindow(params?: {
    nowMs?: number;
    billingCycleStartDay?: number;
}): CursorCycleWindow;
export declare function getCurrentCursorUsageSummary(params?: {
    nowMs?: number;
    billingCycleStartDay?: number;
}): Promise<CursorUsageSummary>;
export {};
