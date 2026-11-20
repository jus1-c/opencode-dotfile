import type { DebugDetail, QuotaRow } from "./types.js";
/** Longest label or account, in code points. Custom provider names and labels use it too. */
export declare const LABEL_MAX_CODE_POINTS = 80;
export declare function isIsoTime(value: unknown): value is string;
/** A text's length in Unicode code points, the way every row text limit counts. */
export declare function codePointLength(text: string): number;
/** Keeps every valid row (as a clean copy) and notes each dropped one. */
export declare function validateRows(providerId: string, candidates: readonly unknown[]): {
    rows: QuotaRow[];
    dropped: DebugDetail[];
};
