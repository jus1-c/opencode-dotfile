/**
 * Which providers serve a session's model: the snapshot's `currentModelProviderIds` and the
 * `matchesCurrentModel` column of /quota_status.
 */
import type { QuotaProvider } from "../lib/entries.js";
import type { QuotaProviderDefinition } from "../lib/quota-providers.js";
export declare function matchesQuotaProviderCurrentSelection(params: {
    provider: QuotaProvider;
    currentModel?: string;
    currentProviderID?: string;
    enabledProviders?: string[] | "auto";
    automaticDiscovery?: boolean;
    quotaProviders?: QuotaProviderDefinition[];
}): boolean;
