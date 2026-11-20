import { type CanonicalQuotaProviderId } from "./provider-registration.js";
export type { CanonicalQuotaProviderId } from "./provider-registration.js";
interface QuotaProviderCatalogEntry {
    label: string;
    labelAliases: readonly string[];
    runtimeIds: readonly string[];
    synonyms: readonly string[];
}
/** Every provider in registration order. */
export declare const QUOTA_PROVIDER_CATALOG: Readonly<Record<CanonicalQuotaProviderId, QuotaProviderCatalogEntry>>;
export declare const QUOTA_PROVIDER_RUNTIME_IDS: Readonly<Record<CanonicalQuotaProviderId, readonly string[]>>;
/** The v6 row keys each provider may emit; see `rowKeys` in provider-registration.ts. */
export declare const PROVIDER_ROW_KEYS: Readonly<Record<CanonicalQuotaProviderId, readonly string[]>>;
/** Trimmed, lowercase, and a synonym ("claude") turned into its provider id ("anthropic"). */
export declare function normalizeQuotaProviderId(id: string): string;
/** The provider id for an id or synonym ("claude" → "anthropic"); none for an unknown id. */
export declare function getCanonicalQuotaProviderId(id: string): CanonicalQuotaProviderId | undefined;
/** The provider's label; an unknown id is shown as given. */
export declare function getQuotaProviderDisplayLabel(id: string): string;
/** The OpenCode provider ids that count as this provider (narrower than its synonyms). */
export declare function getQuotaProviderRuntimeIds(id: string): readonly string[];
export declare function getQuotaProviderIdsForRuntimeId(id: string): readonly CanonicalQuotaProviderId[];
/** Brand words at the start of the provider's account names; none for an unknown id. */
export declare function getQuotaProviderGroupBrands(providerId: string): readonly string[];
export declare function isLiveLocalUsageProviderId(id: string): boolean;
