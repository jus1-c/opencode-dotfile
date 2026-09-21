import type { Plugin, PluginModule } from "@opencode-ai/plugin";
import type { Auth, Model, Provider } from "@opencode-ai/sdk/v2";

import {
  BASE_URL,
  DISPLAY_NAME,
  KEYS_URL,
  PROVIDER_ID,
  REFRESH_TTL_MS,
  ApiKeyMatchError,
  applyOverrides,
  asRecord,
  catalogFromResponse,
  parseCatalog,
  type Catalog,
  type VilaoModelConfig,
} from "./catalog.js";
import { readAuth, readOverrides } from "./storage.js";

export const CATALOG_METADATA = "vilao_catalog";
export const PAT_METADATA = "vilao_pat";
const REQUEST_TIMEOUT_MS = 30_000;
let refresh: Promise<Catalog> | undefined;

function clean(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function errorDetail(payload: unknown, status: number): string {
  const root = asRecord(payload);
  const error = asRecord(root.error);
  return clean(error.message) ?? clean(root.message) ?? `HTTP ${status}`;
}

export async function fetchCatalog(pat: string, apiKey: string, fetchFn = fetch): Promise<Catalog> {
  const response = await fetchFn(KEYS_URL, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Unable to load Vilao subscriptions: ${errorDetail(payload, response.status)}`);
  return catalogFromResponse(payload, apiKey);
}

function metadata(auth: Auth | undefined): Record<string, string> {
  return auth?.type === "api" ? auth.metadata ?? {} : {};
}

function cachedCatalog(auth: Auth | undefined): Catalog | undefined {
  const raw = metadata(auth)[CATALOG_METADATA];
  if (!raw) return undefined;
  try {
    return parseCatalog(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

async function refreshCatalog(input: {
  auth: Auth;
  client: Parameters<Plugin>[0]["client"];
  force?: boolean;
}): Promise<Catalog | undefined> {
  if (input.auth.type !== "api") return undefined;
  const auth = input.auth;
  const current = cachedCatalog(auth);
  if (!input.force && current && Date.now() - current.fetchedAt < REFRESH_TTL_MS) return current;
  const pat = clean(auth.metadata?.[PAT_METADATA]);
  const apiKey = clean(auth.key);
  if (!pat || !apiKey) return current;

  if (!refresh) {
    refresh = fetchCatalog(pat, apiKey).then(async (catalog) => {
      await input.client.auth.set({
        path: { id: PROVIDER_ID },
        body: {
          type: "api",
          key: apiKey,
          metadata: {
            ...auth.metadata,
            [PAT_METADATA]: pat,
            [CATALOG_METADATA]: JSON.stringify(catalog),
          },
        },
      });
      return catalog;
    }).finally(() => {
      refresh = undefined;
    });
  }

  try {
    return await refresh;
  } catch (error) {
    if (error instanceof ApiKeyMatchError) return undefined;
    return current;
  }
}

function toProviderModel(model: VilaoModelConfig): Model {
  const vision = model.modalities?.input.includes("image") ?? false;
  return {
    id: model.id,
    providerID: PROVIDER_ID,
    name: model.name,
    family: "vilao",
    api: { id: model.id, url: BASE_URL, npm: "@ai-sdk/openai-compatible" },
    status: "active",
    headers: {},
    options: {},
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: model.limit ?? { context: 400_000, output: 32_000 },
    capabilities: {
      temperature: true,
      reasoning: model.reasoning ?? false,
      attachment: vision,
      toolcall: model.tool_call ?? false,
      input: { text: true, audio: false, image: vision, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    release_date: "",
    variants: {},
  };
}

async function modelsFromCatalog(catalog: Catalog | undefined): Promise<Record<string, Model>> {
  if (!catalog) return {};
  const models = applyOverrides(catalog.models, await readOverrides());
  return Object.fromEntries(Object.entries(models).map(([id, model]) => [id, toProviderModel(model)]));
}

export const VilaoProviderPlugin: Plugin = async ({ client }) => ({
  auth: {
    provider: PROVIDER_ID,
    loader: async (getAuth) => {
      const auth = await getAuth();
      return auth.type === "api" ? { apiKey: auth.key, baseURL: BASE_URL } : {};
    },
    methods: [{
      type: "api",
      label: "Vilao PAT + API key",
      prompts: [
        {
          type: "text",
          key: "pat",
          message: "Vilao PAT token",
          placeholder: "pat-...",
          validate: (value) => clean(value) ? undefined : "PAT token is required",
        },
        {
          type: "text",
          key: "apiKey",
          message: "Vilao API key",
          placeholder: "sk-...",
          validate: (value) => clean(value) ? undefined : "API key is required",
        },
      ],
      authorize: async (inputs = {}) => {
        const pat = clean(inputs.pat);
        const apiKey = clean(inputs.apiKey);
        if (!pat || !apiKey) return { type: "failed" };
        try {
          const catalog = await fetchCatalog(pat, apiKey);
          return {
            type: "success",
            provider: PROVIDER_ID,
            key: apiKey,
            metadata: {
              [PAT_METADATA]: pat,
              [CATALOG_METADATA]: JSON.stringify(catalog),
            },
          };
        } catch {
          return { type: "failed" };
        }
      },
    }],
  },
  provider: {
    id: PROVIDER_ID,
    models: async (provider: Provider, context) => {
      if (context.auth?.type !== "api") return {};
      const catalog = await refreshCatalog({ auth: context.auth, client });
      return modelsFromCatalog(catalog);
    },
  },
  config: async (config) => {
    const auth = await readAuth();
    const pat = clean(auth.metadata?.[PAT_METADATA]);
    const apiKey = clean(auth.key);
    if (!pat || !apiKey) return;

    const cached = (() => {
      const raw = auth.metadata?.[CATALOG_METADATA];
      if (!raw) return undefined;
      try {
        return parseCatalog(JSON.parse(raw));
      } catch {
        return undefined;
      }
    })();
    const catalog = await fetchCatalog(pat, apiKey).catch(() => cached);
    if (!catalog) return;

    config.provider ??= {};
    const existing = asRecord(config.provider[PROVIDER_ID]);
    const models = applyOverrides(catalog.models, await readOverrides());
    config.provider[PROVIDER_ID] = {
      ...existing,
      name: clean(existing.name) ?? DISPLAY_NAME,
      npm: clean(existing.npm) ?? "@ai-sdk/openai-compatible",
      options: { ...asRecord(existing.options), baseURL: BASE_URL },
      models: models as NonNullable<typeof config.provider>[string]["models"],
    };
  },
});

const plugin: PluginModule & { id: string } = {
  id: "opencode-vilao-provider",
  server: VilaoProviderPlugin,
};

export default plugin;
