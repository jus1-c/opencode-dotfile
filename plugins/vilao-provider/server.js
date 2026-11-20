// OpenCode V2 entry for the Vilao provider.
//
// V1 exported `{ id, server }` where `server()` returned auth/provider/config
// hooks, and refreshed the subscription catalog lazily on every model lookup
// (`refreshCatalog` + 5-minute TTL). V2 has no mutable global config, so the
// provider is contributed through `ctx.provider.transform`, whose callback must
// be synchronous and replayable.
//
// Live updates therefore work by keeping the model list in mutable state that
// the transform callback reads, then calling `ctx.provider.reload()` — which
// re-applies every registered transform — after that state changes. Three
// triggers drive it:
//
//   * a timer, which re-reads the overrides file and refetches the catalog once
//     the 5-minute TTL has elapsed (matching V1's refresh window),
//   * credential events, which refresh immediately after a key change,
//   * the overrides file's mtime, so TUI edits appear without a restart.
import {
  BASE_URL,
  DISPLAY_NAME,
  KEYS_URL,
  PROVIDER_ID,
  REFRESH_TTL_MS,
  ApiKeyMatchError,
  applyOverrides,
  catalogFromResponse,
} from "./dist/catalog.js";
import { overridesPath, readOverrides } from "./dist/storage.js";
import { statSync } from "node:fs";
import { VilaoRpc } from "./rpc.js";

export const CATALOG_METADATA = "vilao_catalog";
export const PAT_METADATA = "vilao_pat";
const REQUEST_TIMEOUT_MS = 30_000;
const WATCH_INTERVAL_MS = 30_000;

function clean(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function fetchCatalog(pat, apiKey) {
  const response = await fetch(KEYS_URL, {
    headers: { Accept: "application/json", Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const error = new Error("Unable to load Vilao subscriptions");
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  if (!Array.isArray(payload?.data)) throw new Error("Invalid Vilao subscription response");
  return catalogFromResponse(payload, apiKey);
}

// V1 exposed variants as an object map; V2 expects an array of
// `{ id, settings }` entries (packages/schema/src/model.ts).
// Every Vilao model offers all five efforts, matching the V1 fork's README:
// "Reasoning is enabled by default, and every model exposes low, medium, high,
// xhigh, and max effort variants."
const REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"];

function reasoningVariants() {
  return REASONING_EFFORTS.map((effort) => ({
    id: effort,
    settings: { reasoningEffort: effort },
  }));
}

function toModelInfo(id, model) {
  const vision = model.modalities?.input.includes("image") ?? false;
  return {
    id,
    modelID: id,
    providerID: PROVIDER_ID,
    name: model.name ?? id,
    capabilities: {
      tools: model.tool_call ?? false,
      input: vision ? ["text", "image"] : ["text"],
      output: ["text"],
      temperature: true,
    },
    variants: reasoningVariants(),
    time: { released: 0 },
    cost: [],
    status: "active",
    enabled: true,
    limit: model.limit ?? { context: 400_000, output: 32_000 },
  };
}

// Stable fingerprint so an unchanged refresh does not churn the provider state.
function fingerprint(apiKey, entries) {
  return JSON.stringify([apiKey ?? null, entries.map((entry) => [entry.id, entry.name, entry.limit, entry.variants])]);
}

function overridesMtime() {
  try {
    return statSync(overridesPath()).mtimeMs;
  } catch {
    return 0;
  }
}

export const VilaoProviderPlugin = {
  id: "opencode-vilao-provider",

  async setup(ctx) {
    const rpc = await ctx.rpc.register(VilaoRpc, {});
    let apiKey;
    let entries = [];
    let catalog;
    let catalogFetchedAt = 0;
    let credentialIdentity;
    let refreshGeneration = 0;
    let lastError;
    let lastFingerprint = "";
    let lastOverridesMtime = -1;

    const recompute = async () => {
      const overrides = await readOverrides();
      const models = catalog ? applyOverrides(catalog.models, overrides) : {};
      entries = Object.entries(models).map(([id, model]) => toModelInfo(id, model));
    };

    const reportError = async (code) => {
      if (lastError === code) return;
      lastError = code;
      console.warn(`[opencode-vilao-provider] ${code}`);
      await rpc.events.emit("error", { code }).catch(() => {});
    };

    const disable = async () => {
      apiKey = undefined;
      catalog = undefined;
      catalogFetchedAt = 0;
      entries = [];
      lastFingerprint = fingerprint(apiKey, entries);
      await ctx.provider.reload();
    };

    const refresh = async ({ force = false, credentialsChanged = false } = {}) => {
      const generation = ++refreshGeneration;
      let connection;
      let auth;
      try {
        connection = await ctx.integration.connection.active(PROVIDER_ID);
        auth = connection ? await ctx.integration.connection.resolve(connection) : undefined;
      } catch {
        if (generation !== refreshGeneration) return;
        credentialIdentity = undefined;
        await disable();
        if (generation === refreshGeneration) await reportError("unavailable");
        return;
      }
      if (generation !== refreshGeneration) return;
      const pat = clean(auth?.metadata?.[PAT_METADATA]);
      const llmKey = auth?.type === "key" ? clean(auth.key) : undefined;
      const nextKey = pat && llmKey ? llmKey : undefined;
      const identity = nextKey ? JSON.stringify([connection.id, nextKey, pat]) : undefined;

      if (identity !== credentialIdentity) {
        credentialIdentity = identity;
        lastError = undefined;
        await disable();
        if (generation !== refreshGeneration) return;
      }

      if (!nextKey) {
        apiKey = undefined;
        catalog = undefined;
        entries = [];
        if (connection) await reportError(pat ? "missing_llm_key" : "missing_pat");
      }

      const stale = force || Date.now() - catalogFetchedAt >= REFRESH_TTL_MS;
      if (pat && nextKey && stale) {
        let fetched;
        let failure;
        try {
          fetched = await fetchCatalog(pat, nextKey);
        } catch (error) {
          failure = error;
        }
        if (generation !== refreshGeneration) return;
        let currentConnection;
        let currentAuth;
        try {
          currentConnection = await ctx.integration.connection.active(PROVIDER_ID);
          currentAuth = currentConnection ? await ctx.integration.connection.resolve(currentConnection) : undefined;
        } catch {
          if (generation !== refreshGeneration) return;
          credentialIdentity = undefined;
          await disable();
          if (generation === refreshGeneration) await reportError("unavailable");
          return;
        }
        if (generation !== refreshGeneration || currentConnection?.id !== connection.id ||
            currentAuth?.type !== "key" || clean(currentAuth.key) !== nextKey ||
            clean(currentAuth.metadata?.[PAT_METADATA]) !== pat) return;
        if (failure) {
          const code = failure instanceof ApiKeyMatchError ? "key_mismatch"
            : failure?.status === 401 || failure?.status === 403 ? "pat_rejected" : "unavailable";
          if (failure instanceof ApiKeyMatchError || failure?.status === 401 || failure?.status === 403 || !catalog) {
            await disable();
            if (generation !== refreshGeneration) return;
          }
          await reportError(code);
          if (generation !== refreshGeneration) return;
        } else {
          catalog = fetched;
          apiKey = nextKey;
          catalogFetchedAt = Date.now();
          lastError = undefined;
        }
      }

      await recompute();
      if (generation !== refreshGeneration) return;

      const next = fingerprint(apiKey, entries);
      const changed = next !== lastFingerprint || credentialsChanged;
      lastFingerprint = next;
      if (changed) await ctx.provider.reload();
    };

    await ctx.provider.transform((editor) => {
      const existing = editor.get(PROVIDER_ID);
      if (existing) {
        editor.update(PROVIDER_ID, (provider) => {
          provider.name = DISPLAY_NAME;
          provider.package = provider.package || "aisdk:@ai-sdk/openai-compatible";
          provider.settings = { ...(provider.settings ?? {}), baseURL: BASE_URL, ...(apiKey ? { apiKey } : {}) };
          provider.activation = apiKey ? "enabled" : "disabled";
        });
        editor.models.set(PROVIDER_ID, entries);
        return;
      }
      if (!apiKey || entries.length === 0) return;
      editor.add({
        info: {
          id: PROVIDER_ID,
          name: DISPLAY_NAME,
          activation: "enabled",
          package: "aisdk:@ai-sdk/openai-compatible",
          settings: { baseURL: BASE_URL, apiKey },
        },
        models: entries,
      });
    });

    // V1 registered a key prompt; V2 credentials live in the integration store.
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
          label: "Vilao LLM API key",
          form: [{ type: "string", key: "vilao_pat", title: "Vilao PAT", placeholder: "pat-...", required: true }],
        },
      });
    });

    await refresh({ force: true });
    lastOverridesMtime = overridesMtime();

    const timer = setInterval(() => {
      void (async () => {
        const mtime = overridesMtime();
        if (mtime !== lastOverridesMtime) {
          lastOverridesMtime = mtime;
          await recompute();
          const next = fingerprint(apiKey, entries);
          if (next !== lastFingerprint) {
            lastFingerprint = next;
            await ctx.provider.reload();
          }
        }
        await refresh();
      })().catch(() => {});
    }, WATCH_INTERVAL_MS);
    timer.unref?.();

    const controller = new AbortController();
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (event.type === "credential.updated") {
            await refresh({ force: true, credentialsChanged: true }).catch(() => {});
            continue;
          }
          if (event.type === "credential.switched" && event.data?.integrationID === PROVIDER_ID) {
            await refresh({ force: true, credentialsChanged: true }).catch(() => {});
          }
        }
      } catch {
        // Subscription ends when the plugin unloads.
      }
    })();

    return () => {
      clearInterval(timer);
      controller.abort();
    };
  },
};

export default VilaoProviderPlugin;
