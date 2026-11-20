/**
 * Ollama Cloud (https://docs.ollama.com/api/balance): included credits (credit plans) or session
 * and weekly limits (legacy plans), and purchased credits. Each key stored in OpenCode is queried
 * as its own account; an env or config key is used alone.
 */
import type { QuotaProvider } from "../lib/entries.js";
export declare const ollamaCloudProvider: QuotaProvider;
