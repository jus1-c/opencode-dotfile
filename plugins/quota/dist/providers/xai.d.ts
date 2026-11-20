/**
 * xAI SuperGrok: the shared credits meter of each OpenCode xAI sign-in, the one Grok Build shows
 * (GET https://cli-chat-proxy.grok.com/v1/billing?format=credits). Once it is read, the
 * subscription (GET https://grok.com/rest/subscriptions) may refine the account name. A sign-in
 * OpenCode could not return shows as its own error. OpenCode alone refreshes the OAuth tokens.
 */
import type { QuotaProvider } from "../lib/entries.js";
export declare const xaiProvider: QuotaProvider;
