import { Plugin } from "@opencode/plugin";
import { McpManagerRpc } from "./rpc.js";
import { STORAGE_KEY, activeTemplateName, parseStore, removeTemplateFrom, resolveServerEnabled, setActiveTemplateIn, setSessionOverrideIn, } from "./store.js";
import { reconcileStore } from "./template.js";
async function readStore(ctx) {
    return parseStore(await ctx.storage.get(STORAGE_KEY));
}
/**
 * Persist and reload. The in-memory snapshot must be updated before reload,
 * because reload runs the mcp transform synchronously and that transform reads
 * the snapshot to decide which servers to disable.
 */
function createStoreWriter(ctx, initial) {
    let snapshot = initial;
    let queue = Promise.resolve();
    /** Serialized so the transform's write cannot land after a newer RPC write. */
    const persist = (store) => {
        queue = queue.then(() => ctx.storage.set(STORAGE_KEY, store)).catch(() => ctx.storage.set(STORAGE_KEY, store));
        return queue.then(() => store);
    };
    return {
        get: () => snapshot,
        set: (store) => {
            snapshot = store;
        },
        /** Persist, reload, and expose the new store. */
        commit: async (store) => {
            snapshot = store;
            await persist(store);
            await ctx.mcp.reload();
            return snapshot;
        },
        /** Persist without reloading connections. */
        quiet: async (store) => {
            snapshot = store;
            await persist(store);
            return snapshot;
        },
    };
}
/** MCP tools are registered as `<server>_<tool>`; the namespace is the sanitized server name. */
function toolServerNamespace(toolName, servers) {
    const match = servers
        .map((server) => ({ server, namespace: server.replace(/[^a-zA-Z0-9_-]/g, "_") }))
        .filter((entry) => toolName.startsWith(`${entry.namespace}_`))
        .sort((a, b) => b.namespace.length - a.namespace.length)[0];
    return match?.server;
}
export function createServerPlugin() {
    return Plugin.define({
        id: "opencode-mcp-manager",
        async setup(ctx) {
            const serverCtx = ctx;
            const store = createStoreWriter(serverCtx, await readStore(serverCtx));
            // The transform sees every configured server, including ones that appear
            // mid-session. The session hook needs that list but cannot await, so it
            // reads this snapshot.
            let configuredServers = [];
            await serverCtx.mcp.transform((editor) => {
                const names = editor.list().map(([name]) => name);
                configuredServers = names;
                const reconciled = reconcileStore(store.get(), names);
                if (reconciled.changed) {
                    store.set(reconciled.store);
                    void store.quiet(reconciled.store);
                }
                const template = reconciled.store.templates[activeTemplateName(reconciled.store, serverCtx.location.directory)];
                if (!template)
                    return;
                for (const [name] of editor.list()) {
                    const desired = template.mcp[name];
                    if (desired === undefined)
                        continue;
                    editor.update(name, (draft) => {
                        draft.disabled = !desired;
                    });
                }
            });
            // Per-session MCP tool filtering. Connections stay location-scoped, so an
            // override can only hide a server's tools from this session's model.
            // The server list is the union of template keys and the configured
            // servers, so a server that appeared mid-session is filtered too.
            await serverCtx.session.hook("context", (event) => {
                const current = store.get();
                const template = current.templates[activeTemplateName(current, serverCtx.location.directory)];
                const servers = [...new Set([...Object.keys(template?.mcp ?? {}), ...configuredServers])];
                if (!servers.length)
                    return;
                for (const toolName of Object.keys(event.tools)) {
                    const server = toolServerNamespace(toolName, servers);
                    if (!server)
                        continue;
                    if (!resolveServerEnabled(current, server, serverCtx.location.directory, event.sessionID)) {
                        delete event.tools[toolName];
                    }
                }
            });
            await serverCtx.rpc.register(McpManagerRpc, {
                list: async () => {
                    store.set(await readStore(serverCtx));
                    return store.get();
                },
                apply: async (input) => {
                    const current = await readStore(serverCtx);
                    if (!current.templates[input.name])
                        throw new Error(`Template not found: ${input.name}`);
                    const applied = setActiveTemplateIn(current, serverCtx.location.directory, input.name);
                    // Applying a template means "follow this template", so the session's
                    // pins are dropped; otherwise the line would stay custom and the
                    // pinned servers would keep overriding the template just applied.
                    const next = input.sessionID ? setSessionOverrideIn(applied, input.sessionID, undefined) : applied;
                    return { store: await store.commit(next) };
                },
                save: async (input) => {
                    const current = await readStore(serverCtx);
                    const name = input.name.trim();
                    if (!name)
                        throw new Error("Template name is required");
                    const next = {
                        ...current,
                        templates: { ...current.templates, [name]: { mcp: { ...input.template.mcp } } },
                    };
                    // Editing the template that governs this location must take effect now;
                    // saving an unrelated one only persists.
                    const governs = activeTemplateName(current, serverCtx.location.directory) === name;
                    return { store: governs ? await store.commit(next) : await store.quiet(next) };
                },
                setDefault: async (input) => {
                    const current = await readStore(serverCtx);
                    if (!current.templates[input.name])
                        throw new Error(`Template not found: ${input.name}`);
                    return { store: await store.commit({ ...current, defaultTemplate: input.name }) };
                },
                remove: async (input) => {
                    const current = await readStore(serverCtx);
                    if (!current.templates[input.name])
                        throw new Error(`Template not found: ${input.name}`);
                    return { store: await store.commit(removeTemplateFrom(current, input.name)) };
                },
                clearActive: async () => {
                    const current = await readStore(serverCtx);
                    return { store: await store.commit(setActiveTemplateIn(current, serverCtx.location.directory, undefined)) };
                },
                getSessionOverride: async (input) => {
                    const current = await readStore(serverCtx);
                    store.set(current);
                    return { overrides: current.sessionOverrides?.[input.sessionID] ?? {} };
                },
                setSessionOverride: async (input) => {
                    const current = await readStore(serverCtx);
                    // No reload: an override only changes which tools the session sees.
                    return { store: await store.quiet(setSessionOverrideIn(current, input.sessionID, input.overrides)) };
                },
                clearSessionOverride: async (input) => {
                    const current = await readStore(serverCtx);
                    return { store: await store.quiet(setSessionOverrideIn(current, input.sessionID, undefined)) };
                },
            });
        },
    });
}
export default createServerPlugin();
