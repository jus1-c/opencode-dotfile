/**
 * Add servers the store does not know yet. A server that appears mid-session
 * starts disabled: enabling it is an explicit act, so a config change cannot
 * silently start a new MCP.
 */
export function reconcileStore(store, serverNames) {
    const names = [...new Set(serverNames)];
    let changed = false;
    const templates = {};
    for (const [templateName, template] of Object.entries(store.templates)) {
        const mcp = {};
        for (const serverName of names) {
            mcp[serverName] = template.mcp[serverName] ?? false;
            if (!(serverName in template.mcp))
                changed = true;
        }
        if (Object.keys(template.mcp).length !== names.length)
            changed = true;
        templates[templateName] = { mcp };
    }
    return {
        store: changed ? { ...store, templates } : store,
        changed,
    };
}
/** v2 config uses the inverse `disabled` flag. */
export function applyTemplateToConfig(configs, template) {
    for (const [name, enabled] of Object.entries(template.mcp)) {
        const current = configs[name];
        if (!current)
            continue;
        current.disabled = !enabled;
    }
}
export function isRuntimeEnabled(status) {
    return status?.status !== "disabled";
}
export async function applyTemplateToRuntime(client, statuses, template, directory) {
    const actions = Object.entries(template.mcp).flatMap(([name, desiredEnabled]) => {
        const currentEnabled = isRuntimeEnabled(statuses[name]);
        if (desiredEnabled === currentEnabled)
            return [];
        const operation = desiredEnabled ? "connect" : "disconnect";
        return [{ name, desiredEnabled, operation }];
    });
    const results = await Promise.allSettled(actions.map(async (action) => {
        const input = directory ? { server: action.name, location: { directory } } : { server: action.name };
        await (action.operation === "connect"
            ? client.mcp.connect(input)
            : client.mcp.disconnect(input));
        return action;
    }));
    return results.map((result, index) => {
        const action = actions[index];
        if (!action)
            throw new Error("MCP runtime action result mismatch");
        if (result.status === "fulfilled") {
            return { ...action, ok: true };
        }
        return { ...action, ok: false, error: errorMessage(result.reason) };
    });
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
