import type { QuotaError, QuotaRow, ResetNotice } from "./types.js";
/** The snapshot file the server and the terminal command share. */
export declare function snapshotFilePath(): string;
/**
 * A row and the login it came from: a hash of the provider's source id, "" when the provider
 * has one login. The row's account is the login's own name, before the store numbers logins.
 */
export type LoginRow = {
    login: string;
    row: QuotaRow;
};
/** What the file keeps per provider and account, keyed `${providerId}|${identity hash}`. */
export type SavedEntry = {
    providerId: string;
    rows: LoginRow[];
    okAtMs?: number;
    checkedAtMs?: number;
    error?: QuotaError;
    /** Failed attempts in a row; drives the error backoff. */
    failures: number;
    /** Windows of this account that reset recently; they belong to it like its rows. */
    notices: ResetNotice[];
    /** Per row (see `rowSlot`): when its current reset time was first seen. */
    resetSeenAtMs: Record<string, number>;
};
/** When a provider was last checked, its failures in a row and the retry time it asked for. */
export type LastCheck = {
    checkedAtMs: number;
    failures: number;
    retryAtMs?: number;
};
export type SavedState = {
    entries: Map<string, SavedEntry>;
    /**
     * By provider id, the last check of a login that can't be saved (its rows stay in memory), so
     * a restarted store waits it out too. Nothing in it tells whose login it was.
     */
    lastChecks: Map<string, LastCheck>;
};
/** One row's slot: rows of two checks match by id, account and login. */
export declare function rowSlot({ login, row }: LoginRow): string;
/** What the file holds now; empty when it is missing or does not parse. */
export declare function readSavedState(file: string): Promise<SavedState>;
export declare function joinNotices(first: readonly ResetNotice[], second: readonly ResetNotice[]): ResetNotice[];
/**
 * Merges `state` into the file (per entry and per last check the newer check wins; notices are
 * joined by id), drops entries and last checks older than a week, saved last checks dated after
 * now and notices older than `noticeMaxAgeMs`, writes it atomically (owner-only), and returns
 * the merged state. It holds the file's lock throughout and reads `now` under it; when another
 * process keeps the lock 2 s, it writes nothing and rejects.
 */
export declare function writeSavedState(file: string, state: SavedState, options: {
    now: () => number;
    noticeMaxAgeMs: number;
}): Promise<SavedState>;
