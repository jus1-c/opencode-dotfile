import assert from "node:assert/strict";
import test from "node:test";

import {
  applyOverrides,
  ApiKeyMatchError,
  bootstrapModels,
  catalogFromResponse,
  matchesMaskedKey,
  type OverridesFile,
} from "../src/catalog.js";
import { VilaoProviderPlugin } from "../src/server.js";

const apiKey = "sk-50ee-middle-secret-698a";

test("matches both visible ends of a masked Vilao key", () => {
  assert.equal(matchesMaskedKey(apiKey, "sk-50ee...698a"), true);
  assert.equal(matchesMaskedKey("sk-50ee-middle-secret-wrong", "sk-50ee...698a"), false);
  assert.equal(matchesMaskedKey("wrong-middle-secret-698a", "sk-50ee...698a"), false);
});

test("loads only available subscriptions and prefixes model ids", () => {
  const available = {
    active: true,
    model_active: true,
    provider_active: true,
    provider_model_active: true,
    provider_prefix: "opt",
    model_id: "gpt-5.6-sol",
    provider_name: "OpenAI Token-Based",
    model_options: { supports_tools: true, supports_vision: true },
  };
  const unavailable = { ...available, provider_prefix: "down", provider_maintenance_mode: true };
  const catalog = catalogFromResponse({ data: [{
    id: "key-id",
    key_prefix: "sk-50ee...698a",
    active: true,
    subscriptions: [available, unavailable],
  }] }, apiKey, 123);

  assert.deepEqual(Object.keys(catalog.models), ["opt/gpt-5.6-sol"]);
  assert.equal(catalog.models["opt/gpt-5.6-sol"].tool_call, true);
  assert.deepEqual(catalog.models["opt/gpt-5.6-sol"].modalities?.input, ["text", "image"]);
});

test("rejects missing and ambiguous API-key matches", () => {
  const key = { id: "one", key_prefix: "sk-50ee...698a", active: true, subscriptions: [] };
  assert.throws(() => catalogFromResponse({ data: [key] }, "sk-wrong"), /does not match/u);
  assert.throws(() => catalogFromResponse({ data: [key, { ...key, id: "two" }] }, apiKey), /multiple/u);
});

test("uses a distinct error type for a revoked or unmatched selected key", () => {
  assert.throws(
    () => catalogFromResponse({ data: [] }, apiKey),
    (error) => error instanceof ApiKeyMatchError,
  );
});

test("applies valid global model overrides without creating unknown models", () => {
  const catalog = catalogFromResponse({ data: [{
    id: "key-id",
    key_prefix: "sk-50ee...698a",
    active: true,
    subscriptions: [{
      active: true,
      model_active: true,
      provider_active: true,
      provider_model_active: true,
      provider_prefix: "opt",
      model_id: "gpt-5.6-sol",
    }],
  }] }, apiKey);
  const overrides: OverridesFile = { version: 1, models: {
    "opt/gpt-5.6-sol": {
      name: "Sol custom",
      limit: { context: 400_000, input: 350_000, output: 128_000 },
    },
    "missing/model": { name: "must not appear" },
  } };
  const models = applyOverrides(catalog.models, overrides);

  assert.equal(models["opt/gpt-5.6-sol"].name, "Sol custom");
  assert.deepEqual(models["opt/gpt-5.6-sol"].limit, { context: 400_000, input: 350_000, output: 128_000 });
  assert.equal(models["missing/model"], undefined);
});

test("rejects an input override above context", () => {
  const models = { "opt/model": { id: "opt/model", name: "Model" } };
  assert.throws(() => applyOverrides(models, {
    version: 1,
    models: { "opt/model": { limit: { context: 100, input: 101, output: 10 } } },
  }), /cannot exceed context/u);
});

test("applies a context-only override with a default output", () => {
  const models = { "opt/model": { id: "opt/model", name: "Model" } };
  const result = applyOverrides(models, {
    version: 1,
    models: { "opt/model": { limit: { context: 400_000 } } },
  });
  assert.deepEqual(result["opt/model"].limit, { context: 400_000, output: 32_000 });
});

test("builds a pre-auth provider catalog from global overrides", () => {
  const models = bootstrapModels({
    version: 1,
    models: {
      "opt/gpt-5.6-sol": {
        reasoning: true,
        tool_call: true,
        vision: true,
        limit: { context: 420_000, output: 128_000 },
      },
    },
  });

  assert.deepEqual(models["opt/gpt-5.6-sol"], {
    id: "opt/gpt-5.6-sol",
    name: "opt/gpt-5.6-sol",
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
    limit: { context: 420_000, output: 128_000 },
  });
});

test("hides bootstrap models after OpenCode logout", async () => {
  const plugin = await VilaoProviderPlugin({ client: {} } as Parameters<typeof VilaoProviderPlugin>[0]);
  const models = await plugin.provider?.models?.({ models: { stale: {} } } as never, {});

  assert.deepEqual(models, {});
});
