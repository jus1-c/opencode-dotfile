/**
 * HTTP for provider API calls: `requestJson` asks for one JSON reply within a timeout and a
 * size cap, and says why it got none, with the caller's own secrets redacted.
 */
import { type ErrorFacts } from "../core/errors.js";
import type { QuotaErrorCode } from "../core/types.js";
export declare const REQUEST_TIMEOUT_MS = 5000;
type FetchWithTimeoutOptions<T> = {
    request: Omit<RequestInit, "signal">;
    timeoutMs?: number;
    fetchFn?: typeof fetch;
    consume: (response: Response, timeoutSignal: AbortSignal) => Promise<T> | T;
};
/**
 * Fetch and consume a response within one timeout.
 *
 * The response consumer must complete all status handling, body reads, and parsing
 * before returning so the request signal remains active for the full transaction.
 *
 * @throws Error with message "Request timeout after Xs" if the transaction times out
 */
export declare function fetchWithTimeout<T>(url: string, options: FetchWithTimeoutOptions<T>): Promise<T>;
/**
 * Why a request gave no JSON. `http`: a reply that is not 2xx (a redirect too, with
 * `redirect: "manual"`), whatever happened to its body; `timeout`; `network`: no reply;
 * `too_large`: a 2xx reply over `maxBytes`; `invalid_json`: a 2xx reply that is not JSON.
 */
export type RequestFailure = {
    kind: "http" | "timeout" | "network" | "too_large" | "invalid_json";
    /**
     * The error code: 401 is `login_expired`, 429 `rate_limited`, any other non-2xx
     * `provider_error`; `timeout`; `network`; a reply too large or not JSON `bad_response`.
     */
    code: QuotaErrorCode;
    /** When a non-2xx reply's Retry-After says to try again. */
    retryAtMs?: number;
    /** The reply's status and headers, whenever a reply arrived. */
    status?: number;
    headers?: Headers;
    /**
     * For `http`, the reply body (empty when it could not be read); else the error message.
     * Control characters removed and the caller's secrets replaced by "[redacted]"; not cut.
     */
    detail: string;
};
export type JsonReply = {
    ok: true;
    status: number;
    headers: Headers;
    json: unknown;
} | {
    ok: false;
    failure: RequestFailure;
};
type RequestJsonOptions = {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string | URLSearchParams;
    redirect?: RequestInit["redirect"];
    /** Values never shown in `detail`: the key, token or cookie the request carries. */
    secrets?: ReadonlyArray<string | undefined>;
    timeoutMs?: number;
    maxBytes?: number;
    /** An empty or blank 2xx body reads as JSON null instead of `invalid_json`. */
    blankAsNull?: boolean;
};
/**
 * A Retry-After header as a wait: delta-seconds or an HTTP date, at most `RETRY_WAIT_MAX_MS`;
 * none when absent, past or unreadable.
 */
export declare function parseRetryAfterMs(value: string | null, nowMs?: number): number | undefined;
/**
 * The facts the error vocabulary keeps of a failure: its code, the HTTP status of a non-2xx
 * reply, and its Retry-After. `code` replaces the failure's own when the caller's words mean
 * another (a 3xx that means "sign in again").
 */
export declare function failureFacts(failure: RequestFailure, code?: QuotaErrorCode): ErrorFacts;
/** ": <words>" to end an "<api> error <status>" text; nothing when the reply had no words. */
export declare function errorWords(words: string): string;
/** A failed request as a thrown error, for callers that throw; its facts stay with it. */
export declare class RequestFailedError extends Error {
    readonly facts: ErrorFacts;
    constructor(message: string, facts: ErrorFacts);
}
/** The facts of a thrown request failure; none for any other error. */
export declare function thrownFacts(error: unknown): ErrorFacts | undefined;
/**
 * One JSON request: the parsed 2xx reply, or why there is none. Never throws. A non-2xx reply is
 * always `http` with its status and Retry-After; its body is the detail only when it was read
 * (not too large, not stalled past the deadline). A 2xx reply whose body stalls past the
 * deadline is a `timeout` that still has its status and headers.
 */
export declare function requestJson(url: string, options?: RequestJsonOptions): Promise<JsonReply>;
export {};
