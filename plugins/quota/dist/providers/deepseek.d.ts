/**
 * DeepSeek: the exact balances GET https://api.deepseek.com/user/balance reports, per currency.
 * Each key stored in OpenCode is queried as its own account; an env or config key is used alone.
 */
import type { QuotaProvider } from "../lib/entries.js";
export declare const deepseekProvider: QuotaProvider;
