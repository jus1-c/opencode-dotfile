export const PROVIDER_ID = "vilao";
export const DISPLAY_NAME = "Vilao";
export const BASE_URL = "https://api.vilao.ai/v1";
export const KEYS_URL = "https://vilao.ai/api/v2/llm/keys";
export const OVERRIDES_FILE = "vilao-model-overrides.json";
export const REFRESH_TTL_MS = 5 * 60_000;

export type RecordValue = Record<string, unknown>;

export type VilaoModelConfig = {
  id: string;
  name: string;
  reasoning?: boolean;
  tool_call?: boolean;
  modalities?: { input: string[]; output: string[] };
  limit?: { context: number; input?: number; output: number };
};

export type ModelOverride = {
  name?: string;
  reasoning?: boolean;
  tool_call?: boolean;
  vision?: boolean;
  limit?: { context?: number; input?: number; output?: number };
};

export type OverridesFile = {
  version: 1;
  models: Record<string, ModelOverride>;
};

export type Catalog = {
  keyId: string;
  keyPrefix: string;
  models: Record<string, VilaoModelConfig>;
  fetchedAt: number;
};

export class ApiKeyMatchError extends Error {}

export function asRecord(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function trueOrUndefined(value: unknown): true | undefined {
  return value === true ? true : undefined;
}

export function matchesMaskedKey(apiKey: string, masked: string): boolean {
  const key = apiKey.trim();
  const value = masked.trim();
  const separator = value.indexOf("...");
  if (!key || separator < 1) return false;
  const start = value.slice(0, separator);
  const end = value.slice(separator + 3);
  return Boolean(end) && key.length >= start.length + end.length && key.startsWith(start) && key.endsWith(end);
}

function subscriptionAvailable(value: unknown): boolean {
  const subscription = asRecord(value);
  return subscription.active === true
    && subscription.model_active === true
    && subscription.provider_active === true
    && subscription.provider_model_active === true
    && subscription.provider_maintenance_mode !== true
    && subscription.provider_admin_disabled !== true;
}

export function modelId(subscription: unknown): string | undefined {
  const value = asRecord(subscription);
  const prefix = nonEmptyString(value.provider_prefix);
  const id = nonEmptyString(value.model_id);
  return prefix && id ? `${prefix}/${id}` : undefined;
}

function modelFromSubscription(value: unknown): VilaoModelConfig | undefined {
  if (!subscriptionAvailable(value)) return undefined;
  const subscription = asRecord(value);
  const id = modelId(subscription);
  if (!id) return undefined;
  const options = asRecord(subscription.model_options);
  const vision = options.supports_vision === true;
  return {
    id,
    name: id,
    reasoning: trueOrUndefined(options.supports_reasoning),
    tool_call: trueOrUndefined(options.supports_tools),
    modalities: {
      input: vision ? ["text", "image"] : ["text"],
      output: ["text"],
    },
  };
}

export function catalogFromResponse(payload: unknown, apiKey: string, now = Date.now()): Catalog {
  const keys = Array.isArray(asRecord(payload).data) ? asRecord(payload).data as unknown[] : [];
  const matches = keys.filter((value) => {
    const key = asRecord(value);
    return key.active === true && matchesMaskedKey(apiKey, nonEmptyString(key.key_prefix) ?? "");
  });
  if (matches.length === 0) throw new ApiKeyMatchError("Vilao API key does not match an active key owned by this PAT");
  if (matches.length > 1) throw new ApiKeyMatchError("Vilao API key matches multiple masked keys; revoke the ambiguous key and try again");

  const key = asRecord(matches[0]);
  const keyId = nonEmptyString(key.id);
  const keyPrefix = nonEmptyString(key.key_prefix);
  if (!keyId || !keyPrefix) throw new Error("Vilao returned an invalid API-key record");
  const subscriptions = Array.isArray(key.subscriptions) ? key.subscriptions : [];
  const models = Object.fromEntries(subscriptions.flatMap((subscription) => {
    const model = modelFromSubscription(subscription);
    return model ? [[model.id, model]] : [];
  }));
  return { keyId, keyPrefix, models, fetchedAt: now };
}

function positiveInteger(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

export function normalizeOverride(value: unknown): ModelOverride {
  const override = asRecord(value);
  const limit = asRecord(override.limit);
  const context = positiveInteger(limit.context);
  const input = positiveInteger(limit.input);
  const output = positiveInteger(limit.output);
  if (input && context && input > context) throw new Error("Model input limit cannot exceed context limit");
  return {
    ...(nonEmptyString(override.name) ? { name: nonEmptyString(override.name) } : {}),
    ...(typeof override.reasoning === "boolean" ? { reasoning: override.reasoning } : {}),
    ...(typeof override.tool_call === "boolean" ? { tool_call: override.tool_call } : {}),
    ...(typeof override.vision === "boolean" ? { vision: override.vision } : {}),
    ...(context || input || output ? { limit: {
      ...(context ? { context } : {}),
      ...(input ? { input } : {}),
      ...(output ? { output } : {}),
    } } : {}),
  };
}

export function applyOverrides(
  models: Record<string, VilaoModelConfig>,
  overrides: OverridesFile,
): Record<string, VilaoModelConfig> {
  return Object.fromEntries(Object.entries(models).map(([id, model]) => {
    const override = normalizeOverride(overrides.models[id]);
    const context = override.limit?.context ?? model.limit?.context;
    const input = override.limit?.input ?? model.limit?.input;
    const output = override.limit?.output ?? model.limit?.output;
    const finalContext = context ?? 400_000;
    if (input && finalContext && input > finalContext) throw new Error(`Input limit exceeds context for ${id}`);
    const limit = context || output ? {
      context: finalContext,
      ...(input ? { input } : {}),
      output: output ?? 32_000,
    } : undefined;
    const vision = override.vision ?? model.modalities?.input.includes("image") ?? false;
    return [id, {
      ...model,
      ...(override.name ? { name: override.name } : {}),
      ...(override.reasoning !== undefined ? { reasoning: override.reasoning } : {}),
      ...(override.tool_call !== undefined ? { tool_call: override.tool_call } : {}),
      modalities: { input: vision ? ["text", "image"] : ["text"], output: ["text"] },
      ...(limit ? { limit } : {}),
    }];
  }));
}

export function parseCatalog(value: unknown): Catalog | undefined {
  const catalog = asRecord(value);
  const keyId = nonEmptyString(catalog.keyId);
  const keyPrefix = nonEmptyString(catalog.keyPrefix);
  const fetchedAt = positiveInteger(catalog.fetchedAt);
  const models = asRecord(catalog.models) as Record<string, VilaoModelConfig>;
  return keyId && keyPrefix && fetchedAt ? { keyId, keyPrefix, fetchedAt, models } : undefined;
}

export function parseOverrides(value: unknown): OverridesFile {
  const root = asRecord(value);
  if (root.version !== 1) return { version: 1, models: {} };
  const models = Object.fromEntries(Object.entries(asRecord(root.models)).map(([id, override]) => [id, normalizeOverride(override)]));
  return { version: 1, models };
}

export function bootstrapModels(overrides: OverridesFile): Record<string, VilaoModelConfig> {
  return Object.fromEntries(Object.entries(overrides.models).map(([id, value]) => {
    const override = normalizeOverride(value);
    const context = override.limit?.context;
    const input = override.limit?.input;
    const output = override.limit?.output;
    const vision = override.vision ?? false;
    return [id, {
      id,
      name: override.name ?? id,
      ...(override.reasoning !== undefined ? { reasoning: override.reasoning } : {}),
      ...(override.tool_call !== undefined ? { tool_call: override.tool_call } : {}),
      modalities: { input: vision ? ["text", "image"] : ["text"], output: ["text"] },
      ...(context && output ? { limit: { context, ...(input ? { input } : {}), output } } : {}),
    }];
  }));
}
