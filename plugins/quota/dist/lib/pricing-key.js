/**
 * How an OpenCode source model (provider id + model id) maps to a models.dev (or Cursor) price
 * key, and what one message of it costs (`priceMessage`).
 */
import { cursorBaseRatesCoverPrompt, cursorBilledRates, isCursorModelId, isCursorProviderId, lookupCursorLocalCost, resolveCursorModel, } from "./cursor-pricing.js";
import { activePriceList, hasModel, hasProvider, listProvidersForModelId, lookupCost, } from "./modelsdev-pricing.js";
function normalizeModelId(raw) {
    let s = raw.trim();
    // routing prefixes
    if (s.toLowerCase().startsWith("antigravity-"))
        s = s.slice("antigravity-".length);
    // claude dotted versions -> hyphenated (models.dev uses dash): 4.5 -> 4-5, 4.6 -> 4-6, etc.
    s = s.replace(/(claude-[a-z-]+)-(\d+)\.(\d+)(?=$|[^0-9])/gi, "$1-$2-$3");
    // special: "glm-4.7-free" -> "glm-4.7"
    s = s.replace(/\bglm-(\d+)\.(\d+)-free\b/i, "glm-$1.$2");
    // internal OpenCode alias (Zen)
    if (s.toLowerCase() === "big-pickle")
        s = "glm-4.7";
    return s;
}
function stripFreeSuffix(modelId) {
    if (!modelId.toLowerCase().endsWith("-free"))
        return null;
    const stripped = modelId.slice(0, -"-free".length);
    return stripped || null;
}
function freeSuffixCandidates(modelId) {
    const candidates = [modelId];
    const stripped = stripFreeSuffix(modelId);
    if (stripped)
        candidates.push(stripped);
    return candidates.filter((value, index, list) => list.indexOf(value) === index);
}
function pickBestModelForProvider(providerID, candidates) {
    for (const candidate of candidates) {
        if (hasModel(providerID, candidate))
            return candidate;
    }
    return null;
}
function parseModelIdHint(rawModelId) {
    if (!rawModelId || typeof rawModelId !== "string")
        return {};
    const trimmed = rawModelId.trim();
    if (!trimmed)
        return {};
    const lastSlash = trimmed.lastIndexOf("/");
    if (lastSlash === -1)
        return { modelPart: trimmed };
    if (lastSlash === trimmed.length - 1)
        return { providerHint: trimmed.slice(0, -1) };
    return { providerHint: trimmed.slice(0, lastSlash), modelPart: trimmed.slice(lastSlash + 1) };
}
const SOURCE_PROVIDER_ALIASES = {
    cursor: "cursor",
    "cursor-acp": "cursor",
    "github-copilot": "openai",
    "copilot-chat": "openai",
    chatgpt: "openai",
    codex: "openai",
    "kimi-for-coding": "moonshotai",
    kimi: "moonshotai",
    "kimi-code": "moonshotai",
    "kimi-code-plan-global": "moonshotai",
    "kimi-code-plan-cn": "moonshotai",
    "zai-coding-plan": "zai",
    glm: "zai",
};
function normalizeSourceProviderId(raw) {
    if (!raw || typeof raw !== "string")
        return undefined;
    const lowered = raw.trim().toLowerCase();
    if (!lowered || lowered === "unknown")
        return undefined;
    const parts = lowered.split(/[/:]/g).filter(Boolean);
    const candidates = [lowered, ...parts].filter((v, i, arr) => arr.indexOf(v) === i);
    for (let i = candidates.length - 1; i >= 0; i--) {
        const candidate = candidates[i];
        if (hasProvider(candidate))
            return candidate;
        const alias = Object.hasOwn(SOURCE_PROVIDER_ALIASES, candidate)
            ? SOURCE_PROVIDER_ALIASES[candidate]
            : undefined;
        if (alias && hasProvider(alias))
            return alias;
    }
    return Object.hasOwn(SOURCE_PROVIDER_ALIASES, lowered)
        ? SOURCE_PROVIDER_ALIASES[lowered]
        : lowered;
}
function inferOfficialProviderFromModelId(modelId) {
    // Prefer snapshot-driven inference when possible.
    // This keeps mapping future-proof as models.dev adds providers/models.
    const providers = listProvidersForModelId(modelId);
    if (providers.length === 1)
        return providers[0] ?? null;
    const lower = modelId.toLowerCase();
    if (lower.startsWith("claude"))
        return "anthropic";
    if (lower.startsWith("gpt") || lower.startsWith("o"))
        return "openai";
    if (lower.startsWith("gemini"))
        return "google";
    if (lower.startsWith("kimi"))
        return "moonshotai";
    if (lower.startsWith("glm"))
        return "zai";
    if (lower.startsWith("grok"))
        return "xai";
    if (lower.includes("claude"))
        return "anthropic";
    if (lower.includes("gemini"))
        return "google";
    if (lower.includes("gpt"))
        return "openai";
    if (lower.includes("kimi"))
        return "moonshotai";
    if (lower.includes("glm"))
        return "zai";
    if (lower.includes("grok"))
        return "xai";
    return null;
}
/**
 * Get pricing alias candidates for Anthropic models when the exact key is missing.
 * Returns ordered candidates to try, including the original model.
 */
function anthropicPricingCandidates(model) {
    // model is expected normalized like "claude-opus-4-6"
    if (model === "claude-opus-4-6")
        return [model, "claude-opus-4-5"];
    if (model === "claude-sonnet-4-6")
        return [model, "claude-sonnet-4-7", "claude-sonnet-4-5"];
    // Future-proof: try next lower version for any claude-*-N-M pattern
    const match = model.match(/^(claude-[a-z]+-\d+)-(\d+)$/);
    if (match) {
        const [, prefix, minor] = match;
        const minorNum = parseInt(minor, 10);
        if (minorNum > 0) {
            return [model, `${prefix}-${minorNum - 1}`];
        }
    }
    return [model];
}
function moonshotaiPricingCandidates(model) {
    const candidates = [];
    for (const freeCandidate of freeSuffixCandidates(model)) {
        candidates.push(freeCandidate);
        if (freeCandidate.includes(".")) {
            candidates.push(freeCandidate.replace(/\./g, "-"));
        }
    }
    if (model === "k3" || model === "k3-256k") {
        candidates.push("kimi-k3");
    }
    return candidates.filter((value, index, list) => list.indexOf(value) === index);
}
function resolveModelForProvider(providerID, normalizedModel) {
    if (!hasProvider(providerID))
        return null;
    const preferredDirect = pickBestModelForProvider(providerID, freeSuffixCandidates(normalizedModel));
    if (preferredDirect)
        return preferredDirect;
    // Some source ids include "-thinking" while snapshot keeps a base key (or vice versa).
    if (normalizedModel.toLowerCase().endsWith("-thinking")) {
        const withoutThinking = normalizedModel.slice(0, -"-thinking".length);
        if (hasModel(providerID, withoutThinking))
            return withoutThinking;
    }
    // Kimi naming: some logs use kimi-k2, while snapshot may use kimi-k2-thinking.
    if (providerID === "moonshotai" && normalizedModel === "kimi-k2") {
        if (hasModel("moonshotai", "kimi-k2-thinking"))
            return "kimi-k2-thinking";
    }
    if (providerID === "moonshotai") {
        const preferredMoonshot = pickBestModelForProvider("moonshotai", moonshotaiPricingCandidates(normalizedModel));
        if (preferredMoonshot)
            return preferredMoonshot;
    }
    // Gemini naming fallback: some logs omit -preview.
    if (providerID === "google") {
        if (normalizedModel === "gemini-3-pro" && hasModel("google", "gemini-3-pro-preview")) {
            return "gemini-3-pro-preview";
        }
        if (normalizedModel === "gemini-3-flash" && hasModel("google", "gemini-3-flash-preview")) {
            return "gemini-3-flash-preview";
        }
    }
    // Anthropic alias fallback: try alternative version keys when exact key is missing.
    if (providerID === "anthropic") {
        const candidates = anthropicPricingCandidates(normalizedModel);
        for (const candidate of candidates) {
            if (hasModel("anthropic", candidate))
                return candidate;
        }
    }
    return null;
}
export function resolvePricingKey(source) {
    const srcProvider = source.providerID ?? "unknown";
    const srcModel = source.modelID ?? "unknown";
    if (!source.modelID || typeof source.modelID !== "string") {
        return {
            ok: false,
            unknown: { sourceProviderID: srcProvider, sourceModelID: srcModel, reason: "missing_model" },
        };
    }
    const parsed = parseModelIdHint(source.modelID);
    if (!parsed.modelPart) {
        return {
            ok: false,
            unknown: {
                sourceProviderID: srcProvider,
                sourceModelID: srcModel,
                reason: "missing_model",
            },
        };
    }
    const normalizedModel = normalizeModelId(parsed.modelPart);
    const sourceProviderHint = normalizeSourceProviderId(source.providerID);
    const modelProviderHint = normalizeSourceProviderId(parsed.providerHint);
    const tryProvider = (providerID, method, modelIDHint = normalizedModel) => {
        if (!providerID)
            return null;
        const modelID = resolveModelForProvider(providerID, modelIDHint);
        if (!modelID)
            return null;
        return { ok: true, key: { provider: providerID, model: modelID }, method };
    };
    if (isCursorSource(source)) {
        const cursorModel = resolveCursorModel(source.modelID);
        if (cursorModel.kind === "local") {
            return {
                ok: true,
                key: { provider: "cursor", model: cursorModel.model },
                method: "cursor_local",
            };
        }
        if (cursorModel.kind === "official") {
            const resolved = tryProvider(cursorModel.providerHint, "cursor_api_alias", cursorModel.modelHint);
            if (resolved)
                return resolved;
        }
        // Another source's price for it would not be Cursor's.
        if (cursorModel.kind === "unpriced") {
            return { ok: false, unknown: { sourceProviderID: srcProvider, sourceModelID: srcModel } };
        }
    }
    const fromSourceProvider = tryProvider(sourceProviderHint, "source_provider");
    if (fromSourceProvider)
        return fromSourceProvider;
    const fromModelPrefix = tryProvider(modelProviderHint, "model_prefix");
    if (fromModelPrefix)
        return fromModelPrefix;
    const modelCandidates = freeSuffixCandidates(normalizedModel);
    let ambiguousMatch = null;
    for (const candidateModel of modelCandidates) {
        const providerCandidates = listProvidersForModelId(candidateModel);
        if (providerCandidates.length === 1) {
            const provider = providerCandidates[0];
            return {
                ok: true,
                key: { provider, model: candidateModel },
                method: "unique_model",
            };
        }
        if (providerCandidates.length > 1) {
            const inferredAmbiguousProvider = inferOfficialProviderFromModelId(candidateModel);
            if (inferredAmbiguousProvider && providerCandidates.includes(inferredAmbiguousProvider)) {
                const inferredFromAmbiguous = tryProvider(inferredAmbiguousProvider, "alias_fallback", candidateModel);
                if (inferredFromAmbiguous)
                    return inferredFromAmbiguous;
            }
            if (!ambiguousMatch) {
                ambiguousMatch = {
                    model: candidateModel,
                    providerCandidates: [...providerCandidates].sort((a, b) => a.localeCompare(b)),
                };
            }
        }
    }
    if (ambiguousMatch) {
        return {
            ok: false,
            unknown: {
                sourceProviderID: srcProvider,
                sourceModelID: srcModel,
                mappedModel: ambiguousMatch.model,
                normalizedModelID: ambiguousMatch.model,
                providerCandidates: ambiguousMatch.providerCandidates,
                reason: "ambiguous_model",
            },
        };
    }
    let inferredMissing = null;
    for (const candidateModel of modelCandidates) {
        const inferredProvider = inferOfficialProviderFromModelId(candidateModel);
        const inferred = tryProvider(inferredProvider ?? undefined, "alias_fallback", candidateModel);
        if (inferred)
            return inferred;
        if (inferredProvider && !inferredMissing) {
            inferredMissing = { provider: inferredProvider, model: candidateModel };
        }
    }
    if (inferredMissing) {
        return {
            ok: false,
            unknown: {
                sourceProviderID: srcProvider,
                sourceModelID: srcModel,
                mappedProvider: inferredMissing.provider,
                mappedModel: inferredMissing.model,
                normalizedModelID: inferredMissing.model,
                reason: "missing_provider",
            },
        };
    }
    return {
        ok: false,
        unknown: {
            sourceProviderID: srcProvider,
            sourceModelID: srcModel,
            mappedModel: normalizedModel,
            normalizedModelID: normalizedModel,
            reason: "missing_provider",
        },
    };
}
function resolveModelPricing(source) {
    const mapping = resolvePricingKey(source);
    if (!mapping.ok)
        return { kind: "unknown", unknown: mapping.unknown };
    const rates = mapping.key.provider === "cursor"
        ? lookupCursorLocalCost(mapping.key.model)
        : lookupCost(mapping.key.provider, mapping.key.model);
    if (rates)
        return { kind: "priced", key: mapping.key, rates: billedRates(source, rates) };
    const classification = classifyMissingPricing({
        mappedProvider: mapping.key.provider,
        mappedModel: mapping.key.model,
    });
    if (classification.kind === "unpriced") {
        return { kind: "unpriced", key: mapping.key, reason: classification.reason };
    }
    return {
        kind: "unknown",
        unknown: {
            sourceProviderID: source.providerID ?? "unknown",
            sourceModelID: source.modelID ?? "unknown",
            mappedProvider: mapping.key.provider,
            mappedModel: mapping.key.model,
        },
    };
}
function classifyMissingPricing(params) {
    if (params.mappedProvider === "cursor") {
        return { kind: "unknown" };
    }
    if (!hasProvider(params.mappedProvider)) {
        return { kind: "unknown" };
    }
    if (hasModel(params.mappedProvider, params.mappedModel)) {
        if (params.mappedModel.toLowerCase().endsWith("-free")) {
            return { kind: "unpriced", reason: "free-tier model id not priced in snapshot" };
        }
        return { kind: "unpriced", reason: "model id exists in snapshot but has no token pricing" };
    }
    return { kind: "unknown" };
}
function isCursorSource(source) {
    return isCursorProviderId(source.providerID) || isCursorModelId(source.modelID);
}
/** The rates OpenCode bills `source` at: a Cursor model's by Cursor's rules. */
function billedRates(source, rates) {
    return isCursorSource(source) ? cursorBilledRates(source.modelID, rates) : rates;
}
/** Each source model's pricing, per price list: lists change only by a new load. */
const PRICING_BY_LIST = new WeakMap();
function cachedModelPricing(source) {
    const list = activePriceList().meta;
    let byModel = PRICING_BY_LIST.get(list);
    if (!byModel) {
        byModel = new Map();
        PRICING_BY_LIST.set(list, byModel);
    }
    const key = JSON.stringify([source.providerID, source.modelID]);
    let pricing = byModel.get(key);
    if (!pricing) {
        pricing = resolveModelPricing(source);
        byModel.set(key, pricing);
    }
    return pricing;
}
function usdPerToken(usdPer1M) {
    return typeof usdPer1M === "number" ? usdPer1M / 1_000_000 : 0;
}
/** A missing cache rate costs as input, a missing reasoning rate as output. */
function pricedMessage(key, rates, tokens) {
    const inputRate = usdPerToken(rates.input);
    const byKind = {
        input: tokens.input * inputRate,
        output: tokens.output * usdPerToken(rates.output),
        reasoning: tokens.reasoning * usdPerToken(rates.reasoning ?? rates.output),
        cache_read: tokens.cache_read * usdPerToken(rates.cache_read ?? rates.input),
        cache_write: tokens.cache_write * usdPerToken(rates.cache_write ?? rates.input),
    };
    return {
        kind: "priced",
        key,
        usd: byKind.input + byKind.output + byKind.cache_read + byKind.cache_write + byKind.reasoning,
        byKind,
        cacheSavingsUsd: tokens.cache_read * inputRate - byKind.cache_read,
    };
}
/**
 * What one message of `source` costs. Automatic matching (models.dev, Cursor's own table)
 * wins; `modelMap` (exact source model id → models.dev "provider/model") prices only a model
 * automatic matching cannot.
 */
export function priceMessage(source, tokens, options = {}) {
    const pricing = cachedModelPricing(source);
    if (pricing.kind === "priced") {
        const promptTokens = tokens.input + tokens.cache_read + tokens.cache_write;
        if (isCursorSource(source) && !cursorBaseRatesCoverPrompt(source.modelID, promptTokens)) {
            return { kind: "unpriced", key: pricing.key };
        }
        return pricedMessage(pricing.key, pricing.rates, tokens);
    }
    const { modelMap } = options;
    const target = modelMap && source.modelID && Object.hasOwn(modelMap, source.modelID)
        ? modelMap[source.modelID]
        : "";
    const slash = target.indexOf("/");
    if (slash > 0) {
        const key = { provider: target.slice(0, slash), model: target.slice(slash + 1) };
        const rates = lookupCost(key.provider, key.model);
        if (rates)
            return pricedMessage(key, billedRates(source, rates), tokens);
    }
    return pricing.kind === "unpriced" ? { kind: "unpriced", key: pricing.key } : { kind: "unknown" };
}
//# sourceMappingURL=pricing-key.js.map