import type { V5Conversion } from "./convert.js";
import { editSettings, editSettingsFile, type LoadedSettings, type SaveResult, type SettingsWatch, saveSettings } from "./file.js";
/**
 * What a change of the held settings asks of the server. `recheck`: a checking or pricing setting
 * changed, or which of them the file sets, so every provider is checked again. `oldCommands`:
 * `system.oldCommands` changed, so the slash command list is built again.
 */
type LiveSettingsChange = {
    recheck: boolean;
    oldCommands: boolean;
};
export type LiveSettings = {
    /** What converting the v5 settings at the start did; undefined when it had nothing to do. */
    readonly conversion: V5Conversion | undefined;
    current(): LoadedSettings;
    /** True once this server wrote the v5 settings into settings.jsonc, at the start or by a save. */
    converted(): boolean;
    /** `saveSettings`, then the file is read again and held, before this resolves. */
    save(patch: unknown, options: Parameters<typeof saveSettings>[1]): Promise<SaveResult>;
    /** `editSettings`, then the file is read again and held, before this resolves. */
    edit(...args: Parameters<typeof editSettings>): Promise<SaveResult>;
    /** `editSettingsFile`, then the file is read again and held, before this resolves. */
    editFile(...args: Parameters<typeof editSettingsFile>): Promise<SaveResult>;
    /**
     * From now on, calls `onChange` once per change of the settings or of the keys the file sets:
     * each save and each edit of the file (watched; close the returned watch to stop). A change
     * made since the start is read once more right after the watch starts. Call it once.
     */
    follow(onChange: (change: LiveSettingsChange) => Promise<void>): Promise<SettingsWatch>;
    /** Takes the pricing settings back; call it once no provider check can still read prices. */
    dispose(): void;
};
/**
 * `projectDir`: the folder whose v5 project files the status report lists as not read.
 * `debounceMs`: the file watch's (see `watchSettings`).
 */
export declare function createLiveSettings({ projectDir, debounceMs, }: {
    projectDir: string;
    debounceMs?: number;
}): Promise<LiveSettings>;
export {};
