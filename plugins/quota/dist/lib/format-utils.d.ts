/** Small text helpers for the providers: percents and dollar amounts. */
/**
 * Clamp a value to a percentage [0..100], rounding to the nearest integer.
 * Returns 0 for non-finite inputs.
 */
export declare function clampPercent(n: number): number;
/** A dollar amount with two decimals ("$12.50"); "$0.00" for a non-finite number. */
export declare function fmtUsdAmount(n: number): string;
