import type { QuotaExportProvider } from "../lib/quota-export-types.js";
import type { DebugDetail, ProviderSnapshot, QuotaError, QuotaRow, QuotaSnapshot, SessionModel } from "./types.js";
export type ProviderFetch = {
    rows: QuotaRow[];
    /**
     * The login each row came from, in the order of `rows`; omitted for one login. An opaque id
     * keyed with the identity key (`keyedLogins`), never a source id such as an email.
     */
    rowLogins?: string[];
    error?: QuotaError;
    /** The provider answered that it has nothing to show: the rows are cleared, with no error. */
    empty?: true;
    debug: DebugDetail[];
    /** Writes this check's part of the export file from its rows as shown and its error. */
    buildExportPart?: (check: CheckForExport) => QuotaExportProvider;
};
/** One check as the store records it: its rows as shown, its error, and when it was. */
export type CheckForExport = {
    rows: QuotaRow[];
    error?: QuotaError;
    checkedAtMs: number;
};
export type ProviderIdentity = {
    /** Changes whenever the rows would differ: another account or other provider settings. */
    key: string;
    /**
     * False when the account can't be told apart safely, or only until a reload (its key is held
     * in memory): rows stay in memory only.
     */
    persist: boolean;
};
export type StoreProvider = {
    id: string;
    /** Independent check slot for definitions sharing the same display provider id. */
    key?: string;
    /** Registration label, for example "Anthropic". */
    label: string;
    /** Overrides the source's minimum, including turns (0 for providers reading local data). */
    minIntervalMs?: number;
    identity: () => Promise<ProviderIdentity>;
    fetch: () => Promise<ProviderFetch>;
    /** Rebuilds export metadata from a saved check without fetching or recording a new check. */
    restoreExportPart?: (snapshot: ProviderSnapshot) => QuotaExportProvider;
};
/** The providers to show and refresh now (enabled and available, in registration order). */
export type StoreSource = {
    /** Credential sources selected by the runtime, including providers with no available login. */
    scope?: string;
    providers: StoreProvider[];
    minIntervalMs: number;
    /** The providers serving a session's model, from the same settings read as `providers`. */
    providerIdsForModel?: (model: SessionModel) => string[];
    /** By provider id, the row id prefixes serving a session's model (`currentModelRowPrefixes`). */
    rowPrefixesForModel?: (model: SessionModel) => Record<string, string[]>;
};
type RefreshReason = "poll" | "turn" | "manual" | "retry";
/**
 * With a model, the snapshot also names the providers serving it. `refresh: false` answers the
 * saved rows without asking any provider, also for the due ones.
 */
type SnapshotOptions = {
    model?: SessionModel;
    sessionID?: string;
    refresh?: boolean;
};
type RefreshOptions = {
    model?: SessionModel;
    sessionID?: string;
    reason: RefreshReason;
    providerIds?: readonly string[];
    /** Refreshes only the providers serving `model` (the snapshot's `currentModelProviderIds`). */
    onlyModelProviders?: boolean;
};
type QuotaStoreDeps = {
    source: (model?: SessionModel) => Promise<StoreSource>;
    /** Reads a session's current model, including for background refreshes. */
    sessionModel?: (sessionID: string) => Promise<SessionModel>;
    /** The snapshot file; null keeps everything in memory. */
    file: string | null;
    now?: () => number;
    log?: (message: string) => void;
    /** Time limits for reading providers and logins, and for one fetch (tests shorten them). */
    timeouts?: {
        readMs: number;
        fetchMs: number;
    };
};
export type QuotaStore = {
    snapshot(options?: SnapshotOptions): Promise<QuotaSnapshot>;
    /** Refreshes the due providers (all, or `providerIds`) and answers when they are done. */
    refresh(options: RefreshOptions): Promise<QuotaSnapshot>;
    subscribe(listener: (snapshot: QuotaSnapshot) => void): () => void;
    /** A login changed: identities are resolved again and memory-only rows are dropped. */
    invalidateIdentity(): void;
    /**
     * The settings changed: running work is superseded and the providers are read again. With
     * `recheck` (another time limit, interval or price list), every provider's backoff is cleared
     * and each one is checked again at once.
     */
    settingsChanged(options: {
        recheck: boolean;
    }): void;
    /** A tracked session selected another model: resolve its scope and refresh due providers. */
    sessionModelChanged(sessionID: string): void;
    /** Refuses new work and waits for running operations and the last file write. */
    dispose(): Promise<void>;
};
/** `promise`, or a rejection with `message` once `ms` have passed. */
export declare function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T>;
export declare function createQuotaStore(deps: QuotaStoreDeps): QuotaStore;
export {};
