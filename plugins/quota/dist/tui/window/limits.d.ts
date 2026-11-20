/**
 * The lines of the quota window's Limits tab: every provider and row of the snapshot, in the
 * sidebar's order, under your names for the rows, else their full names. Pure. Its times are
 * always exact ("2h 30m"), whatever the reset words.
 *
 * All rows share one grid: label │ bar │ percent │ reset │ pace, each column as wide as its
 * widest entry, the percent right-aligned. The bar has your bar shape (the thin ━─ line when bars
 * are off) with the even-use marker ┃ (`core/pace.ts`) when `layout.evenUse` is on, and takes the room the other columns
 * leave, so the grid always spans the window. A provider's line has its name, its plan and how
 * long ago its rows were checked (the tab checks again each time it shows); an error gets its
 * own line under it. Like the window's other tabs, a provider's line starts one column in, its
 * rows and its error three.
 *
 * A narrower window first shortens "resets in 2h 30m" to "2h", then the labels, and then puts
 * the reset and the pace on a line under the bar (on two lines when they don't fit together).
 */
import type { QuotaSnapshot, Words } from "../../core/types.js";
import { type RowSettings } from "../../view/select.js";
import { type Layout, type Line } from "../../view/text.js";
export type LimitsInput = {
    snapshot: QuotaSnapshot;
    /** The display settings: row names, the sidebar's order, the bar shape and the words. */
    display: RowSettings & {
        layout: Pick<Layout, "bar" | "evenUse">;
        words: Words;
    };
    nowMs: number;
    /** Columns inside the window. */
    width: number;
};
export declare function limitsLines(input: LimitsInput): Line[];
