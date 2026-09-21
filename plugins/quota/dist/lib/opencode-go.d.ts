/**
 * OpenCode Go dashboard scraper.
 *
 * Fetches the OpenCode Go workspace page and parses usage data from two
 * possible formats:
 * 1. SolidJS SSR hydration output (`$R[\d+]={...usagePercent...resetInSec...}`)
 * 2. HTML with `data-slot` attributes (newer format)
 *
 * The scraper tries SolidJS SSR first, then falls back to data-slot parsing.
 */
import type { OpenCodeGoResult } from "./types.js";
interface ScrapedWindowUsage {
    usagePercent: number;
    resetInSec: number;
}
declare function parseWindowUsage(html: string, rePctFirst: RegExp, reResetFirst: RegExp): ScrapedWindowUsage | null;
/**
 * Parse the newer data-slot HTML format.
 * Returns a record of window names to their usage data.
 */
declare function parseDataSlotFormat(html: string): Partial<Record<string, ScrapedWindowUsage>>;
export declare function queryOpenCodeGoQuota(workspaceId: string, authCookie: string, options?: {
    requestTimeoutMs?: number;
}): Promise<OpenCodeGoResult>;
export { parseWindowUsage as _parseWindowUsage, parseDataSlotFormat as _parseDataSlotFormat };
//# sourceMappingURL=opencode-go.d.ts.map