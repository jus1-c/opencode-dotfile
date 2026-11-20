/** @jsxImportSource @opentui/solid */
/**
 * The quota window. `/quota`, `/quota_usage`, `/quota_status` and `/quota_settings` open it
 * above the message box of a session, where it covers the chat
 * with the same size on every tab: Usage, Limits, Plugin and the Settings tabs Layout, Colors
 * and Providers (`settings.tsx`); Layout has pages, All places and one per place. The tab bar is
 * one line: the window's title and the plugin's version, the tabs, and "esc" at its right end to
 * close the window. When its tabs don't fit, it drops the "Settings" label, then shows the tabs
 * around the current one between ‹ and ›. Usage keeps its range list and Layout its page list
 * left of the scrolling tab body (`rail.tsx`); a Settings tab's switch and warning sit above
 * that body. The bottom line lists the tab's keys (Usage's as key and label pairs); the Settings
 * tabs have Save and Discard above it. While the window is focused (it is after opening; click
 * it to give it the keyboard again) its keys work: ↑↓ select or scroll,
 * space/enter use a line, ←/→ change it, c on Limits copies its limits as text, tab switches
 * tabs, esc closes (the line rules are `option-line.ts`'s). Closing gives the keyboard back to
 * whatever had it before. Plugin shows the maintainer notices, the switches for other tools and
 * the status report (`plugin-tab.tsx`).
 */
import type { Plugin } from "@opencode/plugin/tui";
import type { RGBA } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import type { ClientHost } from "../client.js";
import type { SettingsTab } from "../display.js";
import type { SurfaceHost } from "../sidebar.js";
import type { Theme } from "../theme.js";
import { type SettingsEditor } from "./settings.js";
import { type UsageChoice } from "./usage.js";
export type WindowTab = "limits" | "usage" | "system" | SettingsTab;
/** The keyboard hint of Limits and the other tabs without their own; Limits names the ┃ mark with `evenUse`. */
export declare function windowHint(tab: WindowTab | undefined, evenUse: boolean): string;
/** The keyboard hint in `width` columns, its lines broken between " · " items, never inside one. */
export declare function hintLines(hint: string, width: number): string;
/** A key and what it does, for a tab's bottom line; without a key, a note such as "updating…". */
export type KeyHint = {
    key?: string;
    label: string;
};
/** The key hints in `width` columns, two spaces apart, lines broken between hints, never inside one. */
export declare function keyHintLines(hints: readonly KeyHint[], width: number): KeyHint[][];
export type TabStrip = {
    first: number;
    last: number;
    settingsLabel: boolean;
};
/**
 * What fits in `room` columns after the window's title: every tab under both labels; every tab
 * with a │ before the Settings tabs; or the tabs around `active` between ‹ and ›.
 */
export declare function tabStrip(titles: readonly string[], settingsFrom: number, active: number, room: number): TabStrip;
/** The theme tokens the window reads, besides the surfaces' ones (OpenCode's `ResolvedTheme`). */
export type WindowTheme = Theme & {
    text: Theme["text"] & {
        action: {
            primary: {
                focused: RGBA;
                selected: RGBA;
            };
        };
    };
    background: {
        action: {
            primary: {
                focused: RGBA;
            };
        };
        raised: {
            high: RGBA;
        };
    };
    border: {
        base: RGBA;
    };
};
/** Returning false lets the key continue to the next layer. */
export type WindowKey = {
    bind: string;
    title: string;
    group: string;
    run: () => void | false;
};
/** What the window needs from OpenCode's TUI context (its theme and client types aren't installed). */
export type WindowHost = Pick<Plugin.Context, "keymap" | "renderer" | "themeMode" | "ui"> & ClientHost & {
    theme: WindowTheme;
};
/** The session on screen; undefined on Home. */
export declare function routeSessionID(api: {
    ui: {
        router: {
            current(): {
                type: string;
                sessionID?: string;
            };
        };
    };
}): string | undefined;
export type QuotaWindow = {
    /**
     * Opens the window on a tab, or switches to it; "settings" is the first Settings tab, and Usage
     * shows the default range. On Home it only says to open a session.
     */
    open(tab: WindowTab | "settings"): void;
    openUsage(choice: UsageChoice): void;
    /** The `session.composer.top` slot. */
    Slot(props: {
        sessionID: string;
    }): JSX.Element;
};
export declare function createQuotaWindow(api: WindowHost, host: SurfaceHost, settings: SettingsEditor): QuotaWindow;
