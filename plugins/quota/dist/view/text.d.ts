/**
 * The lines of every quota surface, built from the visible groups (`select.ts`). The TUI
 * draws each segment in its color role; the Web and terminal `/quota` text print the plain
 * text.
 */
import type { QuotaSnapshot, SessionModelInput, SessionTokens, Words } from "../core/types.js";
import type { Settings } from "../settings/schema.js";
import { type BarShape, type Level } from "./format.js";
import { type Group, type WindowChoice } from "./select.js";
/** Every colored thing quota draws; the TUI maps each to a theme color. */
export type ColorRole = "title" | "provider" | "account" | "label" | "good" | "warning" | "low" | "empty" | "percent" | "reset" | "value" | "error" | "statusName" | "separator" | "arrows";
/**
 * A piece of a line. `role` "bar" is the filled part of a bar, drawn in its level color.
 * `percent` is the row's percent left, for roles that follow the bar color, and `paceLevel` its
 * level by pace, for when the bar colors follow pace.
 */
export type Segment = {
    text: string;
    role: ColorRole | "bar";
    percent?: number;
    paceLevel?: Level;
    bold?: boolean;
};
/** `segments` with the row's level by pace on each one that follows the bar color. */
export declare function withPaceLevel(segments: Segment[], paceLevel: Level | undefined): Segment[];
/** A line of a surface. `id` is the provider or row it shows ("" for a spacer). */
export type Line = {
    id: string;
    segments: Segment[];
};
export type Layout = Settings["layout"];
export declare function lineText(line: Line): string;
/**
 * A bar in two parts: the share the words show in its level color, then the rest. The fill is
 * the percent left, or the percent used when `words.percent` is "used", so it matches the number
 * beside it. With `evenLeft`, the percent even use would leave now (`core/pace.ts`), the ┃ mark
 * takes the place of the cell where even use would be, in the row labels' color; a bar under 3
 * cells gets no mark. Segments keep the percent left, so their colors and levels never change
 * with the words.
 */
export declare function barSegments(shape: BarShape, percent: number, width: number, evenLeft: number | undefined, words: Words): Segment[];
type SidebarInput = {
    groups: Group[];
    layout: Layout;
    words: Words;
    nowMs: number;
    /** Columns the sidebar gives quota. */
    width: number;
    sessionTokens?: SessionTokens;
    /** A "runs out in 2h" line under each row that runs out before its reset. */
    runsOut?: boolean;
};
/** §4.1: the expanded panel's title, with the percent's word its rows leave out: "▼ Quota left". */
export declare function sidebarTitle(words: Words): string;
/**
 * "⚠ low cache: 35% (claude-sonnet-5)" for the model with the lowest cache hit among those
 * whose cache hit is low (`cacheHit`), its name cut to fit `width`; undefined when none is.
 */
export declare function lowCacheLine(models: SessionModelInput[], width: number): Line | undefined;
/**
 * §4.1: the expanded Quota panel, below its title line (`sidebarTitle`). The name column fits
 * the longest name next to a bar; a row without a bar (a balance) starts its value there, or 2
 * columns after a longer name.
 */
export declare function sidebarLines(input: SidebarInput): Line[];
/** §4.2: the collapsed panel's title. A provider with several accounts counts once. */
export declare function collapsedTitle(groups: Group[]): string;
type CollapsedInput = {
    groups: Group[];
    layout: Layout;
    words: Words;
    nowMs: number;
    width: number;
    /** Preferred window by provider id, or for all providers (`windowFor`). */
    window: Record<string, WindowChoice>;
    /** A "runs out in 2h" line under each provider whose shown row runs out before its reset. */
    runsOut?: boolean;
};
/**
 * §4.2: one line per provider with its preferred window. When the last check failed, the
 * error's words take the place of the reset time next to the rows kept from before. The bar
 * takes the room the names, the percent and the longest reset time leave, at most 10 cells.
 */
export declare function collapsedLines(input: CollapsedInput): Line[];
/** How much one status line segment shows, from the most to the least. */
export type StatusLevel = "full" | "bar" | "reset" | "numbers";
export type StatusInput = {
    groups: Group[];
    layout: Layout;
    words: Words;
    nowMs: number;
    window: Record<string, WindowChoice>;
    /** "(runs out in 2h)" after each provider whose shown row runs out before its reset. */
    runsOut?: boolean;
};
export type StatusLayout = {
    level: StatusLevel;
    /** The first group shown (the line scrolls when not all groups fit). */
    start: number;
    shown: Line[];
    /** Groups after the shown ones: the "+N ›" marker. */
    hiddenAfter: number;
};
/** Columns of the whole status line, every group at `level`, separators included. */
export declare function statusLineWidth(input: StatusInput, level: StatusLevel): number;
/**
 * §4.3 "all" mode: the most detail that fits every group in `room` columns ("% only" when
 * nothing else fits), then the groups that fit from `start`, keeping room for the "‹ " and
 * " +N ›" markers. When not even the first of them fits, its name is cut short, so the
 * markers stay; with no room for any of its name, no group is shown and `statusMarkers`
 * still gives the markers. `level` fixes the detail instead of "auto".
 */
export declare function statusLayout(input: StatusInput, room: number, start: number, level: StatusLevel | "auto"): StatusLayout;
/**
 * The scroll markers around the shown groups: "‹ " when groups come before them, and
 * " +N ›" when N groups come after. With no group shown, "+N ›" stands alone, so a line too
 * narrow for any group still shows that there are some. Empty when not shown.
 */
export declare function statusMarkers(layout: StatusLayout): {
    before: string;
    after: string;
};
/**
 * §4.3 "one provider, big bar" (v5's prompt bar): the first group with a 10-cell bar. The
 * error's words take the place of the reset time; without a percent row the line shows the
 * group's error or value instead of a bar. Cut to `width` columns when given, keeping " ⚠"
 * when the error's words don't fit.
 */
export declare function bigStatusLine(input: StatusInput, width?: number): Line | undefined;
/**
 * §4.4: plain text: per provider, one line per visible row, then a line for its error or
 * "not checked yet". The terminal command `opencode-quota show` prints these.
 */
export declare function plainLines(params: {
    groups: Group[];
    words: Words;
    nowMs: number;
    sessionTokens?: SessionTokens;
    /** "runs out in 2h" after each row that runs out before its reset. */
    runsOut?: boolean;
}): string[];
/**
 * How a toast lays out its rows: one line per row under its provider's name ("grouped"), or
 * each row on two lines with a bar as wide as the toast ("detailed").
 */
export type ToastLayout = Settings["toast"]["layout"];
export type ToastInput = {
    groups: Group[];
    words: Words;
    nowMs: number;
    /** The bar shape and the even-use mark; a toast's bars take the room it has. */
    layout: Layout;
    /** The colors of its roles and levels, for a window that draws the rows itself. */
    colors: Settings["colors"];
    toastLayout: ToastLayout;
    /** Columns of text inside the toast (`toastRoom`); no line is wider. */
    room: number;
    /** A "runs out in 2h" line under each row that runs out before its reset. */
    runsOut?: boolean;
    sessionTokens?: SessionTokens;
};
/** The segments without the spaces at the end of their line. */
export declare function trimEnd(segments: Segment[]): Segment[];
/** §4.4: a quota toast's lines in its layout, none wider than `room` columns. */
export declare function toastLines(input: ToastInput): Line[];
/**
 * A quota toast's rows as sentences for a window, which draws text in a proportional font and
 * may join lines: one per provider account, "Claude (work): 5h 80% left 2h 14m · Weekly 60% left
 * 3.2d.", its error or "not checked yet" first, then the session's tokens. No padding or bars.
 */
export declare function toastSentences(input: ToastInput): string[];
/** Where a surface draws: the time, and its columns (a toast's inside the toast, `toastRoom`). */
export type SurfaceView = {
    nowMs: number;
    width: number;
};
/**
 * §4.1 and §4.2: the Quota panel in the session sidebar, expanded (`open`) or collapsed: its
 * title, then its lines. A collapsed panel that is off keeps its title; before the first
 * snapshot there are no lines.
 */
export declare function sidebarPanel(snapshot: QuotaSnapshot | undefined, settings: Settings, view: SurfaceView & {
    open: boolean;
}): {
    title: string;
    lines: Line[];
};
/** §4.3: what the status line lays out (`statusLayout`, `bigStatusLine`). */
export declare function statusLineInput(snapshot: QuotaSnapshot, settings: Settings, nowMs: number): StatusInput;
/** §4.4: what a quota toast lays out (`toastLines`): its rows, then the tokens when it shows them. */
export declare function toastInput(snapshot: QuotaSnapshot, settings: Settings, view: SurfaceView): ToastInput;
export {};
