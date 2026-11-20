import type { DebugDetail } from "../core/types.js";
import type { QuotaProvider } from "../lib/entries.js";
import type { QuotaProviderDefinition } from "../lib/quota-providers.js";
import { type AccountResult, type FetchError, type ProviderRow } from "./contract.js";
/**
 * One definition's account and its check for /quota_status. `failure` is why the whole check
 * failed (no rows); `missingKey` is set when that is a missing API key.
 */
export type DefinitionResult = {
    account: AccountResult;
    check: DebugDetail;
    failure?: string;
    missingKey?: true;
};
/**
 * A definition's rows and errors as its own account: the definition id is the login, and each
 * row id is `custom.<definition id>.<key>`.
 */
export declare function customAccount(definition: QuotaProviderDefinition, rows: readonly ProviderRow[], errors: readonly FetchError[]): AccountResult;
/**
 * One check of one definition now: its rows or errors as its own account, and its check for
 * /quota_status. The provider and the agent's `quota_provider_test` both use it.
 */
export declare function checkDefinition(definition: QuotaProviderDefinition, directory: string, requestTimeoutMs?: number): Promise<DefinitionResult>;
export declare const quotaProvidersProvider: QuotaProvider;
