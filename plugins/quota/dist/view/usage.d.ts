/**
 * The usage view: a `UsageReport` laid out like a billing dashboard, adapted to a terminal, as
 * lines of text spans. A span has a role ("title", "muted", "provider:0", ...) and no color, so
 * the TUI Usage tab maps each span to one styled span and picks colors from its theme, and Web
 * `/quota` and the CLI print the same words as plain text (`usageText`).
 *
 * Sections, top to bottom: the total, the providers as a small table, a daily chart (beside
 * the total and the providers when it gets 32 columns there, as tall as they are), the request
 * count and token totals, cost (or tokens) by type, the breakdown by model or by day, and the share of
 * tokens without a price. In the TUI the chart fills its width with each day split by provider
 * in the providers' colors, the "by type" bar is a thin line across the view and each breakdown
 * row has a bar of its amount. `modelDetailView` lays out one model of the breakdown. Every line
 * fits in `width` terminal columns.
 */
import type { UsageModelRow, UsageReport, UsageRow } from "../core/usage.js";
/** What the view counts: money at API prices, or processed tokens. */
export type UsageMode = "cost" | "tokens";
export type UsageBreakdown = "model" | "day";
export type UsageViewOptions = {
    mode: UsageMode;
    breakdown: UsageBreakdown;
    width: number;
};
type UsageTextOptions = {
    mode: UsageMode;
    breakdown: UsageBreakdown;
    width?: number;
};
type ModelDetailOptions = {
    mode: UsageMode;
    width: number;
};
/** A part of the "by type" bar: the token kinds that have their own price. */
type UsagePart = "input" | "cacheRead" | "cacheWrite" | "output";
/**
 * What a span shows, so the TUI can color it:
 * - `title` the big total, `heading` a section name, `text` names, `value` the numbers that
 *   matter, `muted` labels, notes, padding and the chart's baseline, `warning` the share of
 *   tokens without a price and a low cache hit, `good` a cache hit that is not low;
 * - `bar` the part of a daily chart column that no provider's models account for;
 * - `provider:<n>` the provider's place in `report.providers` (most cost first), on its list
 *   line, on its models and on its part of each chart column, so a provider keeps one color
 *   across the view;
 * - `part:<kind>` one part of the "by type" bar and its legend mark.
 */
export type UsageRole = "title" | "heading" | "text" | "value" | "muted" | "warning" | "good" | "bar" | `provider:${number}` | `part:${UsagePart}`;
/**
 * `back` colors the rest of a chart cell above its block: where one provider's part of a column
 * ends inside a cell, the block is that provider's and the space above it the next one's.
 */
type UsageSpan = {
    text: string;
    role: UsageRole;
    back?: UsageRole;
};
export type UsageLine = UsageSpan[];
/** The Usage tab's lines, with where its Breakdown heading and its model rows are. */
export type UsageViewLines = {
    lines: UsageLine[];
    /** The Breakdown heading's line; undefined without a breakdown. */
    breakdownAt?: number;
    /** Each model row's line, in `breakdownModels` order; none in the breakdown by day. */
    modelLines: number[];
};
/** A row's cost, or "no price" when all its tokens come from models without a price. */
export declare function costText(row: UsageRow): string;
/**
 * The days a report covers, like "Oct 7 – Oct 13", or one day like "Oct 13"; undefined for
 * "all" and "session", which have no time window.
 */
export declare function rangeDates(report: UsageReport): string | undefined;
/**
 * A provider's name in the usage view: OpenCode's name for that exact id (a report's
 * `providerNames`), like "GitHub Copilot" for "github-copilot"; else, for an id OpenCode
 * doesn't list, the plugin's label for it, else the id itself.
 */
export declare function usageProviderName(providerID: string, openCodeNames?: Record<string, string>): string;
/**
 * The models of the model breakdown, in its order: `usageView`'s `modelLines` are their rows.
 */
export declare function breakdownModels(report: UsageReport, mode: UsageMode): UsageModelRow[];
/**
 * The usage view for the TUI Usage tab: lines of role-tagged spans, each at most `width`, and
 * where the Breakdown heading and the model rows are among them.
 */
export declare function usageView(report: UsageReport, options: UsageViewOptions): UsageViewLines;
/** The model detail's first line: the provider's dot and the model's name, cut to `width`. */
export declare function modelDetailTitle(report: UsageReport, model: UsageModelRow, width: number): UsageLine;
/**
 * One model of the breakdown, as a detail panel: its name, provider and share, then
 * Cost, Tokens, cost per 1M tokens and cache hit (cache reads ÷ all input tokens), its daily
 * chart over the report's days, and cost by type and tokens by type, side by side when they
 * fit. Every line fits in `width`.
 */
export declare function modelDetailView(report: UsageReport, model: UsageModelRow, options: ModelDetailOptions): UsageLine[];
/**
 * The usage view as plain text for Web `/quota` and the CLI: a range title, no chart, the top
 * 10 breakdown rows, at most 64 columns.
 */
export declare function usageText(report: UsageReport, options: UsageTextOptions): string;
export {};
