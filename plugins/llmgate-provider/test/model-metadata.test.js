import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLlmGateModelConfig,
  findModelMetadata,
  mergeLlmGateModelMetadata,
} from "../model-metadata.js";

const gateway = {
  id: "gpt-5.4",
  limit: { context: 1_000_000, output: 16_384 },
};

test("caps GPT models with at least 1M context at 40 percent", () => {
  const model = buildLlmGateModelConfig({
    gateway,
    metadata: mergeLlmGateModelMetadata({
      gateway,
      modelsDev: {
        name: "GPT-5.4",
        limit: { context: 1_000_000, input: 900_000, output: 32_768 },
        cost: {
          input: 2,
          output: 8,
          cache_read: 0.2,
          tiers: [
            {
              input: 2,
              output: 8,
              cache_read: 0.4,
              tier: { type: "context", size: 272_000 },
            },
          ],
        },
      },
      openRouter: {},
      liteLlm: {},
    }),
  });

  assert.deepEqual(model.limit, { context: 400_000, input: 400_000, output: 16_384 });
});

test("caps a 1.05M-context GPT model at 40 percent", () => {
  const largeGateway = {
    id: "gpt-5.6-terra",
    limit: { context: 1_050_000, output: 128_000 },
  };
  const model = buildLlmGateModelConfig({
    gateway: largeGateway,
    metadata: {
      limit: { context: 1_050_000, input: 922_000, output: 128_000 },
      cost: { tiers: [{ size: 272_000, cost: {} }] },
    },
  });

  assert.deepEqual(model.limit, { context: 420_000, input: 420_000, output: 128_000 });
});

test("merges LiteLLM context-tier pricing with models.dev base pricing", () => {
  const nonGptGateway = { id: "claude-opus-4", limit: { context: 1_000_000, output: 16_384 } };
  const metadata = mergeLlmGateModelMetadata({
    gateway: nonGptGateway,
    modelsDev: {
      cost: { input: 2, output: 8, cache_read: 0.2 },
      limit: { context: 1_000_000, output: 32_768 },
    },
    openRouter: {},
    liteLlm: {
      cache_read_input_token_cost_above_400k_tokens: 0.0000004,
      max_input_tokens: 1_000_000,
      max_output_tokens: 32_768,
    },
  });

  const model = buildLlmGateModelConfig({ gateway: nonGptGateway, metadata });
  assert.deepEqual(model.limit, { context: 400_000, input: 400_000, output: 16_384 });
});

test("uses OpenRouter override tiers when higher-priority metadata is absent", () => {
  const nonGptGateway = { id: "claude-opus-4", limit: { context: 1_000_000, output: 16_384 } };
  const metadata = mergeLlmGateModelMetadata({
    gateway: nonGptGateway,
    modelsDev: {},
    openRouter: {
      context_length: 1_000_000,
      top_provider: { max_completion_tokens: 32_768 },
      pricing: {
        prompt: "0.000002",
        completion: "0.000008",
        input_cache_read: "0.0000002",
        overrides: [
          {
            min_prompt_tokens: 400_000,
            input_cache_read: "0.0000004",
          },
        ],
      },
    },
    liteLlm: {},
  });

  const model = buildLlmGateModelConfig({ gateway: nonGptGateway, metadata });
  assert.deepEqual(model.limit, { context: 400_000, input: 400_000, output: 16_384 });
});

test("caps non-GPT models at their largest eligible context tier", () => {
  const nonGptGateway = { id: "claude-opus-4", limit: { context: 1_000_000, output: 16_384 } };
  const model = buildLlmGateModelConfig({
    gateway: nonGptGateway,
    metadata: mergeLlmGateModelMetadata({
      gateway: nonGptGateway,
      modelsDev: {
        limit: { context: 1_000_000, input: 900_000, output: 32_768 },
        cost: {
          input: 2,
          output: 8,
          tiers: [
            {
              input: 2,
              output: 8,
              tier: { type: "context", size: 200_000 },
            },
            {
              input: 2,
              output: 8,
              tier: { type: "context", size: 272_000 },
            },
            {
              input: 2,
              output: 8,
              tier: { type: "context", size: 1_100_000 },
            },
          ],
        },
      },
      openRouter: {},
      liteLlm: {},
    }),
  });

  assert.deepEqual(model.limit, { context: 272_000, input: 272_000, output: 16_384 });
});

test("keeps native context when no pricing tier is eligible", () => {
  const nonGptGateway = { id: "claude-opus-4", limit: { context: 1_000_000, output: 16_384 } };
  const model = buildLlmGateModelConfig({
    gateway: nonGptGateway,
    metadata: mergeLlmGateModelMetadata({
      gateway: nonGptGateway,
      modelsDev: {
        limit: { context: 1_000_000, input: 900_000, output: 32_768 },
        cost: {
          input: 2,
          output: 8,
          tiers: [{ input: 2, output: 8, tier: { type: "context", size: 1_100_000 } }],
        },
      },
      openRouter: {},
      liteLlm: {},
    }),
  });

  assert.deepEqual(model.limit, { context: 1_000_000, input: 900_000, output: 16_384 });
});

test("uses pricing tiers for GPT models below 1M context", () => {
  const model = buildLlmGateModelConfig({
    gateway: { id: "gpt-5.4", limit: { context: 256_000, output: 16_384 } },
    metadata: mergeLlmGateModelMetadata({
      gateway: { id: "gpt-5.4", limit: { context: 256_000, output: 16_384 } },
      modelsDev: {
        limit: { context: 1_000_000, output: 32_768 },
        cost: {
          input: 2,
          output: 8,
          tiers: [
            { input: 2, output: 8, tier: { type: "context", size: 200_000 } },
            { input: 3, output: 8, tier: { type: "context", size: 400_000 } },
          ],
        },
      },
      openRouter: {},
      liteLlm: {},
    }),
  });

  assert.deepEqual(model.limit, { context: 200_000, input: 200_000, output: 16_384 });
});

test("returns an unbounded model when metadata is malformed", () => {
  assert.deepEqual(
    buildLlmGateModelConfig({ gateway: { id: "unknown-model" }, metadata: { cost: "invalid" } }),
    { id: "unknown-model", name: "unknown-model" },
  );
});

test("matches gateway model ids against provider-prefixed metadata ids", () => {
  assert.equal(
    findModelMetadata({ "openai/gpt-5.4": { name: "GPT-5.4" } }, "gpt-5.4").name,
    "GPT-5.4",
  );
});

test("preserves reasoning support from model metadata", () => {
  const metadata = mergeLlmGateModelMetadata({
    gateway: { id: "gpt-5.4" },
    modelsDev: { reasoning: true },
    openRouter: {},
    liteLlm: {},
  });

  assert.equal(buildLlmGateModelConfig({ gateway: { id: "gpt-5.4" }, metadata }).reasoning, true);
});

test("uses registry-discovered reasoning effort variants", () => {
  const metadata = {
    reasoning: true,
    reasoning_efforts: ["none", "low", "medium", "high", "xhigh", "max"],
  };
  assert.deepEqual(
    buildLlmGateModelConfig({ gateway: { id: "gpt-5.6-terra" }, metadata }).variants,
    {
      none: { reasoningEffort: "none" },
      low: { reasoningEffort: "low" },
      medium: { reasoningEffort: "medium" },
      high: { reasoningEffort: "high" },
      xhigh: { reasoningEffort: "xhigh" },
      max: { reasoningEffort: "max" },
    },
  );
  assert.deepEqual(
    buildLlmGateModelConfig({ gateway: { id: "glm-5.2" }, metadata: { reasoning: true } }).variants,
    {
      high: { reasoningEffort: "high", body: { thinking: { type: "enabled" } } },
      max: { reasoningEffort: "max", body: { thinking: { type: "enabled" } } },
    },
  );
});

test("discovers efforts from models.dev before OpenRouter and keeps protocol exceptions", () => {
  const metadata = mergeLlmGateModelMetadata({
    gateway: { id: "gpt-5.6-terra" },
    modelsDev: {
      reasoning: true,
      reasoning_options: [{ type: "effort", values: ["none", "low", "high"] }],
    },
    openRouter: { reasoning: { supported_efforts: ["medium"] } },
    liteLlm: {},
  });
  assert.deepEqual(metadata.reasoning_efforts, ["none", "low", "high"]);
  assert.deepEqual(
    buildLlmGateModelConfig({ gateway: { id: "gpt-5.6-terra" }, metadata }).variants,
    {
      none: { reasoningEffort: "none" },
      low: { reasoningEffort: "low" },
      high: { reasoningEffort: "high" },
    },
  );
  assert.deepEqual(
    buildLlmGateModelConfig({ gateway: { id: "minimax-m3" }, metadata: { reasoning: true } }).variants,
    {
      enabled: { body: { thinking: { type: "enabled" } } },
      adaptive: { body: { thinking: { type: "adaptive" } } },
      disabled: { body: { thinking: { type: "disabled" } } },
    },
  );
  assert.equal(
    buildLlmGateModelConfig({ gateway: { id: "kimi-k2.7" }, metadata: { reasoning: true } }).variants,
    undefined,
  );
});

test("uses an unambiguous provider-prefixed suffix as metadata fallback", () => {
  assert.equal(
    findModelMetadata({ "vendor/custom-model": { name: "Custom" } }, "custom-model").name,
    "Custom",
  );
  assert.deepEqual(
    findModelMetadata({ "vendor-a/custom-model": {}, "vendor-b/custom-model": { name: "Other" } }, "custom-model"),
    {},
  );
});

test("does not use a provider-specific LiteLLM suffix as GLM-5.2 metadata", () => {
  const modelsDev = {
    "zhipuai/glm-5.2": { limit: { context: 1_000_000, output: 131_072 } },
  };
  const liteLlm = {
    "cloudflare/@cf/zai-org/glm-5.2": { max_input_tokens: 262_144, max_output_tokens: 262_144 },
  };
  const metadata = mergeLlmGateModelMetadata({
    gateway: { id: "glm-5.2" },
    modelsDev: findModelMetadata(modelsDev, "glm-5.2"),
    openRouter: {},
    liteLlm: findModelMetadata(liteLlm, "glm-5.2", { allowSuffixFallback: false }),
  });

  assert.deepEqual(
    buildLlmGateModelConfig({ gateway: { id: "glm-5.2" }, metadata }).limit,
    { context: 1_000_000, output: 131_072 },
  );
});
