import type { Settings } from "../settings/schema.js";
type PricingSettings = Settings["providers"]["pricing"];
/** Which price list reports use: "auto" (the newer of runtime and bundled), or one of them. */
export type PricingSnapshotSource = PricingSettings["source"];
export type CostBuckets = {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
    reasoning?: number;
};
type PricingSnapshot = {
    _meta: {
        source: string;
        generatedAt: number;
        providers: string[];
        units: string;
    };
    providers: Record<string, Record<string, CostBuckets>>;
};
interface PricingRefreshStateV1 {
    version: 1;
    updatedAt: number;
    lastAttemptAt?: number;
    lastSuccessAt?: number;
    lastFailureAt?: number;
    lastResult?: "success" | "not_modified" | "skipped_fresh" | "skipped_throttled" | "failed";
    lastError?: string;
    etag?: string;
    lastModified?: string;
}
type ListSource = "runtime" | "bundled" | "empty";
/** Everything the status report and `status --json` say about the price list. */
export interface PriceListDescription {
    /** The settings' choice. */
    selection: PricingSnapshotSource;
    /** The list in use: downloaded, shipped, or none readable. */
    source: ListSource;
    meta: PricingSnapshot["_meta"];
    /** The list's age against the days the settings allow. */
    health: {
        ageMs: number;
        maxAgeMs: number;
        stale: boolean;
    };
    paths: {
        snapshot: string;
        refreshState: string;
    };
    refreshState: PricingRefreshStateV1 | null;
    /** The ids of the list shipped in this package, never a downloaded one. */
    bundledProviderIds: ReadonlySet<string>;
    /** The model ids of the shipped list, under any provider. */
    bundledModelIds: ReadonlySet<string>;
}
/**
 * Follows the pricing settings `current` gives, read each time they matter (which list and how
 * many days old it may get before a download), until the returned function unbinds them.
 * Unbinding removes only this binding; the last binding still bound wins, else "auto", 7 days.
 */
export declare function usePricingSettings(current: () => PricingSettings): () => void;
/**
 * Starts a models.dev download when the list is due for one (see `refresh`) and waits for it at
 * most 0.75 s; a slower download goes on in the background. The wait's timer ends with the wait,
 * so it never keeps the process running.
 */
export declare function refreshPricesIfDue(): Promise<void>;
/**
 * Downloads the price list from models.dev now, whatever its age. With the settings on the
 * bundled list, the download is kept but lookups keep using the bundled one.
 */
export declare function downloadPrices(): Promise<{
    ok: boolean;
    message: string;
}>;
/** The list lookups use now: the settings' choice, the list it gave and its header. */
export declare function activePriceList(): Pick<PriceListDescription, "selection" | "source" | "meta">;
export declare function describePriceList(): Promise<PriceListDescription>;
/** A model's prices; own keys only, so "constructor" or "__proto__" is never a model. */
export declare function lookupCost(providerId: string, modelId: string): CostBuckets | null;
export declare function hasProvider(providerId: string): boolean;
export declare function hasModel(providerId: string, modelId: string): boolean;
export declare function listProvidersForModelId(modelId: string): string[];
export declare function __resetPricingSnapshotForTests(): void;
export {};
