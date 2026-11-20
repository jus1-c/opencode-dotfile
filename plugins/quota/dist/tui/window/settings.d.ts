/** @jsxImportSource @opentui/solid */
/**
 * The Settings tabs edit settings.jsonc; surfaces preview saved settings with draft changes.
 * Layout's pages are a list left of the body (`Pages`), like Usage's ranges. When a page shows,
 * the list has the keyboard: ↑↓ change the page, → or enter go to the page's first line, and ↑
 * on that line goes back to the list.
 */
import { type BoxRenderable, type MouseEvent, RGBA, type ScrollBoxRenderable } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import type { Surface } from "../../view/select.js";
import { type DisplayStore, type SettingsTab } from "../display.js";
import type { SurfaceHost } from "../sidebar.js";
import type { Toasts } from "../toasts.js";
import { type OptionLine } from "./option-line.js";
import type { WindowHost, WindowTheme } from "./shell.js";
export type { OptionLine } from "./option-line.js";
export declare const SETTINGS_TABS: ReadonlyArray<{
    tab: SettingsTab;
    title: string;
    /** A surface tab's switch on top. */
    switchTitle?: string;
    /** Its changes show in the sidebar, so it says when the sidebar is hidden. */
    watchesSidebar: boolean;
}>;
/**
 * The Settings tabs of the window's tab bar, each with its pages: Layout has All places, then one
 * per place; the others are one page each.
 */
export declare const SETTINGS_GROUPS: ReadonlyArray<{
    title: string;
    pages: readonly SettingsTab[];
}>;
export declare function isSettingsTab(tab: string | undefined): tab is SettingsTab;
/** What the window keeps left of a Settings tab's body: Layout's page list, else nothing. */
export declare function pagesRoom(tab: string | undefined): number;
type Click = (run: () => void) => () => void;
/**
 * A line's title and value widths in `width` columns: 26 and the value's own width when both
 * fit; else the title gives way first (down to 12 columns), then the value (down to 6).
 */
export declare function lineColumns(width: number | undefined, valueWidth?: number): {
    title: number;
    value: number;
};
/**
 * One-line text that keeps its width, unless `shrink` lets it give way. With `wrap` (notes,
 * details) it goes on to more lines between words instead of being cut.
 */
export declare function Cell(props: {
    fg?: RGBA;
    bold?: boolean;
    shrink?: boolean;
    wrap?: boolean;
    onUp?: () => void;
    children: JSX.Element;
}): JSX.Element;
/** A window tab's option line: title, ‹ value ›, value ▸ or a tick, color swatches, then a note. */
export declare function OptionRow(props: {
    line: OptionLine;
    theme: WindowTheme;
    active: boolean;
    click: Click;
    /** A press anywhere on the line. */
    press: (event: MouseEvent) => void;
    /** A click on the value or on › / ▸. */
    use: () => void;
    /** The first line of a list has no gap above its group heading. */
    first?: boolean;
    valueWidth?: number;
    /**
     * The line's room: the title, then the value, narrow to fit it (`lineColumns`); a note that
     * doesn't fit after the value goes on a line under it.
     */
    width?: number;
    /** The input that replaces the value while the line takes typing, `width` columns wide. */
    input?: (width: number) => JSX.Element;
}): JSX.Element;
export type SettingsEditor = ReturnType<typeof createSettingsEditor>;
export declare function createSettingsEditor(api: WindowHost, display: DisplayStore, toasts: Pick<Toasts, "preview" | "closePreview">): {
    /** The tree line selected on `surface`'s tab, which that surface marks. */
    marked(surface: Surface): string | undefined;
    /** Sidebar shows the panel expanded and Collapsed collapsed; undefined = as the user left it. */
    panelOpen(): boolean | undefined;
    /** A sidebar panel mounts; the returned function unmounts it. */
    sidebarShown(): () => void;
    sidebarOnScreen: () => boolean;
    tabOpen: (surface: Surface) => boolean;
    /** A line takes typing, so the window's own keys rest. */
    typing: () => boolean;
    /** A Plugin switch's saved value (`system.exportFile`); undefined until the server answers. */
    savedSwitch(key: string): boolean | undefined;
    /** Saves a Plugin switch straight away; Plugin has no draft and no Save. */
    saveSwitch: (key: string, on: boolean) => Promise<void>;
    /** Reads the saved settings again, for Plugin's switches. */
    loadSaved: () => Promise<void>;
    /**
     * The window shows `next`; undefined when it closed, which drops the changes. Any tab
     * change stops typing, so the window gets its keys back.
     */
    setTab(next: string | undefined): void;
    /** Esc or Close: true while there are unsaved changes; the bottom bar then asks about them. */
    askBeforeClose(): boolean;
    /** A press anywhere in the window: clicks count again after a drag, and typing goes on. */
    pressed(): void;
    click: Click;
    /** The keyboard hint, or undefined for the window's own. */
    hint(windowTab: string, hasKeyboard: boolean): string | undefined;
    Pages: (props: {
        tab: SettingsTab;
        showPage: (tab: SettingsTab) => void;
    }) => JSX.Element;
    Header: (props: {
        tab: SettingsTab;
        refocus: () => void;
    }) => JSX.Element;
    Body: (props: {
        tab: SettingsTab;
        showPage: (tab: SettingsTab) => void;
        host: SurfaceHost;
        sessionID: string;
        box: () => BoxRenderable | undefined;
        scroll: () => ScrollBoxRenderable | undefined;
        /** The body's room: the scrollbar's column and a gap before it stay free. */
        width: number;
        /** The window's clock, so the tree's reset times count down. */
        nowMs: number;
    }) => JSX.Element;
    Buttons: (props: {
        tab: string;
        host: SurfaceHost;
        sessionID: string;
        box: () => BoxRenderable | undefined;
        close: () => void;
    }) => JSX.Element;
};
