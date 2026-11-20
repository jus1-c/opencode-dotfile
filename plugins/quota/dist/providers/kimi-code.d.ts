/**
 * Kimi Code quota (global and China endpoints): the weekly usage and each named limit. Each key
 * stored in OpenCode is queried as its own account; without stored keys, the key the resolver
 * finds is.
 */
import type { QuotaProvider } from "../lib/entries.js";
export declare const kimiCodePlanGlobalProvider: QuotaProvider;
export declare const kimiCodePlanCnProvider: QuotaProvider;
