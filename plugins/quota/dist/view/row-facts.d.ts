import type { Words } from "../core/types.js";
import { type Level } from "./format.js";
import type { Group, VisibleRow } from "./select.js";
export type Place = {
    words: Words;
    nowMs: number;
    /**
     * "words" (sidebar, collapsed sidebar, status line, toasts, /quota text): your name; else, with
     * `words.rowNames` "short", its window's short name ("5h", "7d") when no other row of its group
     * has the same one; else its label. "label" (Limits, the Settings tree, Web and terminal
     * text): your name, else its label.
     */
    names: "words" | "label";
    /**
     * "number": "58%", the place says the word elsewhere. "words": "58% left", "42% used", or
     * "58%" in the bare style. "usedWord": "58%", but "42% used", which bare would read as left.
     */
    percent: "number" | "words" | "usedWord";
    /** Exact Codex count without the repeated unit on compact surfaces. */
    codexCredits?: "compact";
    /** Reset and pace times in this style, whatever the words (Limits: always "exact"). */
    times?: Words["reset"];
    /** The place draws the even-use mark, so its facts have `evenLeft`. */
    evenUse?: boolean;
    /**
     * The pace words it shows, none without: "runsOut" only "runs out in 2h" (before the reset),
     * "fast" also "faster than it refills", "all" also "plenty to spare" and "on track".
     */
    pace?: "runsOut" | "fast" | "all";
};
export type RowFacts = {
    id: string;
    name: string;
    /** Its percent left as the row has it, for bars and level colors; undefined without one. */
    percent?: number;
    /** Its level by pace, for the bar colors when they follow pace; undefined without a pace. */
    paceLevel?: Level;
    /** Its percent in the place's style, or the value of a row without one ("$1,240.50 left"). */
    value: string;
    /**
     * The time until it resets in the place's style ("2h 14m", "3.2d"); "" without a percent. The
     * "percent" style starts it with the window's time share, written right after the percent
     * ("/91% 4d", see `afterPercent`).
     */
    reset: string;
    /** The same in the short style ("2h", "4d 12h"), for a place short of room. */
    shortReset: string;
    /**
     * Two amounts a row reports, such as a balance and the limit it is measured against
     * ("40,000 / 100,000 ₫"). A place shows it after the percent, never in the reset column: a
     * long pair would widen that column and squeeze every row's bar.
     */
    amountPair?: string;
    /** Where even use would be (the percent it would leave now), when the place draws the mark. */
    evenLeft?: number;
    /** The pace words the place shows; `fast` when the row is used faster than it refills. */
    pace?: {
        words: string;
        fast: boolean;
    };
};
/** Whether `reset` starts with the time share, so it goes right after the percent. */
export declare function joinsPercent(reset: string): boolean;
/**
 * `reset` after a percent with `gap` between them; with no gap before the time share, which
 * reads as one with the percent ("58%/91% 4d"). "" without a reset.
 */
export declare function afterPercent(reset: string, gap: string): string;
/** `reset` where no percent comes right before it: the time share without its "/" ("91% 4d"). */
export declare function resetAlone(reset: string): string;
/** `item`, one of `group`'s rows, as `place` shows it. */
export declare function rowFacts(item: VisibleRow, group: Pick<Group, "rows">, place: Place): RowFacts;
/** The words for a group's last error ("Sign in again"); undefined when its last check worked. */
export declare function errorWords(group: Pick<Group, "error" | "name">, nowMs: number): string | undefined;
/** Retained credit balances stay visible alongside a failed refresh warning. */
export declare function retainedStatusBalance(row: Pick<RowFacts, "id" | "value"> | undefined, error: string | undefined): string | undefined;
