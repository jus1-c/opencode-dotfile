import { SETTINGS_SCHEMA, type Settings } from "../settings/schema.js";
import { type FieldValue, type PresetName, presetChoice, presetValues } from "../view/presets.js";
import type { Surface } from "../view/select.js";
import { renameRow, setIn, stepIn } from "../view/settings-edit.js";
import type { ColorRole } from "../view/text.js";
/** Named colors follow OpenCode's theme; hex colors stay fixed; bar follows the row's level. */
export type ColorChoice = NonNullable<Settings["colors"]["good"]>;
export type ColorName = Exclude<ColorChoice, "bar" | `#${string}`>;
export declare const COLOR_NAMES: ColorName[];
export { type FieldValue, type PresetName, presetChoice, presetValues, renameRow, setIn, stepIn };
/** The settings the TUI shows: the saved ones, with the Settings tabs' draft on top. */
export type DisplaySettings = Settings;
/** The theme color each role gets unless you change it. */
export declare const THEME_COLORS: Record<ColorRole, ColorName | "bar">;
/** The value at a field's path, for example "layout.barWidth". */
export declare function valueAt(settings: unknown, path: string): FieldValue;
/**
 * The quota window's Settings pages. The tab bar shows Layout (the pages layout as "All places",
 * which also holds the `words` lines, then sidebar, collapsed, statusLine and toast), Colors and
 * Providers.
 */
export type SettingsTab = "sidebar" | "collapsed" | "statusLine" | "toast" | "colors" | "layout" | "providers";
export declare function isSurfaceTab(tab: SettingsTab): tab is Surface;
/**
 * One setting line: ‹ › step through `values`; a color line also takes a typed "#rrggbb", a
 * line with a `placeholder` a typed number. Its `path` ("layout.barWidth") is also its id; its
 * default and the values it accepts are the setting's in SETTINGS_SCHEMA.
 */
export type Field = {
    path: keyof typeof SETTINGS_SCHEMA;
    tab: SettingsTab;
    title: string;
    values: readonly FieldValue[];
    show: (value: FieldValue) => string;
    /** The values ‹ › step through when some of `values` don't fit the other settings. */
    choices?: (settings: DisplaySettings) => readonly FieldValue[];
    /** A heading above the line, which starts a group. */
    group?: string;
    /** Short muted text after the value. */
    note?: string;
    /** The preset on top of the tab sets this line. */
    preset?: PresetName;
    color?: true;
    /** A number you type ("a dollar amount"); nothing typed is null. */
    placeholder?: string;
    /** On the Providers tab: nested under this provider's tick, while it is ticked. */
    provider?: string;
};
/** Every plain setting, in the order its tab shows it. */
export declare const FIELDS: readonly Field[];
/** A line that sets the lines marked with its name in one step. */
export type Preset = {
    tab: SettingsTab;
    title: string;
    /** What it sets, after "sets": the lines by their titles or their group's heading. */
    drives: string;
    /**
     * The line it sits above, taking that line's heading; without one it is the page's first,
     * under "Preset".
     */
    before?: string;
    /** The values of each choice, by path. */
    choices: Record<string, Record<string, FieldValue>>;
};
export declare const PRESETS: Record<PresetName, Preset>;
/** A typed number the server takes for the field ("$" allowed); null for nothing typed. */
export declare function typedNumber(field: Field, text: string): FieldValue;
/** A typed "#89b4fa" (the # is optional); nothing typed puts the theme's color back. */
export declare function typedColor(settings: DisplaySettings, field: Field, text: string): DisplaySettings;
/**
 * The settings a tab's reset puts back to their defaults: its lines. A surface tab resets every
 * setting of its surface, its order, hidden rows, switch and preferred windows too; row names
 * and Desktop's own settings stay.
 */
export declare function resetKeys(tab: SettingsTab): string[];
/** Settings received through the RPC, with this window's draft on top. */
export type DisplayStore = ReturnType<typeof createFileDisplay>;
export declare function createFileDisplay(server: import("./server-settings.js").ServerSettings): {
    server: {
        saved: import("solid-js").Accessor<import("../settings/schema.js").ClientSettings | undefined>;
        receive(next: import("../rpc.js").QuotaRpcSettingsOutput): void;
        reshape(next: import("./settings-draft.js").SettingsShape): void;
        value: (key: string) => unknown;
        unset(key: string): boolean;
        set(key: string, next: unknown): void;
        reset: (key: string) => void;
        customOn: (id: string) => boolean;
        switchCustom(id: string, on: boolean): void;
        changedSinceReview: (id: string) => boolean;
        discardSwitches(): void;
        dirty: () => boolean;
        count: () => number;
        changedKeys: () => string[];
        load(): Promise<void>;
        saveNow(key: string, next: unknown): Promise<void>;
        save(): Promise<void>;
        discard(): void;
    };
    shown: () => {
        collapsed: {
            hidden: string[];
            providerOrder: string[];
            rowOrder: Record<string, string[]>;
            runsOut: boolean;
            show: boolean;
            window: Record<string, "lowest" | import("../core/types.js").QuotaWindow>;
        };
        colors: {
            account: "accent" | "bar" | "blue" | "green" | "muted" | "red" | "text" | "yellow" | `#${string}` | undefined;
            arrows: "accent" | "bar" | "blue" | "green" | "muted" | "red" | "text" | "yellow" | `#${string}` | undefined;
            empty: "accent" | "bar" | "blue" | "green" | "muted" | "red" | "text" | "yellow" | `#${string}` | undefined;
            error: "accent" | "bar" | "blue" | "green" | "muted" | "red" | "text" | "yellow" | `#${string}` | undefined;
            good: "accent" | "bar" | "blue" | "green" | "muted" | "red" | "text" | "yellow" | `#${string}` | undefined;
            label: "accent" | "bar" | "blue" | "green" | "muted" | "red" | "text" | "yellow" | `#${string}` | undefined;
            levelBy: "left" | "pace";
            low: "accent" | "bar" | "blue" | "green" | "muted" | "red" | "text" | "yellow" | `#${string}` | undefined;
            lowBelow: number;
            percent: "accent" | "bar" | "blue" | "green" | "muted" | "red" | "text" | "yellow" | `#${string}` | undefined;
            provider: "accent" | "bar" | "blue" | "green" | "muted" | "red" | "text" | "yellow" | `#${string}` | undefined;
            reset: "accent" | "bar" | "blue" | "green" | "muted" | "red" | "text" | "yellow" | `#${string}` | undefined;
            separator: "accent" | "bar" | "blue" | "green" | "muted" | "red" | "text" | "yellow" | `#${string}` | undefined;
            statusName: "accent" | "bar" | "blue" | "green" | "muted" | "red" | "text" | "yellow" | `#${string}` | undefined;
            title: "accent" | "bar" | "blue" | "green" | "muted" | "red" | "text" | "yellow" | `#${string}` | undefined;
            value: "accent" | "bar" | "blue" | "green" | "muted" | "red" | "text" | "yellow" | `#${string}` | undefined;
            warning: "accent" | "bar" | "blue" | "green" | "muted" | "red" | "text" | "yellow" | `#${string}` | undefined;
            warningBelow: number;
        };
        layout: {
            bar: "blocks" | "dots" | "line" | "none" | "shades" | "squares";
            barWidth: number | "fill";
            evenUse: boolean;
            indent: number;
            labelWidth: number;
            providerGap: number;
            separator: string;
        };
        providers: {
            anthropic: {
                binaryPath: string;
            };
            checking: {
                minIntervalMs: number;
                requestTimeoutMs: number;
                waitForQuotaReset: boolean;
            };
            cursor: {
                billingCycleStartDay: number | null;
                includedApiUsd: number | null;
                plan: "none" | "pro" | "pro-plus" | "ultra";
            };
            custom: import("../index.js").QuotaProviderDefinition[];
            off: string[];
            opencode: {
                monthlyLimitUsd: number | null;
            };
            pricing: {
                autoRefreshDays: number;
                source: "auto" | "bundled" | "runtime";
            };
        };
        sidebar: {
            hidden: string[];
            names: Record<string, string>;
            providerOrder: string[];
            rowOrder: Record<string, string[]>;
            runsOut: boolean;
            sessionTokens: boolean;
            show: boolean;
        };
        statusLine: {
            autoScrollSeconds: number;
            composerPill: boolean;
            detail: "auto" | "bar" | "full" | "numbers" | "one" | "reset";
            hidden: string[];
            home: boolean;
            providerOrder: string[];
            rowOrder: Record<string, string[]>;
            runsOut: boolean;
            show: boolean;
            width: number;
            window: Record<string, "lowest" | import("../core/types.js").QuotaWindow>;
            withSidePanel: boolean;
            withSidebar: boolean;
        };
        system: {
            exportFile: boolean;
            exportPath: string;
            oldCommands: boolean;
            telemetry: boolean;
        };
        toast: {
            afterCompaction: boolean;
            afterQuestion: boolean;
            afterReply: "always" | "low" | "off";
            hidden: string[];
            layout: "detailed" | "grouped";
            names: Record<string, string>;
            providerOrder: string[];
            resetNotice: "all" | "off" | "weekly";
            rowOrder: Record<string, string[]>;
            runsOut: boolean;
            seconds: number;
            sessionTokens: boolean;
            show: boolean;
            whenAllFail: boolean;
        };
        version: number;
        words: {
            detail: "detailed" | "summary";
            onlyCurrentModel: boolean;
            percent: "bare" | "left" | "remaining" | "used";
            reset: "compact" | "decimal" | "exact" | "percent" | "short" | "smart";
            resetDecimals: number;
            rowNames: "full" | "short";
            sessionTokens: "current" | "tree";
        };
    };
    edit(change: (settings: DisplaySettings) => DisplaySettings): void;
};
