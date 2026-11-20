import type { QuotaError, QuotaErrorCode } from "./types.js";
export declare function isQuotaErrorCode(code: unknown): code is QuotaErrorCode;
/** An HTTP status as shown: a whole number from 100 to 599. */
export declare function httpStatus(status: unknown): number | undefined;
/** An error's code and HTTP status, "provider_error, http 503": never its message's words. */
export declare function errorKind(error: QuotaError): string;
/** Local programs named in provider messages, longest names first. */
export declare const LOCAL_TOOLS: readonly string[];
export declare function classifyError(message: string, nowMs?: number): QuotaError;
export type ErrorFacts = Pick<QuotaError, "code" | "status" | "retryAtMs">;
/** The latest retry time a provider's reply may set: a daily quota resets within it. */
export declare const RETRY_WAIT_MAX_MS: number;
/**
 * A provider's failure: its own facts when its request gave them, else read from its words.
 * When the facts only say `provider_error`, words that name a rate limit, a missing plan, an
 * expired login or a timeout win; the status and retry time stay.
 */
export declare function providerError(message: string, facts: ErrorFacts | undefined, nowMs?: number): QuotaError;
/** The short words every surface shows for an error, for example "Sign in again". */
export declare function describeError(error: QuotaError, providerLabel: string, nowMs: number): string;
