/**
 * The one table of quota windows: labels, nominal length, whether the window resets on a
 * schedule, and the classifier that reads a window from a legacy label such as "5h:".
 */
import type { QuotaWindow } from "./types.js";
type WindowInfo = {
    label: string;
    short: string;
    /** Fixed length, when the window has one (months and years do not). */
    lengthMs?: number;
    /** True when the window refills at a reset time, so a reset notice makes sense. */
    resets: boolean;
};
export declare const WINDOWS: Readonly<Record<QuotaWindow, WindowInfo>>;
/**
 * The key of `collapsed.window` and `statusLine.window` that picks the window of every provider
 * without a pick of its own.
 */
export declare const ALL_PROVIDERS = "*";
export declare function isQuotaWindow(value: unknown): value is QuotaWindow;
/** The window a label names, for example "5h:" → five_hour, "Weekly" → week. */
export declare function classifyWindow(text: string): QuotaWindow | undefined;
export {};
