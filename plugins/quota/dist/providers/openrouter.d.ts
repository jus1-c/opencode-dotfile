/**
 * OpenRouter: the budget or spend of the key GET https://openrouter.ai/api/v1/key reports. It
 * reads the reply with the custom-provider OpenRouter format, so built-in and custom OpenRouter
 * sources read it the same way.
 */
import type { QuotaProvider } from "../lib/entries.js";
import { type QuotaProviderAuthResolution } from "../lib/quota-providers-remote.js";
/** The key from the env variable, OpenCode's config files for `directory`, or its logins. */
export declare function resolveOpenRouterApiKey(directory: string): Promise<QuotaProviderAuthResolution>;
export declare const openRouterProvider: QuotaProvider;
