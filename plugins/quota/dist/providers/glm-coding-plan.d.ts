/**
 * Z.ai and Zhipu: one GLM coding plan fetcher with two endpoints. Each key stored in OpenCode
 * is queried as its own account; without stored keys, the key the resolver finds is.
 */
import type { QuotaProvider } from "../lib/entries.js";
export declare const zaiProvider: QuotaProvider;
export declare const zhipuProvider: QuotaProvider;
