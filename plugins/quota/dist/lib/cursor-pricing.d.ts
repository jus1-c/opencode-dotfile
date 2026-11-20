import type { CostBuckets } from "./modelsdev-pricing.js";
export type CursorQuotaPlan = "none" | "pro" | "pro-plus" | "ultra";
/** "unpriced": Cursor's own price, which no table here holds. */
type CursorResolvedModel = {
    kind: "local";
    model: CursorLocalPricingModel;
    pool: "auto_composer" | "api";
} | {
    kind: "official";
    providerHint: string;
    modelHint: string;
    pool: "api";
} | {
    kind: "unpriced";
} | {
    kind: "unknown";
};
declare const CURSOR_LOCAL_PRICING: {
    auto: {
        input: number;
        output: number;
        cache_read: number;
    };
    "claude-fable-5-2": {
        input: number;
        output: number;
        cache_read: number;
        cache_write: number;
    };
    "composer-1": {
        input: number;
        output: number;
        cache_read: number;
    };
    "composer-1.5": {
        input: number;
        output: number;
        cache_read: number;
    };
    "composer-2": {
        input: number;
        output: number;
        cache_read: number;
    };
    "composer-2-fast": {
        input: number;
        output: number;
        cache_read: number;
    };
    "composer-2.5": {
        input: number;
        output: number;
        cache_read: number;
    };
    "composer-2.5-fast": {
        input: number;
        output: number;
        cache_read: number;
    };
    "deepseek-v41-flash-1017": {
        input: number;
        output: number;
        cache_read: number;
    };
    "grok-4.5": {
        input: number;
        output: number;
        cache_read: number;
    };
    "grok-4.5-fast": {
        input: number;
        output: number;
        cache_read: number;
    };
    "grok-4.6": {
        input: number;
        output: number;
        cache_read: number;
    };
    "grok-4.6-fast": {
        input: number;
        output: number;
        cache_read: number;
    };
    "grok-4.7": {
        input: number;
        output: number;
        cache_read: number;
    };
    "grok-4.7-fast": {
        input: number;
        output: number;
        cache_read: number;
    };
};
type CursorLocalPricingModel = keyof typeof CURSOR_LOCAL_PRICING;
export declare const CURSOR_OFFICIAL_MODEL_ALIASES: Readonly<Record<string, {
    providerHint: string;
    modelHint: string;
}>>;
export declare function isCursorProviderId(raw?: string): boolean;
export declare function isCursorModelId(raw?: string): boolean;
export declare function getCursorPlanDisplayName(plan: CursorQuotaPlan): string | null;
export declare function getEffectiveCursorIncludedApiUsd(params: {
    plan: CursorQuotaPlan;
    overrideUsd?: number;
}): number | undefined;
export declare function lookupCursorLocalCost(model: string): CostBuckets | null;
/** Whether Cursor bills a request of `rawModelId` with `promptTokens` of prompt at base rates. */
export declare function cursorBaseRatesCoverPrompt(rawModelId: string | undefined, promptTokens: number): boolean;
/**
 * `rates` as OpenCode bills a Cursor model through cursor-opencode-provider: a cache write costs
 * Cursor's cache-write rate, nothing when Cursor publishes none. The provider settles each turn
 * at what Cursor billed partly with such free cache writes.
 */
export declare function cursorBilledRates(rawModelId: string | undefined, rates: CostBuckets): CostBuckets;
export declare function resolveCursorModel(rawModelId?: string): CursorResolvedModel;
export {};
