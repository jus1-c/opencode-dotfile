/**
 * Xiaomi MiMo: the token plan's monthly tokens and the account balance, scraped from the
 * platform.xiaomimimo.com dashboard with the user's session cookie (see `mimo-config.ts`).
 * Its usage, plan and balance endpoints are read at once; each one that fails is its own error.
 */
import type { QuotaProvider } from "../lib/entries.js";
export declare const xiaomiProvider: QuotaProvider;
