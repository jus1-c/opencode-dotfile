/**
 * Each provider in `provider-registration.ts` order (the display order), bound to its id.
 * A provider's facts live there; its fetch and cache policy in `src/providers/<vendor>.ts`.
 */
import type { QuotaProvider } from "../lib/entries.js";
export declare function getProviders(): QuotaProvider[];
