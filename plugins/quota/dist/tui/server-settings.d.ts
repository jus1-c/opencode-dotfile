/**
 * All Settings tabs edit the server's settings.jsonc through the quota RPC, with a draft
 * (`settings-draft.ts`) shaped by the schema in `settings/schema.ts`.
 */
import type { QuotaSnapshot } from "../core/types.js";
import { type ServerSettingsRpc, type SettingsDraft } from "./settings-draft.js";
export { isTicked, PROVIDERS_KEY, type ServerSettingsRpc, settingsPatch, withTick, } from "./settings-draft.js";
export declare function foundProviderIds(snapshot: QuotaSnapshot | undefined): string[];
export type ServerSettings = SettingsDraft;
/** The saved server settings, and this window's changes and custom provider switches on top. */
export declare function createServerSettings(rpc: ServerSettingsRpc): ServerSettings;
