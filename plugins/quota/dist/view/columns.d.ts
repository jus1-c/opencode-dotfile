/**
 * Terminal columns: how wide text shows in a terminal, and cutting or padding text to a width
 * without splitting a character. East Asian wide characters and emoji take two columns;
 * control, format and combining characters on their own take none.
 */
export declare function columnsOf(text: string): number;
/** The longest start of `text` that fits in `width` columns. */
export declare function sliceColumns(text: string, width: number): string;
/** `text` cut to `width` columns, ending in "…" when cut. */
export declare function truncateColumns(text: string, width: number): string;
/** `text` with spaces after it up to `width` columns (never cut). */
export declare function padEndColumns(text: string, width: number): string;
/** `text` with spaces before it up to `width` columns (never cut). */
export declare function padStartColumns(text: string, width: number): string;
