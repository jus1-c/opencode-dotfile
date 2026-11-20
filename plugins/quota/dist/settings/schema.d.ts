import type { Node } from "jsonc-parser";
import type { QuotaWindow } from "../core/types.js";
import { describeQuotaProviderRequest, type QuotaProviderDefinition } from "../lib/quota-providers.js";
import { CHANGED_SINCE_REVIEW, THEME_COLOR_NAMES, UNSET_IS_NOT_DEFAULT } from "./shared.js";
export { CHANGED_SINCE_REVIEW, THEME_COLOR_NAMES, UNSET_IS_NOT_DEFAULT };
type NumberBounds = {
    min?: number;
    above?: number;
    max?: number;
};
export type SettingRule = ({
    kind: "boolean";
} | {
    kind: "choice";
    values: readonly string[];
}
/**
 * `above` is an exclusive lower bound, `min` and `max` inclusive ones. `word` is a word the
 * setting takes instead of a number ("fill").
 */
 | ({
    kind: "number";
    integer: boolean;
    nullable?: boolean;
    word?: string;
} & NumberBounds)
/** An absolute or `~/` path without `..`; also "" or a command name when allowed. */
 | {
    kind: "path";
    allowEmpty?: boolean;
    allowCommand?: boolean;
} | {
    kind: "providers" | "customProviders" | "strings" | "names" | "rowOrder" | "window" | "color";
} | {
    kind: "separator";
    maxLength: number;
}) & {
    default: unknown;
    /** Only the file sets it (by hand or by an agent): `saveSettings` needs `allowFileOnly`. */
    fileOnly?: boolean;
};
/** Every setting by its dotted key with its default, in the order a new file lists them. */
export declare const SETTINGS_SCHEMA: {
    readonly version: {
        readonly kind: "number";
        readonly integer: true;
        readonly min: number;
        readonly max: number | undefined;
        readonly default: 6;
    };
    readonly "sidebar.show": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    readonly "sidebar.sessionTokens": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    readonly "sidebar.runsOut": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    readonly "sidebar.hidden": {
        readonly kind: "strings";
        readonly default: readonly [];
    };
    readonly "sidebar.providerOrder": {
        readonly kind: "strings";
        readonly default: readonly [];
    };
    readonly "sidebar.rowOrder": {
        readonly kind: "rowOrder";
        readonly default: {};
    };
    readonly "sidebar.names": {
        readonly kind: "names";
        readonly default: {};
    };
    readonly "collapsed.show": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    readonly "collapsed.runsOut": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    readonly "collapsed.hidden": {
        readonly kind: "strings";
        readonly default: readonly [];
    };
    readonly "collapsed.providerOrder": {
        readonly kind: "strings";
        readonly default: readonly [];
    };
    readonly "collapsed.rowOrder": {
        readonly kind: "rowOrder";
        readonly default: {};
    };
    /** A window by provider id; `ALL_PROVIDERS` ("*") for every provider without its own. */
    readonly "collapsed.window": {
        readonly kind: "window";
        readonly default: {};
    };
    readonly "statusLine.show": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    /** The TUI's: also while a sidebar panel shows quota; else only when none is on screen. */
    readonly "statusLine.withSidebar": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    /** Desktop's: also while the Quota tab shows in the side panel; else only when it does not. */
    readonly "statusLine.withSidePanel": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    /** Desktop's: the pill above the message box; else only the bottom strip shows. */
    readonly "statusLine.composerPill": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    readonly "statusLine.runsOut": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    readonly "statusLine.hidden": {
        readonly kind: "strings";
        readonly default: readonly [];
    };
    readonly "statusLine.providerOrder": {
        readonly kind: "strings";
        readonly default: readonly [];
    };
    readonly "statusLine.rowOrder": {
        readonly kind: "rowOrder";
        readonly default: {};
    };
    readonly "statusLine.window": {
        readonly kind: "window";
        readonly default: {};
    };
    readonly "statusLine.detail": {
        readonly kind: "choice";
        readonly values: readonly ["auto", "one", "full", "bar", "reset", "numbers"];
        readonly default: "auto" | "bar" | "full" | "numbers" | "one" | "reset";
    };
    readonly "statusLine.width": {
        readonly kind: "number";
        readonly integer: true;
        readonly min: number;
        readonly max: number | undefined;
        readonly default: 0;
    };
    readonly "statusLine.autoScrollSeconds": {
        readonly kind: "number";
        readonly integer: true;
        readonly min: number;
        readonly max: number | undefined;
        readonly default: 0;
    };
    readonly "statusLine.home": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    readonly "toast.show": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    readonly "toast.runsOut": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    readonly "toast.hidden": {
        readonly kind: "strings";
        readonly default: readonly [];
    };
    readonly "toast.providerOrder": {
        readonly kind: "strings";
        readonly default: readonly [];
    };
    readonly "toast.rowOrder": {
        readonly kind: "rowOrder";
        readonly default: {};
    };
    readonly "toast.names": {
        readonly kind: "names";
        readonly default: {};
    };
    readonly "toast.afterReply": {
        readonly kind: "choice";
        readonly values: readonly ["off", "always", "low"];
        readonly default: "always" | "low" | "off";
    };
    readonly "toast.afterQuestion": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    readonly "toast.afterCompaction": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    readonly "toast.whenAllFail": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    readonly "toast.resetNotice": {
        readonly kind: "choice";
        readonly values: readonly ["off", "weekly", "all"];
        readonly default: "all" | "off" | "weekly";
    };
    /** "grouped": a line per row under its provider; "detailed": v5's two lines per row. */
    readonly "toast.layout": {
        readonly kind: "choice";
        readonly values: readonly ["grouped", "detailed"];
        readonly default: "detailed" | "grouped";
    };
    readonly "toast.seconds": {
        readonly kind: "number";
        readonly integer: true;
        readonly min: number;
        readonly max: number | undefined;
        readonly default: 9;
    };
    readonly "toast.sessionTokens": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    readonly "colors.good": {
        readonly kind: "color";
        readonly default: undefined;
    };
    readonly "colors.warning": {
        readonly kind: "color";
        readonly default: undefined;
    };
    readonly "colors.low": {
        readonly kind: "color";
        readonly default: undefined;
    };
    readonly "colors.empty": {
        readonly kind: "color";
        readonly default: undefined;
    };
    readonly "colors.title": {
        readonly kind: "color";
        readonly default: undefined;
    };
    readonly "colors.provider": {
        readonly kind: "color";
        readonly default: undefined;
    };
    readonly "colors.account": {
        readonly kind: "color";
        readonly default: undefined;
    };
    readonly "colors.label": {
        readonly kind: "color";
        readonly default: undefined;
    };
    readonly "colors.percent": {
        readonly kind: "color";
        readonly default: undefined;
    };
    readonly "colors.reset": {
        readonly kind: "color";
        readonly default: undefined;
    };
    readonly "colors.value": {
        readonly kind: "color";
        readonly default: undefined;
    };
    readonly "colors.error": {
        readonly kind: "color";
        readonly default: undefined;
    };
    readonly "colors.statusName": {
        readonly kind: "color";
        readonly default: undefined;
    };
    readonly "colors.separator": {
        readonly kind: "color";
        readonly default: undefined;
    };
    readonly "colors.arrows": {
        readonly kind: "color";
        readonly default: undefined;
    };
    /**
     * What the bar colors follow: "left", the share left against the two levels below; "pace", how
     * fast the limit is used against even use until its reset (the share left without a reset).
     */
    readonly "colors.levelBy": {
        readonly kind: "choice";
        readonly values: readonly ["left", "pace"];
        readonly default: "left" | "pace";
    };
    readonly "colors.warningBelow": {
        readonly kind: "number";
        readonly integer: true;
        readonly min: number;
        readonly max: number | undefined;
        readonly default: 50;
    };
    readonly "colors.lowBelow": {
        readonly kind: "number";
        readonly integer: true;
        readonly min: number;
        readonly max: number | undefined;
        readonly default: 20;
    };
    readonly "layout.bar": {
        readonly kind: "choice";
        readonly values: readonly ["blocks", "shades", "line", "squares", "dots", "none"];
        readonly default: "blocks" | "dots" | "line" | "none" | "shades" | "squares";
    };
    /** "fill": the room the other columns leave, up to each place's most. */
    readonly "layout.barWidth": {
        readonly kind: "number";
        readonly integer: true;
        readonly min: number;
        readonly max: number | undefined;
        readonly word: "fill";
        readonly default: "fill";
    };
    /** The ┃ mark where even use would be, in every place's bars, the Limits tab's too. */
    readonly "layout.evenUse": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    readonly "layout.indent": {
        readonly kind: "number";
        readonly integer: true;
        readonly min: number;
        readonly max: number | undefined;
        readonly default: 1;
    };
    /** The most columns a row name takes; the name column fits the names next to a bar. */
    readonly "layout.labelWidth": {
        readonly kind: "number";
        readonly integer: true;
        readonly min: number;
        readonly max: number | undefined;
        readonly default: 8;
    };
    /** Empty lines between providers in the sidebar. */
    readonly "layout.providerGap": {
        readonly kind: "number";
        readonly integer: true;
        readonly min: number;
        readonly max: number | undefined;
        readonly default: 1;
    };
    /** Between providers on the status line. */
    readonly "layout.separator": {
        readonly kind: "separator";
        readonly maxLength: 5;
        readonly default: " · ";
    };
    /**
     * The share every client shows: "58% left", "58% remaining", "58%", or "42% used". `used` also
     * fills the bars and their even-use mark with the share used. The expanded sidebar panel says
     * the word in its title ("▼ Quota used") and leaves it off its rows; other places keep it.
     */
    readonly "words.percent": {
        readonly kind: "choice";
        readonly values: readonly ["left", "remaining", "bare", "used"];
        readonly default: "bare" | "left" | "remaining" | "used";
    };
    /**
     * "4.5d" (smart), "2h 14m", "2h14m", "2h", "2.2h" (with `resetDecimals`), or "percent": the
     * share of the window's time left (used, with `percent` "used"), then the time in its largest
     * unit ("58%/91% 4d"); that time alone when the window's start is unknown.
     */
    readonly "words.reset": {
        readonly kind: "choice";
        readonly values: readonly ["smart", "exact", "compact", "short", "decimal", "percent"];
        readonly default: "compact" | "decimal" | "exact" | "percent" | "short" | "smart";
    };
    /** Decimals of the "decimal" reset style. */
    readonly "words.resetDecimals": {
        readonly kind: "number";
        readonly integer: true;
        readonly min: number;
        readonly max: number | undefined;
        readonly default: 1;
    };
    /**
     * How the sidebar, the collapsed panel, the status line and toasts name a row: "short" by its
     * window ("5h", "7d") unless another row of its provider has the same one, "full" by its label.
     * A row you renamed shows your name in both.
     */
    readonly "words.rowNames": {
        readonly kind: "choice";
        readonly values: readonly ["short", "full"];
        readonly default: "full" | "short";
    };
    /** "detailed" also shows supplementary rows. */
    readonly "words.detail": {
        readonly kind: "choice";
        readonly values: readonly ["summary", "detailed"];
        readonly default: "detailed" | "summary";
    };
    /** Show only the providers serving the session's current model. */
    readonly "words.onlyCurrentModel": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    /** Session tokens of this session, or with its subagents. */
    readonly "words.sessionTokens": {
        readonly kind: "choice";
        readonly values: readonly ["current", "tree"];
        readonly default: "current" | "tree";
    };
    readonly "providers.off": {
        readonly kind: "providers";
        readonly default: readonly [];
    };
    readonly "providers.custom": {
        readonly kind: "customProviders";
        readonly default: readonly [];
        readonly fileOnly: true;
    };
    /** The Claude CLI quota runs for Claude limits. */
    readonly "providers.anthropic.binaryPath": {
        readonly kind: "path";
        readonly allowCommand: true;
        readonly default: "claude";
        readonly fileOnly: true;
    };
    readonly "providers.cursor.plan": {
        readonly kind: "choice";
        readonly values: readonly ["none", "pro", "pro-plus", "ultra"];
        readonly default: "none" | "pro" | "pro-plus" | "ultra";
    };
    readonly "providers.cursor.includedApiUsd": {
        readonly kind: "number";
        readonly integer: false;
        readonly above: 0;
        readonly nullable: true;
        readonly default: null;
    };
    readonly "providers.cursor.billingCycleStartDay": {
        readonly kind: "number";
        readonly integer: true;
        readonly min: number;
        readonly max: number | undefined;
        readonly nullable: true;
        readonly default: null;
    };
    readonly "providers.opencode.monthlyLimitUsd": {
        readonly kind: "number";
        readonly integer: false;
        readonly above: 0;
        readonly nullable: true;
        readonly default: null;
    };
    readonly "providers.checking.minIntervalMs": {
        readonly kind: "number";
        readonly integer: false;
        readonly above: 0;
        readonly default: number;
    };
    readonly "providers.checking.requestTimeoutMs": {
        readonly kind: "number";
        readonly integer: false;
        readonly above: 0;
        readonly default: number;
    };
    readonly "providers.checking.waitForQuotaReset": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    readonly "providers.pricing.source": {
        readonly kind: "choice";
        readonly values: readonly ["auto", "bundled", "runtime"];
        readonly default: "auto" | "bundled" | "runtime";
    };
    readonly "providers.pricing.autoRefreshDays": {
        readonly kind: "number";
        readonly integer: true;
        readonly min: number;
        readonly max: number | undefined;
        readonly default: 7;
    };
    readonly "system.exportFile": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    /** "" = `$XDG_CACHE_HOME/opencode/quota-export.json`. */
    readonly "system.exportPath": {
        readonly kind: "path";
        readonly allowEmpty: true;
        readonly default: "";
        readonly fileOnly: true;
    };
    readonly "system.telemetry": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
    /** The 4.x and 5.x /tokens_* commands, each `/quota_usage` on its range. */
    readonly "system.oldCommands": {
        readonly kind: "boolean";
        readonly default: boolean;
    };
};
type KindValue = {
    boolean: boolean;
    number: number;
    path: string;
    providers: string[];
    strings: string[];
    names: Record<string, string>;
    rowOrder: Record<string, string[]>;
    window: Record<string, "lowest" | QuotaWindow>;
    color: (typeof THEME_COLOR_NAMES)[number] | `#${string}` | undefined;
    separator: string;
    customProviders: QuotaProviderDefinition[];
};
type ValueOf<R> = R extends {
    values: readonly (infer V)[];
} ? V : R extends {
    word: infer W extends string;
} ? number | W : R extends {
    nullable: true;
} ? number | null : R extends {
    kind: infer K extends keyof KindValue;
} ? KindValue[K] : never;
type Head<K> = K extends `${infer Group}.${string}` ? Group : K;
type Under<T, Group extends string> = {
    [K in keyof T as K extends `${Group}.${infer Rest}` ? Rest : never]: T[K];
};
/** `{ "a.b": X }` as `{ a: { b: X } }`. */
type Nest<T> = {
    [K in keyof T as Head<K>]: K extends `${infer Group}.${string}` ? Nest<Under<T, Group>> : T[K];
};
type Schema = typeof SETTINGS_SCHEMA;
export type Settings = Nest<{
    -readonly [K in keyof Schema]: ValueOf<Schema[K]>;
}>;
type Patch<T> = T extends readonly unknown[] ? T : T extends object ? {
    [K in keyof T]?: Patch<T[K]> | null;
} : T;
/** A JSON merge patch of the settings: objects merge, null resets a key or a whole group. */
export type SettingsPatch = Patch<Settings>;
export declare function defaultSettings(): Settings;
export declare function isSettingsGroup(key: string): boolean;
/** Whether `key` is a file-only setting or a group that holds one. */
export declare function isFileOnly(key: string): boolean;
/** The names directly inside `group` ("" = the top level), in file order. */
export declare function keysUnder(group: string): string[];
/**
 * A provider's id as `providers.off` stores it: the same id, except "custom" for the custom
 * providers, which the registry and their rows call "quota-providers".
 */
export declare function offProviderId(providerId: string): string;
/** Provider ids `providers.off` accepts; `custom` switches all custom providers off. */
export declare const PROVIDER_IDS: readonly string[];
/** What a rule accepts, in words, for issue messages and the agent tools. */
export declare function describeRule(rule: SettingRule): string;
export type SettingsIssue = {
    key: string;
    message: string;
};
/** A checked value: `value` to use when present, and what was wrong with it. */
export type CheckedSetting = {
    value?: unknown;
    issues: SettingsIssue[];
};
export declare function isRecordSetting(key: string): boolean;
/** Checks one value against its rule; `key` must be in SETTINGS_SCHEMA. */
export declare function checkSetting(key: string, value: unknown): CheckedSetting;
/** One `key: value` a file or a patch sets, in the order it sets them. */
type Assignment = {
    key: string;
    value: unknown;
};
/** How to walk a value: plain JSON values, or jsonc-parser nodes (which keep duplicate keys). */
type Walker<T> = {
    entries(value: T): Array<[string, T]> | undefined;
    leaf(value: T): unknown;
};
export declare const PLAIN_WALKER: Walker<unknown>;
export declare const NODE_WALKER: Walker<Node>;
/** A file sets a key twice: reading uses the last valid value, saving refuses. */
export declare const DUPLICATE_KEY = "duplicate key; the last valid value is used";
/** A name with a dot ("words.percent") is not read (settings nest), and saving refuses it. */
export declare const DOTTED_KEY = "a key with a dot is not read";
/**
 * The settings an object sets, as dotted keys in order. Unknown, duplicate and dotted keys
 * become issues; a group set to something other than an object becomes an assignment of the group
 * key, so the caller decides (an issue when reading, a reset when a patch says null). An issue
 * names a settings key, or the position of a name that is not one: a name that is not a setting
 * is never repeated, so a secret typed as a key name stays out of every message.
 */
export declare function flattenSettings<T>(walker: Walker<T>, value: T, prefix?: string): {
    assignments: Assignment[];
    issues: SettingsIssue[];
};
/** Sets a dotted key in a nested object, making the groups on the way. */
export declare function setPath(target: object, key: string, value: unknown): void;
/**
 * The defaults with every valid assignment applied in order. An invalid value is reported and
 * changes nothing, so a bad value later in the file never replaces a good one before it.
 */
export declare function settingsFrom(assignments: readonly Assignment[]): {
    settings: Settings;
    issues: SettingsIssue[];
    fromFile: string[];
};
/**
 * Every setting whose value differs between `before` and `after`. With the keys each file sets,
 * a setting in `UNSET_IS_NOT_DEFAULT` the file does not set is null, so setting it to its
 * default or removing it is a change too.
 */
export declare function diffSettings(before: Settings, after: Settings, fromFile?: {
    before: readonly string[];
    after: readonly string[];
}): Array<{
    key: string;
    before: unknown;
    after: unknown;
}>;
/** A custom provider as the quota window's Providers tab shows it, with its on/off switch. */
export type CustomProviderSwitch = {
    id: string;
    label: string;
    enabled: boolean;
    /** Where it sends its key, and which key; null for a local estimate, which sends nothing. */
    request: ReturnType<typeof describeQuotaProviderRequest>;
    /** `customProviderFingerprint`: switching it on sends it back, so it is this definition. */
    fingerprint: string;
};
/**
 * A hash of what the user checks before switching a custom provider on (`request`) and of the
 * fields that decide where its request goes and which key it reads.
 */
export declare function customProviderFingerprint(definition: QuotaProviderDefinition): string;
/** The file settings a client shows and edits in the quota window. */
export type ClientSettings = {
    /** Every setting but `version` and the file-only ones, by dotted key ("words.percent"). */
    values: Record<string, unknown>;
    /**
     * The keys of `values` that settings.jsonc sets, with an invalid value too (shown as its
     * default); the others follow their defaults.
     */
    fromFile: string[];
    /** The ids `providers.off` takes, with their names. */
    providers: Array<{
        id: string;
        label: string;
    }>;
    /** The custom providers in settings.jsonc, without the retired estimate's leftover tuning. */
    custom: CustomProviderSwitch[];
};
/** `fromFile` and `issues` as `loadSettings` returns them. */
export declare function clientSettings({ settings, fromFile: fileKeys, issues, }: {
    settings: Settings;
    fromFile: readonly string[];
    issues: readonly SettingsIssue[];
}): ClientSettings;
