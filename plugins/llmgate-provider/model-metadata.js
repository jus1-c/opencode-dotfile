const PRICE_FIELDS = ["input", "output", "reasoning", "cache_read", "cache_write"];

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finiteNumber(value) {
  if (typeof value === "boolean" || value === null || value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function positiveInteger(value) {
  const parsed = finiteNumber(value);
  return parsed && parsed > 0 ? Math.trunc(parsed) : undefined;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringList(value) {
  return Array.isArray(value)
    ? value.flatMap((entry) => nonEmptyString(entry) ? [nonEmptyString(entry)] : [])
    : [];
}

function reasoningVariants(modelId, metadata) {
  const id = modelId.toLowerCase();
  if (id.startsWith("minimax-m3")) {
    return Object.fromEntries(["enabled", "adaptive", "disabled"].map((type) => [type, {
      body: { thinking: { type } },
    }]));
  }
  if (id.startsWith("kimi-k2.7")) return {};

  const override = id.startsWith("deepseek-v4") || id.startsWith("glm-5.2")
    ? ["high", "max"]
    : [];
  const efforts = override.length > 0
    ? override
    : stringList(asRecord(metadata).reasoning_efforts);
  return Object.fromEntries(efforts.map((effort) => [effort, {
    reasoningEffort: effort,
    ...((id.startsWith("deepseek-v4") || id.startsWith("glm-5.2"))
      ? { body: { thinking: { type: "enabled" } } }
      : {}),
  }]));
}

function sourceProvider(modelId) {
  const lower = modelId.toLowerCase();
  if (lower.startsWith("claude-")) return "anthropic";
  if (lower.startsWith("deepseek-")) return "deepseek";
  if (lower.startsWith("gemini-")) return "google";
  if (lower.startsWith("glm-")) return "zhipuai";
  if (lower.startsWith("gpt-") || /^(o1|o3|o4)(?:-|$)/u.test(lower)) return "openai";
  if (lower.startsWith("grok-")) return "xai";
  if (lower.startsWith("kimi-")) return "moonshotai";
  if (lower.startsWith("minimax-")) return "minimax";
  return undefined;
}

function modelCandidates(modelId) {
  const normalized = modelId.replace(/^models\//u, "");
  const candidates = new Set([modelId, normalized]);
  const provider = sourceProvider(normalized);
  if (provider) {
    candidates.add(`${provider}/${normalized}`);
    if (provider === "xai") candidates.add(`x-ai/${normalized}`);
    if (provider === "zhipuai") candidates.add(`z-ai/${normalized}`);
  }
  return [...candidates];
}

export function findModelMetadata(models, modelId, { allowSuffixFallback = true } = {}) {
  const index = new Map(
    Object.entries(asRecord(models)).map(([key, value]) => [key.toLowerCase(), value]),
  );
  for (const candidate of modelCandidates(modelId)) {
    const match = asRecord(index.get(candidate.toLowerCase()));
    if (Object.keys(match).length > 0) return match;
  }

  if (!allowSuffixFallback) return {};

  const suffix = `/${modelId.replace(/^models\//u, "").toLowerCase()}`;
  const suffixMatches = [...index.entries()].filter(([key]) => key.endsWith(suffix));
  if (suffixMatches.length === 1) return asRecord(suffixMatches[0][1]);
  return {};
}

function sourceLimit(source, field) {
  const record = asRecord(source);
  const limit = asRecord(record.limit);
  const topProvider = asRecord(record.top_provider);
  const aliases = field === "context"
    ? ["context", "context_length", "context_window", "max_context_tokens"]
    : field === "input"
      ? ["input", "max_input_tokens"]
      : ["output", "max_output_tokens", "max_completion_tokens", "max_tokens"];
  for (const key of aliases) {
    const nested = positiveInteger(limit[key]);
    if (nested) return nested;
    const direct = positiveInteger(record[key]);
    if (direct) return direct;
    const providerValue = positiveInteger(topProvider[key]);
    if (providerValue) return providerValue;
  }
  return undefined;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

function lowerBound(...values) {
  const valid = values.filter((value) => value !== undefined);
  return valid.length > 0 ? Math.min(...valid) : undefined;
}

function price(value, multiplier = 1) {
  const parsed = finiteNumber(value);
  return parsed === undefined ? undefined : parsed * multiplier;
}

function normalizedCostFields(source, fields, multiplier = 1) {
  const record = asRecord(source);
  const result = {};
  for (const [target, candidates] of Object.entries(fields)) {
    for (const candidate of candidates) {
      const value = price(record[candidate], multiplier);
      if (value !== undefined) {
        result[target] = value;
        break;
      }
    }
  }
  return result;
}

function parseContextThreshold(value) {
  const match = /^(\d+)(k|m)?$/iu.exec(value);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return amount * (match[2]?.toLowerCase() === "m" ? 1_000_000 : match[2] ? 1_000 : 1);
}

function modelsDevCost(source) {
  const cost = asRecord(asRecord(source).cost);
  const result = normalizedCostFields(cost, {
    input: ["input"],
    output: ["output"],
    reasoning: ["reasoning"],
    cache_read: ["cache_read"],
    cache_write: ["cache_write"],
  });
  const tiers = [];

  for (const entry of Array.isArray(cost.tiers) ? cost.tiers : []) {
    const tier = asRecord(entry);
    const descriptor = asRecord(tier.tier);
    const size = positiveInteger(descriptor.size);
    if (descriptor.type === "context" && size) {
      tiers.push({ size, cost: normalizedCostFields(tier, {
        input: ["input"],
        output: ["output"],
        reasoning: ["reasoning"],
        cache_read: ["cache_read"],
        cache_write: ["cache_write"],
      }) });
    }
  }

  for (const [field, value] of Object.entries(cost)) {
    const match = /^context_over_(.+)$/iu.exec(field);
    const size = match ? parseContextThreshold(match[1]) : undefined;
    if (size) {
      tiers.push({ size, cost: normalizedCostFields(value, {
        input: ["input"],
        output: ["output"],
        reasoning: ["reasoning"],
        cache_read: ["cache_read"],
        cache_write: ["cache_write"],
      }) });
    }
  }
  return { ...result, tiers };
}

function openRouterCost(source) {
  const pricing = asRecord(asRecord(source).pricing);
  const fields = {
    input: ["prompt", "input"],
    output: ["completion", "output"],
    cache_read: ["input_cache_read", "cache_read"],
    cache_write: ["input_cache_write", "cache_write"],
  };
  const result = normalizedCostFields(pricing, fields, 1_000_000);
  const tiers = [];
  for (const entry of Array.isArray(pricing.overrides) ? pricing.overrides : []) {
    const override = asRecord(entry);
    const size = positiveInteger(override.min_prompt_tokens ?? override.min_context_tokens);
    if (size) tiers.push({ size, cost: normalizedCostFields(override, fields, 1_000_000) });
  }
  return { ...result, tiers };
}

function liteLlmCost(source) {
  const record = asRecord(source);
  const fields = {
    input: ["input_cost_per_token"],
    output: ["output_cost_per_token"],
    reasoning: ["reasoning_cost_per_token"],
    cache_read: ["cache_read_input_token_cost"],
    cache_write: ["cache_creation_input_token_cost"],
  };
  const result = normalizedCostFields(record, fields, 1_000_000);
  const tierCosts = new Map();
  const tierFieldMap = {
    input_cost_per_token: "input",
    output_cost_per_token: "output",
    reasoning_cost_per_token: "reasoning",
    cache_read_input_token_cost: "cache_read",
    cache_creation_input_token_cost: "cache_write",
  };
  const pattern = /^(input_cost_per_token|output_cost_per_token|reasoning_cost_per_token|cache_read_input_token_cost|cache_creation_input_token_cost)_above_(\d+[km]?)_tokens$/iu;

  for (const [field, value] of Object.entries(record)) {
    const match = pattern.exec(field);
    if (!match) continue;
    const size = parseContextThreshold(match[2]);
    const valuePerMillion = price(value, 1_000_000);
    if (!size || valuePerMillion === undefined) continue;
    const tier = tierCosts.get(size) ?? {};
    tier[tierFieldMap[match[1].toLowerCase()]] = valuePerMillion;
    tierCosts.set(size, tier);
  }
  return {
    ...result,
    tiers: [...tierCosts.entries()].map(([size, cost]) => ({ size, cost })),
  };
}

function gatewayCost(source) {
  const record = asRecord(source);
  if (Object.keys(asRecord(record.cost)).length > 0) return modelsDevCost(record);
  const pricing = asRecord(record.pricing);
  if (pricing.prompt !== undefined || pricing.completion !== undefined) return openRouterCost({ pricing });
  const values = Object.values(pricing).flatMap((value) => {
    const parsed = finiteNumber(value);
    return parsed === undefined ? [] : [parsed];
  });
  const multiplier = values.length > 0 && Math.max(...values) < 0.01 ? 1_000_000 : 1;
  return {
    ...normalizedCostFields(pricing, {
      input: ["input"],
      output: ["output"],
      reasoning: ["reasoning"],
      cache_read: ["cache_read"],
      cache_write: ["cache_write"],
    }, multiplier),
    tiers: [],
  };
}

function mergeCosts(...costs) {
  const result = {};
  const tiers = new Map();
  for (const source of costs) {
    const cost = asRecord(source);
    for (const field of PRICE_FIELDS) {
      if (result[field] === undefined && finiteNumber(cost[field]) !== undefined) {
        result[field] = cost[field];
      }
    }
    for (const entry of Array.isArray(cost.tiers) ? cost.tiers : []) {
      const tier = asRecord(entry);
      const size = positiveInteger(tier.size);
      if (!size) continue;
      const mergedTier = tiers.get(size) ?? {};
      for (const field of PRICE_FIELDS) {
        const value = finiteNumber(asRecord(tier.cost)[field]);
        if (mergedTier[field] === undefined && value !== undefined) mergedTier[field] = value;
      }
      tiers.set(size, mergedTier);
    }
  }
  if (tiers.size > 0) {
    result.tiers = [...tiers.entries()]
      .map(([size, cost]) => ({ size, cost }))
      .sort((left, right) => left.size - right.size);
  }
  return result;
}

function largestEligibleContextTier(metadata, nativeContext) {
  if (!nativeContext) return undefined;
  const cost = asRecord(asRecord(metadata).cost);
  let largest;
  for (const tier of Array.isArray(cost.tiers) ? cost.tiers : []) {
    const record = asRecord(tier);
    const size = positiveInteger(record.size);
    if (size && size <= nativeContext && (largest === undefined || size > largest)) largest = size;
  }
  return largest;
}

export function mergeLlmGateModelMetadata({ gateway, modelsDev, openRouter, liteLlm }) {
  const sources = [asRecord(gateway), asRecord(modelsDev), asRecord(openRouter), asRecord(liteLlm)];
  const [gatewayRecord, modelsDevRecord, openRouterRecord, liteLlmRecord] = sources;
  const context = firstDefined(...sources.map((source) => sourceLimit(source, "context")));
  const input = firstDefined(...sources.map((source) => sourceLimit(source, "input")));
  const output = firstDefined(...sources.map((source) => sourceLimit(source, "output")));
  const limit = {
    ...(context ? { context } : {}),
    ...(input ? { input } : {}),
    ...(output ? { output } : {}),
  };
  const result = {
    ...(nonEmptyString(gatewayRecord.name) || nonEmptyString(modelsDevRecord.name) || nonEmptyString(openRouterRecord.name) || nonEmptyString(liteLlmRecord.name)
      ? { name: nonEmptyString(gatewayRecord.name) ?? nonEmptyString(modelsDevRecord.name) ?? nonEmptyString(openRouterRecord.name) ?? nonEmptyString(liteLlmRecord.name) }
      : {}),
    ...(Object.keys(limit).length > 0 ? { limit } : {}),
  };
  const reasoningOptions = firstDefined(...sources.map((source) => {
    const effort = Array.isArray(source.reasoning_options)
      ? source.reasoning_options.find((option) => asRecord(option).type === "effort")
      : undefined;
    return stringList(asRecord(effort).values).length > 0 ? asRecord(effort).values : undefined;
  }));
  const reasoningSupportedEfforts = firstDefined(...sources.map((source) =>
    stringList(asRecord(source.reasoning).supported_efforts).length > 0
      ? asRecord(source.reasoning).supported_efforts
      : undefined,
  ));
  const reasoningEfforts = reasoningOptions ?? reasoningSupportedEfforts;
  if (reasoningEfforts) result.reasoning_efforts = reasoningEfforts;
  for (const field of ["reasoning", "tool_call", "structured_output", "temperature"]) {
    const value = firstDefined(...sources.map((source) => source[field]));
    if (typeof value === "boolean") result[field] = value;
  }
  const cost = mergeCosts(
    gatewayCost(gateway),
    modelsDevCost(modelsDev),
    openRouterCost(openRouter),
    liteLlmCost(liteLlm),
  );
  if (Object.keys(cost).length > 0) result.cost = cost;
  return result;
}

function modelLimit(gateway, metadata) {
  const nativeContext = firstDefined(
    sourceLimit(gateway, "context"),
    sourceLimit(metadata, "context"),
  );
  const nativeInput = firstDefined(sourceLimit(gateway, "input"), sourceLimit(metadata, "input"));
  const output = firstDefined(sourceLimit(gateway, "output"), sourceLimit(metadata, "output"));
  const tier = largestEligibleContextTier(metadata, nativeContext);
  const modelId = nonEmptyString(gateway.id ?? gateway.model);
  const gptCapApplies = nativeContext !== undefined
    && nativeContext >= 1_000_000
    && modelId?.toLowerCase().startsWith("gpt-") === true;
  const context = gptCapApplies
    ? Math.floor(nativeContext * 0.4)
    : tier ?? nativeContext;
  const input = gptCapApplies || tier !== undefined
    ? lowerBound(nativeInput, context) ?? context
    : nativeInput === undefined
      ? undefined
      : lowerBound(nativeInput, context);

  // OpenCode requires both context and output for a custom model limit. Leave
  // the gateway's native handling intact when metadata cannot provide both.
  if (!context || !output) return undefined;
  return {
    context,
    ...(input ? { input } : {}),
    output,
  };
}

export function buildLlmGateModelConfig({ gateway, metadata }) {
  const gatewayRecord = asRecord(gateway);
  const metadataRecord = asRecord(metadata);
  const id = nonEmptyString(gatewayRecord.id ?? gatewayRecord.model);
  if (!id) return {};

  const result = {
    id,
    name: nonEmptyString(gatewayRecord.name) ?? nonEmptyString(metadataRecord.name) ?? id,
  };
  const limit = modelLimit(gatewayRecord, metadataRecord);
  if (limit) result.limit = limit;

  for (const field of ["reasoning", "tool_call", "structured_output", "temperature"]) {
    const value = gatewayRecord[field] ?? metadataRecord[field];
    if (typeof value === "boolean") result[field] = value;
  }
  if (result.reasoning) {
    const variants = reasoningVariants(id, metadataRecord);
    if (Object.keys(variants).length > 0) result.variants = variants;
  }
  return result;
}
