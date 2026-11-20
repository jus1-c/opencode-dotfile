import { type Settings } from "./schema.js";
export type ConvertedKey = {
    key: string;
    to: string;
    where: "server";
    note?: string;
};
export type SkippedKey = {
    key: string;
    reason: string;
};
export type V5Conversion = {
    /** The v5 files the values came from, in the order v5 applied them. */
    sources: string[];
    /** An old file does not parse: `convertV5` waits (maybe mid-edit); a save converts the rest. */
    malformed: boolean;
    /** True when this call wrote settings.jsonc. */
    written: boolean;
    /** Why settings.jsonc was not written, when a write was tried. */
    notWrittenReason?: string;
    /** The converted server values by dotted key, in file order. */
    values: Record<string, unknown>;
    settings: Settings;
    /** The server keys the conversion set; every other key has its default. */
    fromFile: string[];
    converted: ConvertedKey[];
    dropped: SkippedKey[];
    invalid: SkippedKey[];
    notes: string[];
};
/**
 * The folders that can hold old global settings, in the order v4 read them: OpenCode's global
 * folder, then macOS's ~/.config and ~/Library/Application Support, Windows's %APPDATA% and
 * %LOCALAPPDATA%, or ~/.config elsewhere. OPENCODE_CONFIG_DIR replaces them all, as in OpenCode 2.
 */
export declare function oldSettingsFolders(configDir: string, params?: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
}): string[];
/**
 * The old global settings converted in memory (nothing is written), or undefined when none: those
 * of the first of `folders` that has quota settings. Old settings in a later folder are named in a
 * note. An OpenCode config that does not parse is named too; with no quota settings anywhere, its
 * folder is the one converted, so nothing is written until it is fixed.
 */
export declare function planV5Conversion(configDir: string, folders?: readonly string[]): Promise<V5Conversion | undefined>;
/** True for a key v5 had: one v6 converts, drops, ignores, or a v5 group ("tuiSidebarPanel"). */
export declare function isV5SettingKey(key: string): boolean;
/**
 * v5 settings files that exist but v6 does not read: the global sidecars (also in the older
 * folders) once settings.jsonc exists, and every project-scope file (v6 has no project settings).
 * A project in the global folder or an older one has no project files of its own.
 */
export declare function findUnreadV5Files(configDir: string, options: {
    includeGlobal: boolean;
    projectDir?: string;
}): Promise<string[]>;
