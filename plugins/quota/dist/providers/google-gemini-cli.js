import { classifyWindow } from "../core/windows.js";
import { GEMINI_CLI_FLAVOR } from "../lib/google-gemini-cli.js";
import { parseProviderModelRef } from "../lib/provider-model-matching.js";
import { keySlug, quotaRow } from "./contract.js";
import { fetchGoogleProviderQuota, googleCachePolicy, isGoogleProviderAvailable, remainingCount, } from "./google-oauth-provider.js";
function isGeminiCliModel(model) {
    const { providerId, modelId } = parseProviderModelRef(model);
    if (["google-gemini-cli", "gemini-cli", "gemini", "opencode-gemini-auth"].includes(providerId)) {
        return true;
    }
    return (providerId === "google" && !modelId.startsWith("antigravity-") && modelId.includes("gemini"));
}
const GEMINI_TIER_KEYS = {
    "Gemini Pro": "pro",
    "Gemini Flash": "flash",
    "Gemini Flash Lite": "flash_lite",
};
/** Gemini's token types as count units; a type it does not name counts plain units. */
const GEMINI_TOKEN_UNITS = {
    REQUESTS: "request",
    TOKENS: "token",
};
/**
 * The quality tiers keep fixed keys; other models are keyed `model.<name>`. The row has the
 * remaining count when Gemini gives one.
 */
function geminiCliRow(bucket) {
    const model = bucket.displayName.replace(/:+$/u, "").trim();
    if (!model)
        return undefined;
    const short = model.replace(/^Gemini\s+/u, "") || model;
    const unit = GEMINI_TOKEN_UNITS[bucket.tokenType?.trim().toUpperCase() ?? ""] ?? "unit";
    const remaining = remainingCount(bucket.remainingAmount, unit);
    return {
        ...quotaRow({
            key: GEMINI_TIER_KEYS[model] ?? `model.${keySlug(short)}`,
            label: short,
            window: classifyWindow(model),
            percentRemaining: bucket.percentRemaining,
            resetsAt: bucket.resetTimeIso,
        }),
        ...(remaining ? { remaining } : {}),
    };
}
const GEMINI_CLI_PROVIDER = {
    quota: GEMINI_CLI_FLAVOR,
    failedLoginError: (resolveError) => `Gemini CLI sign-in could not be refreshed: ${resolveError}. Run \`opencode auth login google\`.`,
    row: geminiCliRow,
};
export const googleGeminiCliProvider = {
    id: "google-gemini-cli",
    cachePolicy: googleCachePolicy(GEMINI_CLI_PROVIDER),
    isAvailable: (ctx) => isGoogleProviderAvailable(GEMINI_CLI_PROVIDER, ctx),
    matchesCurrentModel: isGeminiCliModel,
    fetch: (ctx) => fetchGoogleProviderQuota(GEMINI_CLI_PROVIDER, ctx),
};
//# sourceMappingURL=google-gemini-cli.js.map