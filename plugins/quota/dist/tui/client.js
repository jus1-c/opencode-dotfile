/**
 * The TUI's quota data: each folder's last snapshot, kept in Solid signals so every surface
 * redraws when it changes. It asks the server over the quota RPC (`snapshot` when a surface
 * shows, `refresh` after a turn), applies every `changed` event, and asks again every minute
 * in case an event was missed. Nothing reaches OpenCode until a surface shows or a turn ends.
 *
 * Answers can arrive out of order. The newest snapshot per credential source wins; a snapshot
 * from a new `serverId` for the same folder always wins, as its revisions start over, and from
 * then on that folder's old server is ignored. Each folder keeps its own server and snapshots
 * when global tabs switch between folders. A session's model follows its newest revision;
 * its token totals come from the latest call about it.
 *
 * Every TUI on a shared background service hears the `changed` events of every folder, and each
 * folder's server plugin has its own `serverId`. A TUI takes only the events of its current
 * folder (`ownFolderEvents`). Calls keep the folder they named, even if a tab switches before
 * the answer arrives; events name the folder they update.
 */
import { createSignal } from "solid-js";
import { sanitizeDisplayText } from "../lib/display-sanitize.js";
import { QuotaRpc, } from "../rpc.js";
const POLL_INTERVAL_MS = 60_000;
const RPC_TIMEOUT_MS = 60_000;
/** Expire old sessions outside the most recently read unwatched sessions; always keep watched ones. */
const SESSION_VIEW_KEEP_MS = 5 * 60_000;
const SESSION_VIEW_KEEP_COUNT = 20;
function hostLocation(host) {
    return host.location ?? host.data.location?.default();
}
/**
 * The `acceptsEventFrom` of a TUI: only events from the folder its calls name, read when each
 * event arrives. An event that names no folder is dropped; the minute poll still updates.
 */
export function ownFolderEvents(host) {
    return (location) => {
        const own = hostLocation(host);
        return own !== undefined && location?.directory === own.directory;
    };
}
/**
 * Each call names the TUI's folder, so the server uses that folder's settings, and gives up
 * after a minute. The RPC client itself is made per call, never during setup.
 */
export function quotaCallOptions(host) {
    const location = hostLocation(host);
    const signal = AbortSignal.timeout(RPC_TIMEOUT_MS);
    if (location)
        return { location, signal };
    if (host.locationOptional)
        return { signal };
    throw new Error("OpenCode gave the TUI no location");
}
/** RPC calls reject with a plain `{ type, message }` object, not an Error. */
export function rpcErrorMessage(error) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === "object" && error !== null && "message" in error) {
        return String(error.message);
    }
    return String(error);
}
/** The toast for a failed call: its reason, cleaned for the terminal. */
export function errorToast(error, title = "OpenCode Quota") {
    const message = sanitizeDisplayText(rpcErrorMessage(error));
    return { variant: "error", title, message };
}
export function reportFailure(error) {
    // OpenCode answers rpc.unavailable when no server plugin registered the quota RPC here.
    const hint = typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "rpc.unavailable"
        ? " (OpenCode Quota's server plugin is not loaded for this folder)"
        : "";
    console.warn(`[opencode-quota] failed to load quota: ${rpcErrorMessage(error)}${hint}`);
}
/**
 * @param onSnapshot called with every snapshot the client takes (from any call or event), so
 *   toasts can announce new reset notices.
 * @param onFailure called when a `snapshot` or `refresh` call made since the last `start()`
 *   fails, so a GUI window can say why it shows nothing or an older snapshot. A call made
 *   through an earlier `host.client` (a server since restarted) reports nothing here.
 */
export function createQuotaClient(host, onSnapshot = () => { }, onFailure = () => { }) {
    const [folders, setFolders] = createSignal({});
    const [sessions, setSessions] = createSignal({});
    const [homeLine, setHomeLine] = createSignal("");
    /** Sessions on screen, with how many surfaces show each. */
    const watched = new Map();
    /** Surfaces on screen without a session (the status line on Home). */
    let globalWatchers = 0;
    let homeWatchers = 0;
    let running = false;
    /** Numbers every call; session token totals come only from a later call than the last one. */
    let calls = 0;
    const sessionCalls = new Map();
    const sessionRevisions = new Map();
    /** Least recently read first, including reads in the same millisecond. */
    const sessionReads = new Map();
    /** Bumped when the TUI stops: answers to calls made before then are dropped. */
    let mount = 0;
    /** Snapshot calls on their way, by session ("" for none), with their call numbers. */
    const loading = new Map();
    /** The `changed` subscription while running, made with the first snapshot call. */
    let events;
    const rpc = () => host.client.rpc(QuotaRpc);
    function forgetInactiveSessions() {
        const cutoff = Date.now() - SESSION_VIEW_KEEP_MS;
        const expired = [];
        let recent = 0;
        for (const [id, read] of [...sessionReads].reverse()) {
            if (watched.has(id))
                continue;
            recent += 1;
            if (recent <= SESSION_VIEW_KEEP_COUNT || read.atMs > cutoff)
                continue;
            sessionReads.delete(id);
            sessionCalls.delete(id);
            sessionRevisions.delete(id);
            expired.push(id);
        }
        if (expired.length === 0)
            return;
        setSessions((all) => {
            const kept = { ...all };
            for (const id of expired)
                delete kept[id];
            return kept;
        });
    }
    function readSession(sessionID) {
        forgetInactiveSessions();
        if (!sessionID)
            return undefined;
        const read = sessionReads.get(sessionID) ?? { atMs: Date.now() };
        read.atMs = Date.now();
        sessionReads.delete(sessionID);
        sessionReads.set(sessionID, read);
        return read;
    }
    /** `call` numbers the request a session's part came from. */
    function apply(snapshot, directory, session) {
        forgetInactiveSessions();
        const { sessionID: snapshotSessionID, currentModelProviderIds, currentModelRowPrefixes, sessionTokens, ...shared } = snapshot;
        const folder = {
            ...(folders()[directory] ?? { sources: {}, retiredServers: new Set() }),
        };
        if (folder.retiredServers.has(shared.serverId))
            return;
        // Revisions compare only within one folder's current server.
        const current = folder.latest;
        if (current && current.serverId !== shared.serverId) {
            folder.retiredServers.add(current.serverId);
            folder.sources = {};
        }
        const scope = shared.sourceScope ?? "";
        const previous = folder.sources[scope];
        setFolders((all) => ({
            ...all,
            [directory]: {
                ...folder,
                latest: !current || current.serverId !== shared.serverId || current.revision < shared.revision
                    ? shared
                    : current,
                sources: !previous || previous.revision < shared.revision
                    ? { ...folder.sources, [scope]: shared }
                    : folder.sources,
                defaultScope: session && !session.id ? scope : folder.defaultScope,
            },
        }));
        const sessionID = session?.id ?? snapshotSessionID;
        // An old event or a late answer cannot recreate an expired session's records.
        const read = sessionID ? sessionReads.get(sessionID) : undefined;
        if (sessionID && read && (!session || session.read === read)) {
            const newerCall = session && session.call > (sessionCalls.get(sessionID) ?? 0);
            const model = sessionRevisions.get(sessionID);
            const newerModel = !model || model.serverId !== shared.serverId || shared.revision > model.revision;
            if (newerCall)
                sessionCalls.set(sessionID, session.call);
            if (newerModel) {
                sessionRevisions.set(sessionID, { serverId: shared.serverId, revision: shared.revision });
            }
            setSessions((all) => ({
                ...all,
                [sessionID]: {
                    ...all[sessionID],
                    ...(newerModel
                        ? { sourceScope: shared.sourceScope, currentModelProviderIds, currentModelRowPrefixes }
                        : {}),
                    ...(newerCall ? { sessionTokens } : {}),
                },
            }));
        }
        // Settings are shared; reset notices, like rows, belong only to sources this TUI uses.
        const active = [...watched.keys()].some((id) => sessions()[id] && (sessions()[id].sourceScope ?? "") === scope);
        const requested = session?.notices && (!session.id || (sessions()[session.id]?.sourceScope ?? "") === scope);
        onSnapshot(requested ||
            active ||
            (globalWatchers > 0 && scope === (folders()[directory]?.defaultScope ?? ""))
            ? snapshot
            : { ...snapshot, resetNotices: [] });
    }
    function subscribe() {
        if (!running || events)
            return;
        events = new AbortController();
        const signal = events.signal;
        try {
            rpc().events.on("changed", (event) => {
                if (signal.aborted)
                    return;
                if (host.acceptsEventFrom && !host.acceptsEventFrom(event.location))
                    return;
                apply(event.data.snapshot, event.location?.directory ?? hostLocation(host)?.directory ?? "");
            }, { signal });
        }
        catch (error) {
            // The poll still updates every minute.
            reportFailure(error);
        }
    }
    function load(sessionID) {
        // The sidebar and the status line of one session ask together; one call answers both.
        const key = sessionID ?? "";
        if (loading.has(key))
            return;
        const read = readSession(sessionID);
        const call = ++calls;
        const at = mount;
        const client = host.client;
        loading.set(key, call);
        subscribe();
        let request;
        let directory = "";
        try {
            const options = quotaCallOptions(host);
            directory = options.location?.directory ?? "";
            request = rpc().snapshot(sessionID ? { sessionID } : {}, options);
        }
        catch (error) {
            // A client without the RPC, or no folder to name: fail like a rejected call.
            request = Promise.reject(error);
        }
        request
            .then((output) => {
            if (at === mount)
                apply(output.snapshot, directory, { id: sessionID, call, read });
        })
            .catch((error) => {
            if (at === mount && host.client === client)
                onFailure(error);
            reportFailure(error);
        })
            .finally(() => {
            if (loading.get(key) === call)
                loading.delete(key);
        });
    }
    function loadHomeLine() {
        const at = mount;
        rpc()
            .notices({}, quotaCallOptions(host))
            .then((output) => {
            if (at === mount)
                setHomeLine(output.homeLine);
        })
            .catch(reportFailure);
    }
    function snapshot(sessionID, directory = hostLocation(host)?.directory ?? "") {
        const folder = folders()[directory];
        const shared = folder?.latest;
        if (!shared)
            return undefined;
        const part = sessionID ? sessions()[sessionID] : undefined;
        const read = sessionID ? sessionReads.get(sessionID) : undefined;
        if (sessionID && read) {
            read.atMs = Date.now();
            sessionReads.delete(sessionID);
            sessionReads.set(sessionID, read);
        }
        if (sessionID && !part && shared.sourceScope)
            return undefined;
        const scope = part
            ? (part.sourceScope ?? "")
            : (folder.defaultScope ?? shared.sourceScope ?? "");
        const source = folder.sources[scope];
        if (!source)
            return undefined;
        const { sourceScope: _scope, ...common } = shared;
        return {
            ...common,
            providers: source.providers,
            resetNotices: source.resetNotices,
            ...(source.sourceScope ? { sourceScope: source.sourceScope } : {}),
            ...part,
        };
    }
    function poll() {
        forgetInactiveSessions();
        if (globalWatchers > 0)
            load();
        for (const sessionID of watched.keys())
            load(sessionID);
        if (homeWatchers > 0)
            loadHomeLine();
    }
    return {
        snapshot,
        homeLine,
        watch(sessionID) {
            if (!sessionID) {
                globalWatchers += 1;
                load();
                return () => {
                    globalWatchers -= 1;
                };
            }
            watched.set(sessionID, (watched.get(sessionID) ?? 0) + 1);
            load(sessionID);
            return () => {
                const count = (watched.get(sessionID) ?? 1) - 1;
                if (count > 0)
                    watched.set(sessionID, count);
                else
                    watched.delete(sessionID);
            };
        },
        watchHome() {
            homeWatchers += 1;
            loadHomeLine();
            return () => {
                homeWatchers -= 1;
            };
        },
        async refresh(reason, sessionID) {
            const read = readSession(sessionID);
            const call = ++calls;
            const at = mount;
            const client = host.client;
            try {
                const input = sessionID ? { reason, sessionID } : { reason };
                subscribe();
                const options = quotaCallOptions(host);
                const output = await rpc().refresh(input, options);
                if (at !== mount)
                    return undefined;
                apply(output.snapshot, options.location?.directory ?? "", {
                    id: sessionID,
                    call,
                    notices: true,
                    read,
                });
                return snapshot(sessionID, options.location?.directory ?? "");
            }
            catch (error) {
                if (at === mount && host.client === client)
                    onFailure(error);
                reportFailure(error);
                return undefined;
            }
        },
        start() {
            running = true;
            // After a reconnect, the surfaces already on screen ask again at once.
            poll();
            const timer = setInterval(poll, POLL_INTERVAL_MS);
            let stopped = false;
            return () => {
                if (stopped)
                    return;
                stopped = true;
                running = false;
                mount += 1;
                loading.clear();
                events?.abort();
                events = undefined;
                clearInterval(timer);
            };
        },
    };
}
//# sourceMappingURL=client.js.map