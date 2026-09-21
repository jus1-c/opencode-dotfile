/** @jsxImportSource @opentui/solid */
import type { TuiDialogSelectOption, TuiPluginModule } from "@opencode-ai/plugin/tui";

import {
  PROVIDER_ID,
  asRecord,
  type ModelOverride,
} from "./catalog.js";
import { readOverrides, writeOverrides } from "./storage.js";

type Property = "name" | "context" | "input" | "output" | "reasoning" | "tool_call" | "vision";
type PropertyAction = Property | "reset_all";

function modelIds(api: Parameters<NonNullable<TuiPluginModule["tui"]>>[0]): string[] {
  const provider = api.state.provider.find((entry) => entry.id === PROVIDER_ID);
  return Object.keys(asRecord(provider?.models)).sort();
}

const propertyOptions: TuiDialogSelectOption<Property>[] = [
  { title: "Display name", value: "name" },
  { title: "Context limit", value: "context" },
  { title: "Input limit", value: "input" },
  { title: "Output limit", value: "output" },
  { title: "Reasoning", value: "reasoning" },
  { title: "Tool calling", value: "tool_call" },
  { title: "Vision", value: "vision" },
];

function currentValue(override: ModelOverride, property: Property): string {
  if (property === "name") return override.name ?? "";
  if (property === "context" || property === "input" || property === "output") {
    return String(override.limit?.[property] ?? "");
  }
  return String(override[property] ?? "");
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-vilao-provider.tui",
  async tui(api) {
    const toast = (message: string, variant: "success" | "warning" | "error" = "success") => {
      api.ui.toast({ title: "Vilao", message, variant });
    };

    const saveProperty = async (model: string, property: Property, value: string | boolean | undefined) => {
      try {
        const overrides = await readOverrides();
        const current = overrides.models[model] ?? {};
        const next: ModelOverride = { ...current, limit: { ...current.limit } };
        if (property === "context" || property === "input" || property === "output") {
          if (value === undefined) delete next.limit?.[property];
          else {
            const parsed = Number(value);
            if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("Limit must be a positive integer");
            next.limit![property] = parsed;
          }
          if (next.limit?.input && next.limit.context && next.limit.input > next.limit.context) {
            throw new Error("Input limit cannot exceed context limit");
          }
          if (next.limit && Object.keys(next.limit).length === 0) delete next.limit;
        } else if (value === undefined) {
          delete next[property];
        } else {
          (next as Record<string, unknown>)[property] = value;
        }
        if (Object.keys(next).length === 0) delete overrides.models[model];
        else overrides.models[model] = next;
        await writeOverrides(overrides);
        api.ui.dialog.clear();
        toast(`Saved ${property} for ${model}. Restart OpenCode to apply.`);
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error), "error");
      }
    };

    const editProperty = async (model: string, property: Property) => {
      const override = (await readOverrides()).models[model] ?? {};
      if (property === "reasoning" || property === "tool_call" || property === "vision") {
        api.ui.dialog.replace(() => (
          <api.ui.DialogSelect
            title={`${model}: ${property}`}
            options={[
              { title: "Enabled", value: true },
              { title: "Disabled", value: false },
              { title: "Reset override", value: undefined },
            ]}
            onSelect={(option) => void saveProperty(model, property, option.value)}
          />
        ));
        return;
      }
      api.ui.dialog.replace(() => (
        <api.ui.DialogPrompt
          title={`${model}: ${property}`}
          description={() => <text>Leave empty to reset this override.</text>}
          value={currentValue(override, property)}
          onConfirm={(value) => void saveProperty(model, property, value.trim() || undefined)}
          onCancel={() => api.ui.dialog.clear()}
        />
      ));
    };

    const chooseProperty = (model: string) => {
      api.ui.dialog.replace(() => (
        <api.ui.DialogSelect<PropertyAction>
          title={`Edit ${model}`}
          options={[
            ...propertyOptions,
            { title: "Reset all overrides", value: "reset_all" },
          ]}
          onSelect={(option) => {
            if (option.value === "reset_all") {
              void (async () => {
                const overrides = await readOverrides();
                delete overrides.models[model];
                await writeOverrides(overrides);
                api.ui.dialog.clear();
                toast(`Reset overrides for ${model}. Restart OpenCode to apply.`);
              })().catch((error) => toast(String(error), "error"));
              return;
            }
            void editProperty(model, option.value);
          }}
        />
      ));
    };

    const open = () => {
      const models = modelIds(api);
      api.ui.dialog.replace(() => (
        <api.ui.DialogSelect
          title="Vilao model settings"
          options={models.map((id) => ({ title: id, value: id }))}
          onSelect={(option) => chooseProperty(option.value)}
        />
      ));
      if (models.length === 0) toast("No Vilao models loaded. Connect Vilao or refresh subscriptions.", "warning");
    };

    api.keymap.registerLayer({
      mode: "base",
      commands: [{
        name: "vilao.model.settings",
        title: "Vilao model settings",
        category: "Vilao",
        namespace: "palette",
        slashName: "vilao-model",
        run: open,
      }],
    });
  },
};

export default plugin;
