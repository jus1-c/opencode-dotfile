import { offProviderId, SETTINGS_SCHEMA } from "../settings/schema.js";
import { createSettingsDraft, settingsShape, } from "./settings-draft.js";
export { isTicked, PROVIDERS_KEY, settingsPatch, withTick, } from "./settings-draft.js";
export function foundProviderIds(snapshot) {
    return (snapshot?.providers ?? []).map(({ providerId }) => offProviderId(providerId));
}
/** The saved server settings, and this window's changes and custom provider switches on top. */
export function createServerSettings(rpc) {
    return createSettingsDraft(rpc, settingsShape(SETTINGS_SCHEMA));
}
//# sourceMappingURL=server-settings.js.map