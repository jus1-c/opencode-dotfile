import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { VilaoProviderPlugin, fetchCatalog, toProviderModel } from "../src/server.js";

test("exposes OpenAI-compatible reasoning variants on every Vilao model", () => {
  const model = toProviderModel({ id: "opt/model", name: "Model" });

  assert.equal(model.api.npm, "@ai-sdk/openai-compatible");
  assert.equal(model.capabilities.reasoning, true);
  assert.deepEqual(Object.keys(model.variants ?? {}), ["low", "medium", "high", "xhigh", "max"]);
  assert.deepEqual(model.variants?.max, { reasoningEffort: "max" });
});

test("sends the PAT only to the Vilao key-list endpoint", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ data: [{
      id: "key-id",
      key_prefix: "sk-abcd...wxyz",
      active: true,
      subscriptions: [],
    }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  await fetchCatalog("pat-test", "sk-abcd-secret-wxyz", fetchFn);
  assert.equal(String(calls[0].input), "https://vilao.ai/api/v2/llm/keys");
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer pat-test");
});

test("returns a sanitized API error without credential values", async () => {
  const fetchFn = async () => new Response(JSON.stringify({ error: { message: "invalid token" } }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
  await assert.rejects(fetchCatalog("pat-secret", "sk-secret", fetchFn), (error: Error) => {
    assert.match(error.message, /invalid token/u);
    assert.doesNotMatch(error.message, /pat-secret|sk-secret/u);
    return true;
  });
});

test("auto-fetches current subscriptions without reviving deleted override models", async () => {
  const root = await mkdtemp(join(tmpdir(), "vilao-provider-"));
  const originalData = process.env.XDG_DATA_HOME;
  const originalConfig = process.env.XDG_CONFIG_HOME;
  const originalFetch = globalThis.fetch;
  process.env.XDG_DATA_HOME = join(root, "data");
  process.env.XDG_CONFIG_HOME = join(root, "config");
  await mkdir(join(root, "data", "opencode"), { recursive: true });
  await mkdir(join(root, "config", "opencode"), { recursive: true });
  await writeFile(join(root, "data", "opencode", "auth.json"), JSON.stringify({
    vilao: { type: "api", key: "sk-abcd-secret-wxyz", metadata: { vilao_pat: "pat-test" } },
  }));
  await writeFile(join(root, "config", "opencode", "vilao-model-overrides.json"), JSON.stringify({
    version: 1,
    models: {
      "live/model": { name: "Live custom" },
      "deleted/model": { name: "Must stay deleted" },
    },
  }));
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{
    id: "key-id",
    key_prefix: "sk-abcd...wxyz",
    active: true,
    subscriptions: [{
      active: true,
      model_active: true,
      provider_active: true,
      provider_model_active: true,
      provider_prefix: "live",
      model_id: "model",
    }],
  }] }), { status: 200, headers: { "Content-Type": "application/json" } });

  try {
    const plugin = await VilaoProviderPlugin({ client: {} } as Parameters<typeof VilaoProviderPlugin>[0]);
    const config = {} as Parameters<NonNullable<typeof plugin.config>>[0];
    await plugin.config?.(config);
    assert.equal(config.provider?.vilao?.npm, "@ai-sdk/openai-compatible");
    assert.deepEqual(Object.keys(config.provider?.vilao?.models ?? {}), ["live/model"]);
    assert.equal(config.provider?.vilao?.models?.["live/model"]?.name, "Live custom");
    assert.equal(config.provider?.vilao?.models?.["live/model"]?.reasoning, true);
    assert.deepEqual(
      Object.keys(config.provider?.vilao?.models?.["live/model"]?.variants ?? {}),
      ["low", "medium", "high", "xhigh", "max"],
    );
    assert.deepEqual(config.provider?.vilao?.models?.["live/model"]?.variants?.high, {
      reasoningEffort: "high",
    });
    assert.deepEqual(config.provider?.vilao?.models?.["live/model"]?.limit, {
      context: 400_000, output: 32_000,
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalData === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = originalData;
    if (originalConfig === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalConfig;
    await rm(root, { recursive: true, force: true });
  }
});
