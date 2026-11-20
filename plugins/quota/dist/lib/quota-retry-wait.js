/** Extra wait after the reset time, so the provider has reset the window when the retry runs. */
export const QUOTA_RESET_RETRY_BUFFER_MS = 60_000;
/** Longest single wait. If the window is still used up, the next retry waits again. */
export const QUOTA_RESET_RETRY_MAX_DELAY_MS = 5 * 60 * 60 * 1000;
/** OpenCode's error types for a provider rate limit or used-up quota, or any HTTP 429. */
export function isQuotaLimitError(error) {
    return (error.type === "provider.rate-limit" || error.type === "provider.quota" || error.status === 429);
}
/**
 * Milliseconds until the earliest reset among used-up (0% left) windows, plus the buffer, at
 * most the cap. Undefined when no used-up window has a reset time still ahead.
 */
export function getQuotaResetRetryDelayMs(rows, nowMs) {
    let earliestResetMs;
    for (const row of rows) {
        if (row.percentRemaining === undefined || !(row.percentRemaining <= 0) || !row.resetsAt) {
            continue;
        }
        const resetMs = Date.parse(row.resetsAt);
        if (!(resetMs > nowMs))
            continue;
        if (earliestResetMs === undefined || resetMs < earliestResetMs)
            earliestResetMs = resetMs;
    }
    if (earliestResetMs === undefined)
        return undefined;
    return Math.min(earliestResetMs - nowMs + QUOTA_RESET_RETRY_BUFFER_MS, QUOTA_RESET_RETRY_MAX_DELAY_MS);
}
/**
 * The provider's rows that serve the snapshot's model: a provider whose rows serve different
 * models (the custom providers) has only those under its `currentModelRowPrefixes`.
 */
function modelRows(snapshot, provider) {
    const prefixes = snapshot.currentModelRowPrefixes?.[provider.providerId];
    if (prefixes === undefined)
        return provider.rows;
    return provider.rows.filter((row) => prefixes.some((prefix) => row.id.startsWith(prefix)));
}
/**
 * The retry delay for a limit error on `event.model`, or undefined to keep OpenCode's decision.
 * The store asks the providers serving the model again at once (a retry refresh skips the minimum
 * interval, except a provider's own `minIntervalMs`), and its answer names them and the rows that
 * serve the model:
 * the limit error itself shows the quota changed, so only rows read for this retry count. A
 * provider with an error counts not at all: the rows it kept for a failed login are old.
 */
export async function resolveQuotaResetRetryDelayMs(host, event) {
    if (!isQuotaLimitError(event.error))
        return undefined;
    const settings = await host.loadSettings();
    if (!settings.waitForQuotaReset)
        return undefined;
    const startedAtMs = Date.now();
    const snapshot = await host.store.refresh({
        reason: "retry",
        model: event.model,
        onlyModelProviders: true,
    });
    const servingIds = snapshot.currentModelProviderIds ?? [];
    const freshRows = snapshot.providers
        .filter((provider) => servingIds.includes(provider.providerId) &&
        (provider.okAtMs ?? 0) >= startedAtMs &&
        provider.error === undefined)
        .flatMap((provider) => modelRows(snapshot, provider));
    return getQuotaResetRetryDelayMs(freshRows, Date.now());
}
//# sourceMappingURL=quota-retry-wait.js.map