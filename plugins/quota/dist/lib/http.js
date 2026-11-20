/**
 * HTTP for provider API calls: `requestJson` asks for one JSON reply within a timeout and a
 * size cap, and says why it got none, with the caller's own secrets redacted.
 */
import { RETRY_WAIT_MAX_MS } from "../core/errors.js";
import { secretValuesRedactor } from "../core/redact.js";
import { sanitizeDisplayText } from "./display-sanitize.js";
export const REQUEST_TIMEOUT_MS = 5000;
/** Thrown by `fetchWithTimeout` at the deadline; its message never holds the URL. */
class RequestTimeoutError extends Error {
}
function timeoutMessage(timeoutMs) {
    return `Request timeout after ${Math.round(timeoutMs / 1000)}s`;
}
/**
 * Fetch and consume a response within one timeout.
 *
 * The response consumer must complete all status handling, body reads, and parsing
 * before returning so the request signal remains active for the full transaction.
 *
 * @throws Error with message "Request timeout after Xs" if the transaction times out
 */
export async function fetchWithTimeout(url, options) {
    const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    let timedOut = false;
    const timeoutErrorMessage = timeoutMessage(timeoutMs);
    let timeoutId;
    const timeout = new Promise((_resolve, reject) => {
        timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(new RequestTimeoutError(timeoutErrorMessage));
        }, timeoutMs);
    });
    try {
        const transaction = (async () => {
            const fetchFn = options.fetchFn ?? globalThis.fetch;
            const response = await fetchFn(url, {
                ...options.request,
                signal: controller.signal,
            });
            return await options.consume(response, controller.signal);
        })();
        return await Promise.race([transaction, timeout]);
    }
    catch (err) {
        if (timedOut) {
            throw new RequestTimeoutError(timeoutErrorMessage);
        }
        throw err;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
/** Larger than any quota reply; a reply past it is not read further. */
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
class TooLargeError extends Error {
}
function failureCode(kind, status) {
    switch (kind) {
        case "http":
            return status === 401 ? "login_expired" : status === 429 ? "rate_limited" : "provider_error";
        case "timeout":
            return "timeout";
        case "network":
            return "network";
        case "too_large":
        case "invalid_json":
            return "bad_response";
    }
}
/**
 * A Retry-After header as a wait: delta-seconds or an HTTP date, at most `RETRY_WAIT_MAX_MS`;
 * none when absent, past or unreadable.
 */
export function parseRetryAfterMs(value, nowMs = Date.now()) {
    const trimmed = value?.trim();
    if (!trimmed)
        return undefined;
    const durationMs = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(trimmed)
        ? Number(trimmed) * 1_000
        : Date.parse(trimmed) - nowMs;
    return Number.isFinite(durationMs) && durationMs > 0
        ? Math.min(durationMs, RETRY_WAIT_MAX_MS)
        : undefined;
}
/**
 * The facts the error vocabulary keeps of a failure: its code, the HTTP status of a non-2xx
 * reply, and its Retry-After. `code` replaces the failure's own when the caller's words mean
 * another (a 3xx that means "sign in again").
 */
export function failureFacts(failure, code = failure.code) {
    return {
        code,
        ...(failure.kind === "http" && failure.status !== undefined ? { status: failure.status } : {}),
        ...(failure.retryAtMs !== undefined ? { retryAtMs: failure.retryAtMs } : {}),
    };
}
/** ": <words>" to end an "<api> error <status>" text; nothing when the reply had no words. */
export function errorWords(words) {
    return words.trim() ? `: ${words}` : "";
}
/** A failed request as a thrown error, for callers that throw; its facts stay with it. */
export class RequestFailedError extends Error {
    facts;
    constructor(message, facts) {
        super(message);
        this.facts = facts;
    }
}
/** The facts of a thrown request failure; none for any other error. */
export function thrownFacts(error) {
    return error instanceof RequestFailedError ? error.facts : undefined;
}
function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
/** The body as text; throws TooLargeError past `maxBytes`, declared or read. */
async function readBoundedText(response, maxBytes) {
    const tooLarge = new TooLargeError(`response exceeded ${maxBytes} bytes`);
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        await response.body?.cancel().catch(() => { });
        throw tooLarge;
    }
    if (!response.body)
        return "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let byteLength = 0;
    try {
        for (let next = await reader.read(); !next.done; next = await reader.read()) {
            byteLength += next.value.byteLength;
            if (byteLength > maxBytes) {
                await reader.cancel().catch(() => { });
                throw tooLarge;
            }
            text += decoder.decode(next.value, { stream: true });
        }
        return text + decoder.decode();
    }
    finally {
        reader.releaseLock();
    }
}
/**
 * One JSON request: the parsed 2xx reply, or why there is none. Never throws. A non-2xx reply is
 * always `http` with its status and Retry-After; its body is the detail only when it was read
 * (not too large, not stalled past the deadline). A 2xx reply whose body stalls past the
 * deadline is a `timeout` that still has its status and headers.
 */
export async function requestJson(url, options = {}) {
    const secrets = (options.secrets ?? []).filter((secret) => Boolean(secret));
    const redact = secretValuesRedactor(secrets);
    const clean = (text) => redact(sanitizeDisplayText(text));
    const fail = (failure) => {
        const retryAfterMs = failure.kind === "http"
            ? parseRetryAfterMs(failure.headers?.get("Retry-After") ?? null)
            : undefined;
        return {
            ok: false,
            failure: {
                ...failure,
                code: failureCode(failure.kind, failure.status),
                ...(retryAfterMs === undefined ? {} : { retryAtMs: Date.now() + retryAfterMs }),
            },
        };
    };
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    let reply;
    try {
        return await fetchWithTimeout(url, {
            request: {
                ...(options.method ? { method: options.method } : {}),
                ...(options.headers ? { headers: options.headers } : {}),
                ...(options.body !== undefined ? { body: options.body } : {}),
                ...(options.redirect ? { redirect: options.redirect } : {}),
            },
            timeoutMs: options.timeoutMs,
            consume: async (response) => {
                const received = { status: response.status, headers: response.headers };
                reply = { ok: response.ok, ...received };
                const text = await readBoundedText(response, maxBytes);
                if (!response.ok)
                    return fail({ kind: "http", ...received, detail: clean(text) });
                if (options.blankAsNull && text.trim() === "")
                    return { ok: true, ...received, json: null };
                try {
                    return { ok: true, ...received, json: JSON.parse(text) };
                }
                catch (error) {
                    return fail({ kind: "invalid_json", ...received, detail: clean(errorText(error)) });
                }
            },
        });
    }
    catch (error) {
        const received = reply ? { status: reply.status, headers: reply.headers } : {};
        if (reply && !reply.ok)
            return fail({ kind: "http", ...received, detail: "" });
        if (error instanceof TooLargeError) {
            return fail({ kind: "too_large", ...received, detail: error.message });
        }
        const kind = error instanceof RequestTimeoutError ? "timeout" : "network";
        return fail({ kind, ...received, detail: clean(errorText(error)) });
    }
}
//# sourceMappingURL=http.js.map