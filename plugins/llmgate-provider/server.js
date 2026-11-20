// OpenCode V2 entry for the LLMGate provider.
//
// V1 shipped one plugin function returning `auth`/`provider`/`config` hooks.
// V2 has no mutable global config, so the provider definition is contributed
// through `ctx.provider.transform` and credentials come from the integration
// store. The gateway key still lives in the OS keychain; this module reuses the
// V1 module's helpers for keychain access and model loading.
import * as v1 from "./index.v1.js";

const PROVIDER_ID = "llmgate";
const DISPLAY_NAME = "LLMGate";
const BASE_URL = "https://llmgate.app/v1";

function modelInfo(id, model) {
  const limit = v1.__test?.limitOf?.(model) ?? { context: 200_000, output: 32_000 };
  return {
    id,
    modelID: id,
    providerID: PROVIDER_ID,
    name: typeof model?.name === "string" ? model.name : id,
    capabilities: { tools: true, input: ["text", "image"], output: ["text"], temperature: true },
    variants: [],
    time: { released: 0 },
    cost: [],
    status: "active",
    enabled: true,
    limit,
  };
}

export const LLMGateProviderPlugin = {
  id: "opencode-llmgate-provider",

  async setup(ctx) {
    const gatewayKey = await v1.readGatewayKeyForPlugin();
    const models = gatewayKey ? await v1.loadModelsForPlugin(gatewayKey) : {};
    const entries = Object.entries(models).map(([id, model]) => modelInfo(id, model));

    await ctx.provider.transform((editor) => {
      const existing = editor.get(PROVIDER_ID);
      if (existing) {
        editor.update(PROVIDER_ID, (provider) => {
          provider.name = DISPLAY_NAME;
          provider.package = provider.package || "aisdk:@ai-sdk/openai-compatible";
          provider.settings = {
            ...(provider.settings ?? {}),
            baseURL: BASE_URL,
            ...(gatewayKey ? { apiKey: gatewayKey } : {}),
          };
          provider.activation = gatewayKey ? "enabled" : "disabled";
        });
        if (entries.length > 0) editor.models.set(PROVIDER_ID, entries);
        return;
      }
      if (!gatewayKey || entries.length === 0) return;
      editor.add({
        info: {
          id: PROVIDER_ID,
          name: DISPLAY_NAME,
          activation: "enabled",
          package: "aisdk:@ai-sdk/openai-compatible",
          settings: { baseURL: BASE_URL, apiKey: gatewayKey },
        },
        models: entries,
      });
    });

    await ctx.integration.transform((editor) => {
      if (!editor.get(PROVIDER_ID)) {
        editor.update(PROVIDER_ID, (integration) => {
          integration.name = DISPLAY_NAME;
        });
      }
      editor.method.update({
        integrationID: PROVIDER_ID,
        method: {
          type: "key",
          label: "LLMGate gateway key",
          form: [{ type: "string", key: "key", title: "LLMGate API key", placeholder: "sk-...", required: true }],
        },
      });
    });
  },
};

export default LLMGateProviderPlugin;
