import type { QuotaRpcSaveSettingsInput, QuotaRpcSaveSettingsOutput, QuotaRpcSettingsOutput } from "../rpc.js";
import type { SettingRule } from "../settings/schema.js";
export type SettingsShape = {
    /** Each key's default as a client sees it: no `version`, file-only key or unset color. */
    defaults: Readonly<Record<string, unknown>>;
    /** The keys whose value is an object by id ("sidebar.names"), merged entry by entry. */
    recordKeys: ReadonlySet<string>;
};
export declare function settingsShape(rules: Readonly<Record<string, SettingRule>>): SettingsShape;
/** The ids switched off; every other provider is checked when found. */
export declare const PROVIDERS_KEY = "providers.off";
export declare function isTicked(off: readonly string[], id: string): boolean;
export declare function withTick(off: readonly string[], id: string, on: boolean): string[];
/** Changes by dotted key as the JSON merge patch `saveSettings` takes. */
export declare function settingsPatch(changes: Readonly<Record<string, unknown>>): Record<string, unknown>;
export type ServerSettingsRpc = {
    settings(): Promise<QuotaRpcSettingsOutput>;
    saveSettings(input: QuotaRpcSaveSettingsInput): Promise<QuotaRpcSaveSettingsOutput>;
};
export type SettingsDraft = ReturnType<typeof createSettingsDraft>;
/** The saved server settings, and this window's changes and custom provider switches on top. */
export declare function createSettingsDraft(rpc: ServerSettingsRpc, initialShape: SettingsShape): {
    /** Undefined until the first server answer. */
    saved: import("solid-js").Accessor<import("../settings/schema.js").ClientSettings | undefined>;
    /**
     * Settings a snapshot carries; the same ones as the saved settings change nothing, and a read
     * that waits (Save's too) still counts.
     */
    receive(next: QuotaRpcSettingsOutput): void;
    /** The rules' new shape (defaults, record keys); the draft's changes stay. */
    reshape(next: SettingsShape): void;
    value: (key: string) => unknown;
    /**
     * Whether settings.jsonc leaves a key whose unset isn't its default (the request timeout)
     * unset, with this window's draft on top.
     */
    unset(key: string): boolean;
    set(key: string, next: unknown): void;
    reset: (key: string) => void;
    customOn: (id: string) => boolean;
    switchCustom(id: string, on: boolean): void;
    changedSinceReview: (id: string) => boolean;
    /**
     * Every custom provider switch back to its saved state: the flips not saved yet are dropped,
     * also one made while Save waits. settings.jsonc is not touched.
     */
    discardSwitches(): void;
    dirty: () => boolean;
    /** How many settings and custom provider switches the draft changes. */
    count: () => number;
    changedKeys: () => string[];
    load(): Promise<void>;
    /**
     * Saves one setting straight away, apart from the window's draft (the Plugin tab's
     * switches), then reads the saved settings again. The error says why the server refused it.
     */
    saveNow(key: string, next: unknown): Promise<void>;
    /**
     * Sends the changes and switches in one save; nothing is saved when the server refuses any
     * of them, and the error says why. A switch-on carries the fingerprint of the definition
     * shown: one that changed since is reloaded and marked, not switched on. A change made while
     * it saves (one back to the old value too) stays unsaved.
     */
    save(): Promise<void>;
    discard(): void;
};
