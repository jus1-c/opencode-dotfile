import { Plugin } from "@opencode/plugin/tui";
import { McpManagerRpc } from "./rpc.js";
import { registerSidebar } from "./sidebar.js";
import { isRuntimeEnabled } from "./template.js";
export function runtimeTemplateFromStatuses(serverNames, statuses) {
    return {
        mcp: Object.fromEntries(serverNames.map((name) => [name, isRuntimeEnabled(statuses[name])])),
    };
}
function currentDirectory(ctx) {
    return ctx.location?.directory ?? ctx.data.location.default().directory;
}
function serverStatuses(ctx) {
    const directory = currentDirectory(ctx);
    const servers = ctx.data.location.mcp.server.list({ directory }) ?? [];
    const statuses = {};
    for (const server of servers)
        statuses[server.name] = server.status;
    return { names: servers.map((server) => server.name), statuses };
}
export function createTuiPlugin() {
    return Plugin.define({
        id: "opencode-mcp-manager.tui",
        setup(ctx) {
            const context = ctx;
            const rpc = context.client.rpc(McpManagerRpc);
            const sidebar = registerSidebar(context, rpc);
            context.keymap.layer(() => ({
                mode: "global",
                commands: [
                    {
                        id: "mcp-manager.open",
                        title: "MCP Manager",
                        description: "Manage MCP server templates",
                        group: "Plugin",
                        palette: true,
                        slash: { name: "mcp-man" },
                        run: () => openManager(context, rpc, sidebar),
                    },
                ],
            }));
            // Auto-capture manual toggles: /mcps or the sidebar disconnect/connect a
            // server while a session is open, so pin that server for the session
            // instead of asking the user to open the override menu afterwards.
            context.data.on("mcp.status.changed", (event) => {
                const server = event.data.server;
                if (!server)
                    return;
                // The runtime settles one server at a time; refresh the line so it stops
                // reading as "custom" while servers are still connecting.
                void sidebar.refresh();
                void captureManualToggle(context, rpc, server, sidebar);
            });
        },
    });
}
async function captureManualToggle(ctx, rpc, server, sidebar) {
    try {
        // Applying a template settles every server, which emits status changes that
        // are not user toggles. Pinning them would corrupt the session override.
        if (sidebar.isApplying())
            return;
        const route = ctx.ui.router.current();
        if (route.type !== "session" || !route.sessionID)
            return;
        const sessionID = route.sessionID;
        const directory = currentDirectory(ctx);
        const options = { location: { directory } };
        const servers = ctx.data.location.mcp.server.list({ directory }) ?? [];
        const status = servers.find((entry) => entry.name === server)?.status.status;
        if (!status || status === "pending")
            return;
        // A reload settles every server at once. While any server is still pending
        // the list is churning, so a difference here is not a user toggle.
        if (servers.some((entry) => entry.status.status === "pending"))
            return;
        const { overrides } = await rpc.getSessionOverride({ sessionID }, options);
        if (server in overrides)
            return;
        const store = await rpc.list({}, options);
        const templateEnabled = resolveFromStore(store, server, directory);
        const actualEnabled = status !== "disabled";
        if (templateEnabled === actualEnabled)
            return;
        // Re-read right before writing: a reload that started after the checks above
        // would otherwise be pinned as if the user had toggled it.
        if (sidebar.isApplying())
            return;
        const latest = ctx.data.location.mcp.server.list({ directory }) ?? [];
        if (latest.some((entry) => entry.status.status === "pending"))
            return;
        await rpc.setSessionOverride({ sessionID, overrides: { ...overrides, [server]: actualEnabled } }, options);
        void sidebar.refresh();
        ctx.ui.toast.show({
            variant: "info",
            title: "MCP pinned to this session",
            message: `${server}: ${actualEnabled ? "on" : "off"} (override > template)`,
            duration: 2500,
        });
    }
    catch {
        // Auto-capture is best-effort; never surface a toast for a background event.
    }
}
async function openManager(ctx, rpc, sidebar) {
    try {
        const directory = currentDirectory(ctx);
        const options = { location: { directory } };
        const store = await rpc.list({}, options);
        const action = await ctx.ui.dialog.select({
            title: "MCP Manager",
            placeholder: "Choose an action",
            options: [
                { title: "Apply template", value: "apply" },
                { title: "Edit template", value: "edit", description: "Toggle servers inside a saved template" },
                { title: "Session MCP override", value: "session", description: "Pick MCP servers for this session only" },
                { title: "Save current state", value: "save" },
                { title: "Set default template", value: "default" },
                { title: "Delete template", value: "delete" },
            ],
        });
        if (!action)
            return;
        if (action === "apply")
            await applyTemplate(ctx, rpc, store, sidebar);
        else if (action === "edit")
            await editTemplate(ctx, rpc, store, sidebar);
        else if (action === "session")
            await sessionOverride(ctx, rpc, store, sidebar);
        else if (action === "save")
            await saveCurrentState(ctx, rpc, sidebar);
        else if (action === "default")
            await changeDefault(ctx, rpc, store, sidebar);
        else
            await removeTemplate(ctx, rpc, store, sidebar);
    }
    catch (error) {
        showError(ctx, error);
    }
}
async function applyTemplate(ctx, rpc, store, sidebar) {
    const name = await ctx.ui.dialog.select({
        title: "Apply template",
        placeholder: "Choose a template",
        options: Object.keys(store.templates).map((template) => ({
            title: template + (template === store.defaultTemplate ? " (default)" : ""),
            value: template,
        })),
    });
    if (!name)
        return;
    const directory = currentDirectory(ctx);
    const options = { location: { directory } };
    const sessionID = ctx.ui.router.current().sessionID;
    sidebar.setApplying(name);
    ctx.ui.toast.show({ variant: "info", title: "MCP Manager", message: `Applying ${name}…` });
    try {
        const { store: next } = await rpc.apply({ name, ...(sessionID === undefined ? {} : { sessionID }) }, options);
        // Safety net: the server writes to its own location, so a mismatch here means
        // the call landed somewhere else and the template will not take effect.
        if (next.activeTemplates?.[directory] !== name) {
            ctx.ui.toast.show({
                variant: "error",
                title: "MCP Manager",
                message: `Server did not record ${name} for this project`,
            });
            return;
        }
        // The core skips a server whose config did not change, so a server connected
        // by hand through /mcps would keep running despite the new template. Settle
        // the runtime explicitly against the template.
        const settled = await settleRuntime(ctx, next.templates[name], directory);
        if (settled.pending.length > 0) {
            ctx.ui.toast.show({
                variant: "warning",
                title: "MCP template applied",
                message: `${name}: ${settled.on} on, ${settled.off} off — still connecting: ${settled.pending.join(", ")}`,
            });
            return;
        }
        ctx.ui.toast.show({
            variant: "success",
            title: "MCP template applied",
            message: `${name}: ${settled.on} on, ${settled.off} off`,
        });
    }
    finally {
        // Cleared last: the settle emits status changes, and auto-pin must stay off
        // for all of them or it re-pins the servers this apply just released.
        sidebar.setApplying(undefined);
    }
}
/**
 * Bring the runtime in line with the template, then wait until it settles.
 *
 * The core's reconcile skips any server whose config is deep-equal to the last
 * applied one, and a manual connect through /mcps changes only the status. So
 * after applying a template some servers can still run against the old state.
 * Asking connect/disconnect directly for those is the only way to settle them.
 */
async function settleRuntime(ctx, template, directory, timeoutMs = 45_000) {
    const desired = template?.mcp ?? {};
    const servers = ctx.data.location.mcp.server.list({ directory }) ?? [];
    const drifted = servers.filter((server) => {
        const want = desired[server.name];
        if (want === undefined)
            return false;
        if (server.status.status === "pending")
            return false;
        return want !== (server.status.status !== "disabled");
    });
    if (drifted.length > 0) {
        await Promise.allSettled(drifted.map((server) => desired[server.name]
            ? ctx.client.mcp.connect({ server: server.name, location: { directory } })
            : ctx.client.mcp.disconnect({ server: server.name, location: { directory } })));
    }
    return waitForSettled(ctx, template, directory, timeoutMs);
}
/**
 * The runtime settles one server at a time and a slow server can hold the rest,
 * so poll until nothing is pending instead of assuming apply finished.
 */
async function waitForSettled(ctx, template, directory, timeoutMs = 45_000) {
    const deadline = Date.now() + timeoutMs;
    const desired = template?.mcp ?? {};
    const count = (servers) => {
        const pending = servers.filter((server) => server.status.status === "pending").map((server) => server.name);
        const wanted = servers.filter((server) => desired[server.name] !== undefined);
        const on = wanted.filter((server) => server.status.status !== "disabled").length;
        return { on, off: wanted.length - on, pending };
    };
    for (;;) {
        const result = count(ctx.data.location.mcp.server.list({ directory }) ?? []);
        if (result.pending.length === 0 || Date.now() >= deadline)
            return result;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
}
async function sessionOverride(ctx, rpc, store, sidebar) {
    const route = ctx.ui.router.current();
    if (route.type !== "session" || !route.sessionID) {
        ctx.ui.toast.show({
            variant: "warning",
            title: "MCP Manager",
            message: "Open a session first — the override applies to one session",
        });
        return;
    }
    const sessionID = route.sessionID;
    const directory = currentDirectory(ctx);
    const options = { location: { directory } };
    const template = store.templates[store.activeTemplates?.[directory] ?? store.defaultTemplate];
    // Union with the configured servers so a server that appeared mid-session is
    // pinnable here too.
    const servers = [...new Set([...Object.keys(template?.mcp ?? {}), ...serverStatuses(ctx).names])].sort();
    if (!servers.length) {
        ctx.ui.toast.show({ variant: "info", title: "MCP Manager", message: "No MCP servers configured" });
        return;
    }
    const { overrides: current } = await rpc.getSessionOverride({ sessionID }, options);
    const choice = await ctx.ui.dialog.select({
        title: "Session MCP override",
        placeholder: "Choose an action",
        options: [
            {
                title: current && Object.keys(current).length ? "Edit override" : "Create override",
                value: "edit",
                description: Object.keys(current).length
                    ? `${Object.keys(current).length} server(s) pinned`
                    : "Pin MCP servers for this session only",
            },
            ...(Object.keys(current).length
                ? [{ title: "Clear override (fall back to template)", value: "clear" }]
                : []),
        ],
    });
    if (!choice)
        return;
    if (choice === "clear") {
        await rpc.clearSessionOverride({ sessionID }, options);
        void sidebar.refresh();
        ctx.ui.toast.show({ variant: "success", title: "Session override cleared", message: "Falls back to template" });
        return;
    }
    const next = { ...current };
    let editing = true;
    while (editing) {
        const server = await ctx.ui.dialog.select({
            title: "Session MCP override",
            placeholder: "Toggle a server",
            options: servers.map((name) => ({
                title: name,
                value: name,
                description: describeState(name, next, store, directory),
            })),
        });
        if (!server)
            break;
        const resolved = next[server] ?? resolveFromStore(store, server, directory);
        next[server] = !resolved;
        await rpc.setSessionOverride({ sessionID, overrides: next }, options);
        void sidebar.refresh();
    }
    ctx.ui.toast.show({
        variant: "success",
        title: "Session override saved",
        message: `${Object.keys(next).length} server(s) pinned to this session`,
    });
}
/**
 * Edit a saved template in place. Toggling a server in the template that
 * governs this project takes effect immediately; other templates only persist.
 */
async function editTemplate(ctx, rpc, store, sidebar) {
    const directory = currentDirectory(ctx);
    const options = { location: { directory } };
    const active = store.activeTemplates?.[directory] ?? store.defaultTemplate;
    const name = await ctx.ui.dialog.select({
        title: "Edit template",
        placeholder: "Choose a template",
        options: Object.keys(store.templates).map((template) => ({
            title: template + (template === active ? " (active here)" : ""),
            value: template,
        })),
    });
    if (!name)
        return;
    const template = store.templates[name];
    if (!template)
        return;
    // Include servers the template does not list yet, so a newly configured MCP
    // can be enabled here instead of only through "Save current state".
    const { names } = serverStatuses(ctx);
    const servers = [...new Set([...Object.keys(template.mcp), ...names])].sort();
    if (!servers.length) {
        ctx.ui.toast.show({ variant: "info", title: "MCP Manager", message: "No MCP servers configured" });
        return;
    }
    const next = { ...template.mcp };
    for (const server of servers)
        next[server] = next[server] ?? false;
    let changed = false;
    for (;;) {
        const server = await ctx.ui.dialog.select({
            title: `Edit template: ${name}`,
            placeholder: "Toggle a server",
            options: servers.map((entry) => ({
                title: entry,
                value: entry,
                description: next[entry] ? "on" : "off",
            })),
        });
        if (!server)
            break;
        next[server] = !next[server];
        changed = true;
        await rpc.save({ name, template: { mcp: next } }, options);
        void sidebar.refresh();
        ctx.ui.toast.show({
            variant: "info",
            title: `Template ${name}`,
            message: `${server}: ${next[server] ? "on" : "off"} (saved)`,
            duration: 1500,
        });
    }
    if (!changed)
        return;
    ctx.ui.toast.show({
        variant: "success",
        title: "Template saved",
        message: name === active ? `${name} — applied to this project` : name,
    });
}
function resolveFromStore(store, server, directory) {
    const name = store.activeTemplates?.[directory] ?? store.defaultTemplate;
    return store.templates[name]?.mcp[server] ?? false;
}
function describeState(server, override, store, directory) {
    const pinned = override[server];
    if (pinned !== undefined)
        return pinned ? "session: on (pinned)" : "session: off (pinned)";
    return resolveFromStore(store, server, directory) ? "template: on" : "template: off";
}
async function saveCurrentState(ctx, rpc, sidebar) {
    const name = await ctx.ui.dialog.prompt({ title: "Save current MCP state", placeholder: "work" });
    if (!name)
        return;
    const { names, statuses } = serverStatuses(ctx);
    const options = { location: { directory: currentDirectory(ctx) } };
    await rpc.save({ name, template: runtimeTemplateFromStatuses(names, statuses) }, options);
    void sidebar.refresh();
    ctx.ui.toast.show({ variant: "success", title: "MCP template saved", message: name.trim() });
}
async function changeDefault(ctx, rpc, store, sidebar) {
    const name = await ctx.ui.dialog.select({
        title: "Set default template",
        current: store.defaultTemplate,
        options: Object.keys(store.templates).map((template) => ({ title: template, value: template })),
    });
    if (!name)
        return;
    await rpc.setDefault({ name }, { location: { directory: currentDirectory(ctx) } });
    void sidebar.refresh();
    ctx.ui.toast.show({ variant: "success", title: "Default template changed", message: name });
}
async function removeTemplate(ctx, rpc, store, sidebar) {
    const names = Object.keys(store.templates).filter((name) => name !== store.defaultTemplate);
    if (!names.length) {
        ctx.ui.toast.show({ variant: "info", title: "MCP Manager", message: "No non-default templates to delete" });
        return;
    }
    const name = await ctx.ui.dialog.select({
        title: "Delete template",
        options: names.map((template) => ({ title: template, value: template })),
    });
    if (!name)
        return;
    const confirmed = await ctx.ui.dialog.confirm({ title: "Delete template", message: `Delete ${name}?` });
    if (!confirmed)
        return;
    await rpc.remove({ name }, { location: { directory: currentDirectory(ctx) } });
    void sidebar.refresh();
    ctx.ui.toast.show({ variant: "success", title: "MCP template deleted", message: name });
}
function showError(ctx, error) {
    ctx.ui.toast.show({ variant: "error", title: "MCP Manager", message: errorMessage(error) });
}
function errorMessage(error) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === "object" && error !== null && "message" in error)
        return String(error.message);
    return String(error);
}
export default createTuiPlugin();
