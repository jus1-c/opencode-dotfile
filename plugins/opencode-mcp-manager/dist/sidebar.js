import { jsx as _jsx, jsxs as _jsxs } from "@opentui/solid/jsx-runtime";
import { createEffect, createSignal } from "solid-js";
/** The word after the label: what the line is reporting about. */
export function templateLineSuffix(state) {
    if (!state)
        return "…";
    if (state.applying)
        return `applying ${state.applying} …`;
    return `${state.template}${state.custom ? " (custom)" : ""}`;
}
export function describeTemplateLine(state) {
    return `MCP  ${templateLineSuffix(state)}`;
}
/**
 * A template is "custom" when the session pins servers, or when the runtime
 * disagrees with the template for a server that is currently loaded.
 */
export function isCustomized(store, templateName, directory, sessionID, statuses) {
    if (sessionID && Object.keys(store.sessionOverrides?.[sessionID] ?? {}).length > 0)
        return true;
    const template = store.templates[templateName];
    if (!template)
        return false;
    for (const server of statuses) {
        const desired = template.mcp[server.name];
        if (desired === undefined)
            continue;
        // A pending server has not settled yet; comparing it would report a
        // difference that the runtime is about to resolve.
        if (server.status.status === "pending")
            continue;
        if (desired !== (server.status.status !== "disabled"))
            return true;
    }
    return false;
}
export function activeTemplateFor(store, directory) {
    const active = store.activeTemplates?.[directory];
    return active && store.templates[active] ? active : store.defaultTemplate;
}
/**
 * Green marks a template that is applied as saved; yellow marks one that drifted
 * (a session pin, or the runtime disagreeing with the template).
 */
export function suffixColor(theme, state) {
    if (!state)
        return theme.text.muted;
    if (state.applying)
        return theme.text.feedback.warning.base;
    return state.custom ? theme.text.feedback.warning.base : theme.text.feedback.success.base;
}
export function registerSidebar(context, rpc) {
    const [state, setState] = createSignal(undefined);
    let applying;
    let directory = "";
    const refresh = async () => {
        try {
            const store = await rpc.list({}, { location: { directory } });
            const statuses = context.data.location.mcp.server.list({ directory }) ?? [];
            const template = activeTemplateFor(store, directory);
            const custom = isCustomized(store, template, directory, context.ui.router.current().sessionID, statuses);
            setState({ template, custom, ...(applying === undefined ? {} : { applying }) });
        }
        catch {
            // The line is decoration; a failed read must not break the sidebar.
        }
    };
    context.ui.slot({
        append: "sidebar.footer",
        render: (input) => {
            // The slot input is reactive: a different session re-reads its template.
            createEffect(() => {
                void input.sessionID;
                directory = context.location?.directory ?? context.data.location.default().directory;
                void refresh();
            });
            return (_jsxs("text", { fg: context.theme.text.base, children: ["MCP", "  ", _jsx("span", { style: { fg: suffixColor(context.theme, state()) }, children: templateLineSuffix(state()) })] }));
        },
    });
    return {
        refresh,
        isApplying: () => applying !== undefined,
        setApplying(name) {
            applying = name;
            const current = state();
            if (current) {
                const { applying: _drop, ...rest } = current;
                setState(name === undefined ? rest : { ...rest, applying: name });
            }
            if (name === undefined)
                void refresh();
        },
    };
}
