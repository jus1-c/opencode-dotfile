import { type V5Conversion } from "./convert.js";
import { type Settings, type SettingsIssue, type SettingsPatch } from "./schema.js";
export declare function settingsPath(): string;
export type LoadedSettings = {
    path: string;
    exists: boolean;
    settings: Settings;
    issues: SettingsIssue[];
    /** The keys the user set (in the file, or in the v5 file converted in memory); the rest are defaults. */
    fromFile: string[];
    /** Only while settings.jsonc is missing: the v5 settings, converted in memory. */
    conversion?: V5Conversion;
    /** v5 settings files that exist but are not read. */
    notRead: string[];
};
/** `providers.checking.requestTimeoutMs` is null while the file does not set it. */
export type SettingsChange = {
    key: string;
    before: unknown;
    after: unknown;
};
export type SaveResult = {
    ok: boolean;
    issues: SettingsIssue[];
    diff: SettingsChange[];
};
export type SettingsWatch = {
    close(): void;
};
/**
 * The settings now. Without settings.jsonc: the v5 settings converted in memory when there are
 * any (this never writes; `convertV5` does), else the defaults.
 */
export declare function loadSettings(options?: {
    projectDir?: string;
}): Promise<LoadedSettings>;
/** One change at a JSONC path; a number is a list index (-1 appends). */
export type SettingsFileEdit = {
    path: Array<string | number>;
    value: unknown;
};
type SettingsEdit = (current: Settings) => SettingsPatch | undefined;
export type CustomSwitch = {
    enabled: boolean;
    fingerprint: string;
};
/**
 * Merges a patch into settings.jsonc (JSON merge patch: objects merge, null resets). One unknown
 * key or bad value and nothing is saved. Comments stay; a symlink keeps its link; the file is 0600.
 * `customEnabled` switches custom providers on or off by id; only the quota window's own switch
 * sends it (the agent tools never call this).
 */
export declare function saveSettings(patch: unknown, options?: {
    allowFileOnly?: boolean;
    customEnabled?: Readonly<Record<string, CustomSwitch>>;
}): Promise<SaveResult>;
/**
 * Like `saveSettings` (without switches), with the patch built from the settings it saves over:
 * read, `edit`, check and write all hold the lock, so an edit made from the current value never
 * loses a concurrent one. `edit` returns undefined to change nothing.
 */
export declare function editSettings(edit: SettingsEdit, options?: {
    allowFileOnly?: boolean;
}): Promise<SaveResult>;
/**
 * Like `editSettings`, for a change a patch cannot make, such as one entry of a list (the other
 * entries keep their comments). `edit` gets the settings and the problems read under the lock,
 * and returns JSONC edits; file-only keys are allowed. Nothing is saved when the result has a
 * problem the file did not have.
 */
export declare function editSettingsFile(edit: (current: Settings, issues: readonly SettingsIssue[]) => SettingsFileEdit[] | undefined): Promise<SaveResult>;
/**
 * Writes the v5 global settings into a missing settings.jsonc once (undefined: nothing to do).
 * While an old file does not parse (maybe mid-edit) or the folder is read-only, nothing is
 * written: the result says why, and `loadSettings` keeps converting in memory.
 */
export declare function convertV5(): Promise<V5Conversion | undefined>;
/**
 * Calls `onChange` once per change of settings.jsonc (v5 files are not watched), debounced, also
 * for an atomic replace. A folder watch reacts at once; a stat poll catches what it misses (busy
 * FSEvents, network drives, a symlink's target). Only changes after this resolves count.
 */
export declare function watchSettings(onChange: (loaded: LoadedSettings) => void, options?: {
    projectDir?: string;
    debounceMs?: number;
}): Promise<SettingsWatch>;
export {};
