/**
 * Provider results as v6 rows. Every provider returns the row contract (`ProviderFetchResult`,
 * see `providers/contract.ts`); each row gets its id (`${providerId}.${key}`), its provider and
 * its account's account text.
 */
import type { ProviderFetchResult } from "../providers/contract.js";
import type { ProviderFetch } from "./store.js";
/**
 * The account or plan in a legacy group: "OpenAI (Pro)" → "Pro", "[Claude Work] (active)" →
 * "Work", "[OpenAI Work] (Business)" → "Work (Business)". "(active)" is dropped: it moves
 * when the user switches logins, and the account must stay the same.
 */
export declare function accountFromGroup(providerId: string, group: string | undefined): string | undefined;
/**
 * A provider result as v6 rows, the error to show and the debug details. Each row is checked on
 * its own, so it keeps its login. `rowLogins` holds the logins as the provider gave them; the
 * provider source keys them before the store gets them.
 */
export declare function rowsFromProviderResult(providerId: string, result: ProviderFetchResult, nowMs?: number): ProviderFetch;
