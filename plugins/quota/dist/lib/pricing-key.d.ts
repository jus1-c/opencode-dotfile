import type { TokenBuckets } from "./token-buckets.js";
type PricedKey = {
    provider: string;
    model: string;
};
type UnknownKey = {
    sourceProviderID: string;
    sourceModelID: string;
    mappedProvider?: string;
    mappedModel?: string;
    normalizedModelID?: string;
    providerCandidates?: string[];
    reason?: "missing_model" | "missing_provider" | "ambiguous_model";
};
type PricingResolution = {
    ok: true;
    key: PricedKey;
    method: "source_provider" | "model_prefix" | "unique_model" | "alias_fallback" | "cursor_local" | "cursor_api_alias";
} | {
    ok: false;
    unknown: UnknownKey;
};
export declare function resolvePricingKey(source: {
    providerID?: string;
    modelID?: string;
}): PricingResolution;
/**
 * What one message costs: in USD in all and per token kind, with what its cache reads saved
 * against the plain input price. "unpriced" is a known model without a price for this message,
 * "unknown" no usable match.
 */
export type MessagePrice = {
    kind: "priced";
    key: PricedKey;
    usd: number;
    byKind: TokenBuckets;
    cacheSavingsUsd: number;
} | {
    kind: "unpriced";
    key: PricedKey;
} | {
    kind: "unknown";
};
/**
 * What one message of `source` costs. Automatic matching (models.dev, Cursor's own table)
 * wins; `modelMap` (exact source model id → models.dev "provider/model") prices only a model
 * automatic matching cannot.
 */
export declare function priceMessage(source: {
    providerID?: string;
    modelID?: string;
}, tokens: TokenBuckets, options?: {
    modelMap?: Readonly<Record<string, string>>;
}): MessagePrice;
export {};
