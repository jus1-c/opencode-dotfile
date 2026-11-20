/**
 * `waitForQuotaReset` (on by default): when a model request hits a provider limit and the quota data
 * shows a used-up window for that model's provider, OpenCode retries once that window resets
 * instead of following its normal retry timing.
 */
import type { ServerSettings } from "../core/provider-source.js";
import type { QuotaStore } from "../core/store.js";
import type { QuotaRow } from "../core/types.js";
/** Extra wait after the reset time, so the provider has reset the window when the retry runs. */
export declare const QUOTA_RESET_RETRY_BUFFER_MS = 60000;
/** Longest single wait. If the window is still used up, the next retry waits again. */
export declare const QUOTA_RESET_RETRY_MAX_DELAY_MS: number;
/** The parts of OpenCode's retry event this feature reads. */
export type QuotaRetryEvent = {
    readonly model: {
        readonly id: string;
        readonly providerID: string;
    };
    readonly error: {
        readonly type: string;
        readonly status?: number;
    };
};
/** Where the retry decision reads quota and settings from. */
type QuotaRetryHost = {
    store: Pick<QuotaStore, "refresh">;
    loadSettings: () => Promise<Pick<ServerSettings, "waitForQuotaReset">>;
};
/** OpenCode's error types for a provider rate limit or used-up quota, or any HTTP 429. */
export declare function isQuotaLimitError(error: QuotaRetryEvent["error"]): boolean;
/**
 * Milliseconds until the earliest reset among used-up (0% left) windows, plus the buffer, at
 * most the cap. Undefined when no used-up window has a reset time still ahead.
 */
export declare function getQuotaResetRetryDelayMs(rows: readonly QuotaRow[], nowMs: number): number | undefined;
/**
 * The retry delay for a limit error on `event.model`, or undefined to keep OpenCode's decision.
 * The store asks the providers serving the model again at once (a retry refresh skips the minimum
 * interval, except a provider's own `minIntervalMs`), and its answer names them and the rows that
 * serve the model:
 * the limit error itself shows the quota changed, so only rows read for this retry count. A
 * provider with an error counts not at all: the rows it kept for a failed login are old.
 */
export declare function resolveQuotaResetRetryDelayMs(host: QuotaRetryHost, event: QuotaRetryEvent): Promise<number | undefined>;
export {};
