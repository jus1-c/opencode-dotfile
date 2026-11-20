/**
 * Vilao: the pay-as-you-go balance of each Vilao PAT login, as a share of the last balance this
 * machine saw rise. Vilao reports no plan or quota windows, so the row is a balance with a
 * percent and no reset time.
 */
import type { QuotaProvider } from "../lib/entries.js";
export declare const vilaoProvider: QuotaProvider;
