import type { DebugDetail } from "../core/types.js";
import { inspectCursorAuthPresence } from "../lib/cursor-detection.js";
import type { QuotaProvider } from "../lib/entries.js";
/** Where Cursor's login was looked for, and its state; never its contents. */
export declare function cursorAuthDetails(auth: Awaited<ReturnType<typeof inspectCursorAuthPresence>>): DebugDetail[];
export declare const cursorProvider: QuotaProvider;
