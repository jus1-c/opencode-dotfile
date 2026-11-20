// OpenCode V2 TUI entry for the Vilao provider.
//
// V1 exported `{ id, tui(api) }`. V2 TUI plugins are `{ id, setup(ctx) }`:
// dialogs are promise-based (`ctx.ui.dialog.select/prompt/confirm`) and
// commands register through `ctx.keymap.layer()`. Provider data is read from
// `ctx.data.location.provider/model.list()`, not a `state` map.
import { PROVIDER_ID } from "./dist/catalog.js";
import { readOverrides, writeOverrides } from "./dist/storage.js";
import { VilaoRpc } from "./rpc.js";

const ERRORS = {
  missing_pat: "Vilao PAT is missing. Reconnect and provide both keys.",
  missing_llm_key: "Vilao LLM API key is missing. Reconnect and provide both keys.",
  pat_rejected: "Vilao PAT was rejected. Reconnect with a valid PAT.",
  key_mismatch: "Vilao LLM API key does not match an active key for this PAT.",
  unavailable: "Unable to refresh Vilao subscriptions. Check the connection.",
};

const PROPERTIES = [
  { title: "Display name", value: "name" },
  { title: "Context window", value: "context" },
  { title: "Max input tokens", value: "input" },
  { title: "Max output tokens", value: "output" },
  { title: "Reasoning", value: "reasoning" },
  { title: "Tool calling", value: "tool_call" },
  { title: "Vision", value: "vision" },
  { title: "Reset all overrides", value: "reset_all" },
];

async function modelIds(ctx) {
  const location = ctx.location ?? ctx.data.location.default();
  await ctx.data.location.model.sync(location).catch(() => {});
  const models = ctx.data.location.model.list(location) ?? [];
  return models
    .filter((model) => model.providerID === PROVIDER_ID)
    .map((model) => model.id)
    .sort();
}

function parseValue(property, raw) {
  const text = String(raw ?? "").trim();
  if (property === "reset_all") return undefined;
  if (property === "name") return text || undefined;
  if (["reasoning", "tool_call", "vision"].includes(property)) {
    if (/^(true|yes|1)$/i.test(text)) return true;
    if (/^(false|no|0)$/i.test(text)) return false;
    return undefined;
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : undefined;
}

async function saveProperty(model, property, value) {
  const overrides = await readOverrides();
  const current = overrides.models[model] ?? {};
  if (property === "reset_all") {
    delete overrides.models[model];
    await writeOverrides(overrides);
    return;
  }
  const next = { ...current };
  if (["context", "input", "output"].includes(property)) {
    next.limit = { ...(current.limit ?? {}) };
    if (value === undefined) delete next.limit[property];
    else next.limit[property] = value;
    if (Object.keys(next.limit).length === 0) delete next.limit;
  } else if (value === undefined) {
    delete next[property];
  } else {
    next[property] = value;
  }
  if (Object.keys(next).length === 0) delete overrides.models[model];
  else overrides.models[model] = next;
  await writeOverrides(overrides);
}

export const VilaoTuiPlugin = {
  id: "opencode-vilao-provider.tui",

  async setup(ctx) {
    const toast = (message, variant = "success") => {
      ctx.ui.toast.show({ title: "Vilao", message, variant });
    };
    const unsubscribe = ctx.client.rpc(VilaoRpc).events.on("error", (event) => {
      if (ctx.location?.directory && event.location?.directory !== ctx.location.directory) return;
      const message = ERRORS[event.data.code];
      if (message) toast(message, "error");
    });

    const open = async () => {
      const models = await modelIds(ctx);
      if (models.length === 0) {
        toast("No Vilao models loaded. Connect Vilao or refresh subscriptions.", "warning");
        return;
      }
      const model = await ctx.ui.dialog.select({
        title: "Vilao model settings",
        placeholder: "Choose a model",
        options: models.map((id) => ({ title: id, value: id })),
      });
      if (!model) return;

      const property = await ctx.ui.dialog.select({
        title: `Vilao — ${model}`,
        placeholder: "Choose a property",
        options: PROPERTIES,
      });
      if (!property) return;

      if (property === "reset_all") {
        const confirmed = await ctx.ui.dialog.confirm({
          title: "Reset overrides",
          message: `Remove every override for ${model}?`,
        });
        if (!confirmed) return;
        await saveProperty(model, property, undefined);
        toast(`Cleared overrides for ${model}`);
        return;
      }

      const current = (await readOverrides()).models[model] ?? {};
      const existing =
        property === "name"
          ? current.name
          : ["context", "input", "output"].includes(property)
            ? current.limit?.[property]
            : current[property];

      const raw = await ctx.ui.dialog.prompt({
        title: `Set ${property}`,
        description: "Leave empty to clear the override.",
        placeholder: existing === undefined ? "" : String(existing),
        value: existing === undefined ? "" : String(existing),
      });
      if (raw === undefined) return;

      await saveProperty(model, property, parseValue(property, raw));
      toast(`Updated ${property} for ${model}`);
    };

    ctx.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "vilao.model.settings",
          title: "Vilao model settings",
          description: "Edit per-model overrides",
          group: "Vilao",
          palette: true,
          slash: { name: "vilao-model" },
          run: () => void open(),
        },
      ],
    }));
    return unsubscribe;
  },
};

export default VilaoTuiPlugin;
