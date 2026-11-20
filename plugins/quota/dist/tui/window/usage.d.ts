/** @jsxImportSource @opentui/solid */
/**
 * The quota window's Usage tab: tokens and API cost from OpenCode's own history, laid out by
 * `view/usage.ts`, and the model detail popup. The window puts the range list (`Rail`) left of
 * the scrolling content (`View`), a muted line between them. The content's first line has the
 * chosen range and its dates, and Cost and Tokens at its right; the Breakdown heading has Model
 * and Day at its right.
 *
 * The range list has the keyboard when the tab shows: ↑↓ change the range. → or enter give the
 * keyboard to the model rows: ↑↓ walk them, the current one highlighted, enter opens a model's
 * details and ← goes back to the range list. Anywhere in the tab: c cost, t tokens, b by model
 * or by day, p download new prices, and d types the dates of "Between": the two date boxes show
 * on the first line, enter goes to the next date and then applies them, tab switches dates, esc
 * gives the keyboard back. A click picks a range, Cost or Tokens, Model or Day, or opens a model.
 *
 * The tab keeps Cost or Tokens and Model or Day while the window is open and closed. Switching
 * to the tab, or opening the window on it, shows the default range; `/quota_usage <range>` and
 * the `/tokens_*` commands show theirs. Each show asks the server again. An answer that arrives
 * after a newer question is dropped.
 */
import { type Renderable, RGBA, type ScrollBoxRenderable } from "@opentui/core";
import { type JSX } from "@opentui/solid";
import { type UsageRange } from "../../core/usage-ranges.js";
import type { KeyHint, WindowHost, WindowTheme } from "./shell.js";
/** OpenCode's theme also has categorical hue scales, for things told apart by color. */
type UsageTheme = WindowTheme & {
    categorical?: ReadonlyArray<Record<number, RGBA>>;
};
/** What the window keeps left of the content: the range list, the line after it and a gap. */
export declare const USAGE_RAIL_WIDTH: number;
/** A tab of the window's tab bar: bold and underlined when it is the current one. */
export declare function Choice(props: {
    label: string;
    active: boolean;
    theme: UsageTheme;
    run: () => void;
}): JSX.Element;
/**
 * An option inside the Usage tab (cost or tokens, model or day): the current one bold on
 * a raised background, so a row of options reads apart from the tab bar's underlined tabs. On
 * the highlighted line (`lit`) the other options take its text color.
 */
export declare function Option(props: {
    label: string;
    active: boolean;
    lit?: boolean;
    theme: UsageTheme;
    run: () => void;
}): JSX.Element;
/** A range to show, with its dates for "between". */
export type UsageChoice = {
    range: UsageRange;
    from?: string;
    to?: string;
};
export type UsageTab = {
    /** Puts the tab on a range; the next `show` asks for it. */
    choose(choice: UsageChoice): void;
    /** True while one of the Between dates has the keyboard. */
    typingDate(): boolean;
    /** Gives the range list the keyboard and asks the server for the report again, for the window's session. */
    show(sessionID: string): void;
    /** The tab's keys for the window's bottom line; they follow where the keyboard is. */
    hints(): KeyHint[];
    /** The range list, left of the window's scrolling content. */
    Rail(): JSX.Element;
    View(props: {
        width: number;
        keyTarget: () => Renderable | undefined;
    }): JSX.Element;
};
/** `scroll`: the window's scrollbox, which keeps the current model row in view. */
export declare function createUsageTab(api: WindowHost, scroll: () => ScrollBoxRenderable | undefined): UsageTab;
export {};
