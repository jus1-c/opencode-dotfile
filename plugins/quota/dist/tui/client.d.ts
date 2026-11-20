import type { QuotaSnapshot } from "../core/types.js";
import { QuotaRpc, type QuotaRpcRefreshReason, type QuotaRpcSnapshotOutput } from "../rpc.js";
/** Without `location`, OpenCode runs the call in its server's own folder. */
export type QuotaRpcCallOptions = {
    location?: {
        directory: string;
    };
    signal: AbortSignal;
};
type Methods = (typeof QuotaRpc)["methods"];
/** The type a method's schema carries for TypeScript (`schema<T>` in `rpc.ts`). */
type Carried<Schema> = Schema extends {
    "~standard": {
        types?: infer Types;
    };
} ? NonNullable<Types> extends {
    output: infer T;
} ? T : never : never;
/** The quota RPC as OpenCode's TUI client offers it: every method of `QuotaRpc`, and its event. */
export type QuotaRpcClient = {
    [Name in keyof Methods]: (input: Carried<Methods[Name]["input"]>, options: QuotaRpcCallOptions) => Promise<Carried<Methods[Name]["output"]>>;
} & {
    events: {
        on(name: "changed", handler: (event: {
            location?: {
                directory: string;
            };
            data: QuotaRpcSnapshotOutput;
        }) => void, options?: {
            signal?: AbortSignal;
        }): () => void;
    };
};
/**
 * Where a quota RPC call goes: the TUI's folder. A GUI window (`../gui/`) has a folder only while
 * it shows a session, so it sets `locationOptional`.
 */
export type RpcLocationHost = {
    location?: {
        directory: string;
    };
    data: {
        location?: {
            default: () => {
                directory: string;
            };
        };
    };
    /** True when a call without a folder goes to the server's own folder instead of failing. */
    locationOptional?: boolean;
};
/** What the client needs from the TUI context (or a GUI window). */
export type ClientHost = RpcLocationHost & {
    client: {
        rpc: (definition: typeof QuotaRpc) => QuotaRpcClient;
    };
    /**
     * When set, a `changed` event is applied only if this answers true for the folder it came from.
     * The TUI and a GUI window hear the events of every folder of their server, so each keeps its
     * folder's only.
     */
    acceptsEventFrom?: (location: {
        directory: string;
    } | undefined) => boolean;
};
/**
 * The `acceptsEventFrom` of a TUI: only events from the folder its calls name, read when each
 * event arrives. An event that names no folder is dropped; the minute poll still updates.
 */
export declare function ownFolderEvents(host: RpcLocationHost): (location: {
    directory: string;
} | undefined) => boolean;
/**
 * Each call names the TUI's folder, so the server uses that folder's settings, and gives up
 * after a minute. The RPC client itself is made per call, never during setup.
 */
export declare function quotaCallOptions(host: RpcLocationHost): QuotaRpcCallOptions;
export type QuotaClient = {
    /** The current folder's latest snapshot with what is known about `sessionID`; undefined before its first answer. */
    snapshot(sessionID?: string): QuotaSnapshot | undefined;
    /** The Home notice line ("" when there is none). */
    homeLine(): string;
    /** A surface shows `sessionID`: load its part now and on every poll until the returned stop. */
    watch(sessionID?: string): () => void;
    /** Loads the Home notice line now and on every poll until the returned stop. */
    watchHome(): () => void;
    /** Asks the server to refresh; answers the new snapshot, or undefined when the call failed. */
    refresh(reason: QuotaRpcRefreshReason, sessionID?: string): Promise<QuotaSnapshot | undefined>;
    /**
     * Starts the minute poll and allows the `changed` subscription, made with the first call;
     * the returned function stops both and drops the answers to calls made before it.
     */
    start(): () => void;
};
/** RPC calls reject with a plain `{ type, message }` object, not an Error. */
export declare function rpcErrorMessage(error: unknown): string;
/** The toast for a failed call: its reason, cleaned for the terminal. */
export declare function errorToast(error: unknown, title?: string): {
    readonly variant: "error";
    readonly title: string;
    readonly message: string;
};
export declare function reportFailure(error: unknown): void;
/**
 * @param onSnapshot called with every snapshot the client takes (from any call or event), so
 *   toasts can announce new reset notices.
 * @param onFailure called when a `snapshot` or `refresh` call made since the last `start()`
 *   fails, so a GUI window can say why it shows nothing or an older snapshot. A call made
 *   through an earlier `host.client` (a server since restarted) reports nothing here.
 */
export declare function createQuotaClient(host: ClientHost, onSnapshot?: (snapshot: QuotaSnapshot) => void, onFailure?: (error: unknown) => void): QuotaClient;
export {};
