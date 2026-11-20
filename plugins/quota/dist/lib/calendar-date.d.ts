/**
 * The one rule for a date a client sends (the usage report's "between" range), shared by the
 * RPC input check and the report itself: "YYYY-MM-DD" naming a real calendar day. So
 * 2026-02-31 and 2026-02-29 are not dates, and 2028-02-29 is.
 */
type CalendarDate = {
    year: number;
    month: number;
    day: number;
};
export declare function daysInMonth(year: number, month: number): number;
/** The day `text` names, or null when it is not a real "YYYY-MM-DD" day. */
export declare function parseCalendarDate(text: unknown): CalendarDate | null;
export {};
