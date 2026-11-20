/**
 * The pace of a quota window: how much would be left now if the limit were used evenly until
 * it resets (the ┃ even-use mark), and whether it runs out before then. Pure.
 */
import type { QuotaRow } from "./types.js";
export type Pace = {
    /** The percent that would be left now with even use: the share of the window still to come. */
    evenLeft: number;
    kind: "spare" | "on_track" | "fast";
    /** Only for "fast": less than a tenth of the window has passed, too early for a run-out time. */
    early?: true;
    /** Only for "fast": when it runs out at the pace so far (always before the reset). */
    runsOutInMs?: number;
};
/** The pace of a row with a percent and a known window; undefined for every other row. */
export declare function paceOf(row: QuotaRow, nowMs: number): Pace | undefined;
