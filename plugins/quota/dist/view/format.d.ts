/**
 * Words and numbers every quota and usage surface shows: percents, reset times, bars, amounts,
 * money, token and request counts and shares. Pure functions, shared by the TUI, the Web text and
 * the CLI. Money, token counts, request counts and shares are written the way a billing dashboard
 * writes them, always in US English, so the text is the same on every machine.
 */
import type { Pace } from "../core/pace.js";
import type { Amount, QuotaRow, SessionTokens, Words } from "../core/types.js";
import type { Settings } from "../settings/schema.js";
/** "$1,234.56", "$0.00", and "<$0.01" for an amount above 0 that would show as $0.00. */
export declare function formatUsd(usd: number): string;
/** Whole below 1,000, then always three significant digits: "950", "12.3K", "8.00M", "13.4B". */
export declare function formatTokens(count: number): string;
/** A request count shown exactly, with grouped digits rather than token-style compact notation. */
export declare function formatCount(count: number): string;
/** A 0..1 share with one decimal: "92.5%", "5.0%", "100.0%"; "<0.1%" above 0; "0%" for 0. */
export declare function formatShare(share: number): string;
/** The words until the server sends its own (docs/v6-build.local.md §5). */
export declare const DEFAULT_WORDS: Words;
/** The word after a percent ("left", "used", or "" for the bare style). */
export declare function percentWord(words: Words): string;
/**
 * The share every surface shows: the percent left as the row has it, or the percent used when
 * `words.percent` is "used". Bars, marks and percents read it, so the number and the bar agree.
 */
export declare function shownPercent(words: Words, percentRemaining: number): number;
/**
 * Where a row's even-use mark sits on its bar, in percent from the left: as the row has it, or
 * turned around when `words.percent` is "used", so the mark reads like the bar's fill.
 */
export declare function shownEvenLeft(words: Words, evenLeft: number): number;
/** "58% left", "42% used", or "58%" without the word. */
export declare function percentText(words: Words, percentRemaining: number, withWord: boolean): string;
/** The reset styles that are a time alone: every one but "percent", which adds the window's time share. */
export type DurationStyle = Exclude<Words["reset"], "percent">;
/**
 * docs/v6-plan.local.md §4.7. Zero units are dropped in every style; the past is "now".
 * "smart" rounds to the nearest: a day or more in days with one decimal ("4.5d"), from 12 hours
 * in whole hours ("23h"), below that like "exact" ("11h 35m"). A time that rounds to 24 hours
 * is "1.0d".
 */
export declare function formatDuration(ms: number, style: DurationStyle, decimals: number): string;
/**
 * How old a provider's rows are, from `okAtMs` (its last good check), for the Limits tabs, where
 * you can refresh: "checked just now" under a minute (and for a time ahead of `nowMs`), else
 * "checked 4 min ago", "checked 2 h ago", "checked 3 d ago", rounded down. Undefined before
 * the provider's first good check.
 */
export declare function checkedAgoText(okAtMs: number | undefined, nowMs: number): string | undefined;
/** A time in its largest unit ("28d", "2h", "40m"); "now" for the past. The "percent" reset style uses it. */
export declare function largestUnit(ms: number): string;
export type BarShape = Settings["layout"]["bar"];
/** A bar in two parts (filled, empty), so each can have its own color; `percentRemaining` is the share the bar shows. */
export declare function barParts(shape: BarShape, percentRemaining: number, width: number): [string, string];
/**
 * The cell of a bar `width` cells wide where even use would be (the ┃ even-use mark): `evenLeft` is the
 * percent even use leaves now (`core/pace.ts`).
 */
export declare function evenUseCell(evenLeft: number, width: number): number;
export type Level = "good" | "warning" | "low";
export type Thresholds = {
    warningBelow: number;
    lowBelow: number;
};
/** Plenty left, getting low, or almost out; "almost out" wins where both would. */
export declare function levelOf(percentRemaining: number, thresholds: Thresholds): Level;
/**
 * The level for a pace: "good" at or under even use, "warning" up to 5 points faster, "low"
 * faster than that. At a window's start even use leaves about 100%, so an untouched limit is
 * on track; it reads as good, not as a warning. Before a tenth of the window has passed, one
 * burst of use reads as fast, so a fast pace gives no level and the row keeps the share-left
 * colors: a nearly used-up limit is still "low" then.
 */
export declare function paceLevel(pace: Pace, percentRemaining: number): Level | undefined;
/**
 * The level a row's bar shows: with `levelBy` "pace", its level by pace when it has one; else
 * the level of its percent left.
 */
export declare function barLevel(colors: Thresholds & {
    levelBy: Settings["colors"]["levelBy"];
}, percentRemaining: number, paceLevel?: Level): Level;
/**
 * "$12.40", "12.40 EUR", "1 request", "1,200 requests", "30 nano". A count unit is one word
 * ("request"); it is plural for every number but 1, and the plain "unit" is not shown.
 */
export declare function amountText(amount: Amount): string;
/**
 * Two amounts of the same unit as one pair, the unit written once: "40,000 / 100,000 ₫".
 * Amounts of different units, or one written before its number, keep both: "$1.20 / 3.00 EUR".
 */
export declare function amountPairText(left: Amount, right: Amount): string;
/** The value of a row without a percent: its text, amount, used/limit, or yes/no. */
export declare function rowValueText(row: QuotaRow): string;
/** "12.3K (1.20K) in · 2.10K out", with cached input only when it is non-zero. */
export declare function sessionTokensText(tokens: SessionTokens): string;
export declare const LOW_CACHE_MARK = "\u26A0";
/** A model's input tokens by kind: new input, cache reads and cache writes. */
export type InputTokens = {
    input: number;
    cacheRead: number;
    cacheWrite: number;
};
/** The share of a model's input tokens read from the cache. */
export type CacheHit = {
    /** Cache reads ÷ all input tokens. */
    share: number;
    /** Whole percents, rounded down so a low cache hit never reads "50%": "35%". */
    text: string;
    /** At least 200K input tokens: enough to tell a good cache hit from a low one. */
    judged: boolean;
    /** Judged, and less than half of the input tokens read from the cache. */
    low: boolean;
};
/**
 * The cache hit of `tokens`; undefined without input tokens, or without cache reads and cache
 * writes (the provider reports no cache numbers).
 */
export declare function cacheHit(tokens: InputTokens): CacheHit | undefined;
/**
 * `text` cut to `width` terminal columns with "…" ("Copilot…", not "Copilot …"), else padded
 * to it. Wide characters count two columns and are never split.
 */
export declare function fit(text: string, width: number): string;
