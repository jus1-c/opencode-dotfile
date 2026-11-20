export const STORE_VERSION = 1;
export const DEFAULT_TEMPLATE_NAME = "default";
export const STORAGE_KEY = "templates";
export class TemplateStoreError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = "TemplateStoreError";
    }
}
export function createEmptyStore() {
    return {
        version: STORE_VERSION,
        defaultTemplate: DEFAULT_TEMPLATE_NAME,
        templates: {
            [DEFAULT_TEMPLATE_NAME]: { mcp: {} },
        },
    };
}
export function validateStore(value) {
    if (!isRecord(value) || value.version !== STORE_VERSION || typeof value.defaultTemplate !== "string") {
        throw invalidStore();
    }
    if (!isRecord(value.templates) || !value.defaultTemplate || !isRecord(value.templates[value.defaultTemplate])) {
        throw invalidStore();
    }
    const templates = {};
    for (const [name, rawTemplate] of Object.entries(value.templates)) {
        if (!name || !isRecord(rawTemplate) || !isRecord(rawTemplate.mcp)) {
            throw invalidStore();
        }
        const mcp = {};
        for (const [serverName, enabled] of Object.entries(rawTemplate.mcp)) {
            if (!serverName || typeof enabled !== "boolean") {
                throw invalidStore();
            }
            mcp[serverName] = enabled;
        }
        templates[name] = { mcp };
    }
    const activeTemplatesRaw = value.activeTemplates;
    let activeTemplates;
    if (activeTemplatesRaw !== undefined) {
        if (!isRecord(activeTemplatesRaw)) {
            throw invalidStore();
        }
        activeTemplates = {};
        for (const [dir, tplName] of Object.entries(activeTemplatesRaw)) {
            if (!dir || typeof tplName !== "string" || !isRecord(value.templates[tplName])) {
                throw invalidStore();
            }
            activeTemplates[dir] = tplName;
        }
    }
    const sessionOverridesRaw = value.sessionOverrides;
    let sessionOverrides;
    if (sessionOverridesRaw !== undefined) {
        if (!isRecord(sessionOverridesRaw)) {
            throw invalidStore();
        }
        sessionOverrides = {};
        for (const [sessionID, rawOverride] of Object.entries(sessionOverridesRaw)) {
            if (!sessionID || !isRecord(rawOverride)) {
                throw invalidStore();
            }
            const override = {};
            for (const [serverName, enabled] of Object.entries(rawOverride)) {
                if (!serverName || typeof enabled !== "boolean") {
                    throw invalidStore();
                }
                override[serverName] = enabled;
            }
            sessionOverrides[sessionID] = override;
        }
    }
    return {
        version: STORE_VERSION,
        defaultTemplate: value.defaultTemplate,
        ...(activeTemplates !== undefined ? { activeTemplates } : {}),
        ...(sessionOverrides !== undefined ? { sessionOverrides } : {}),
        templates,
    };
}
/** Parse an unknown storage value, falling back to an empty store. */
export function parseStore(value) {
    if (value === undefined || value === null)
        return createEmptyStore();
    return validateStore(value);
}
export function activeTemplateName(store, directory) {
    const active = directory ? store.activeTemplates?.[directory] : undefined;
    return active && store.templates[active] ? active : store.defaultTemplate;
}
/**
 * Resolve the enabled state for one MCP server.
 * Priority: session override -> active directory template -> default template.
 * A server no template mentions stays off: a newly configured MCP must be
 * enabled explicitly through /mcps or /mcp-man.
 */
export function resolveServerEnabled(store, serverName, directory, sessionID) {
    const override = sessionID ? store.sessionOverrides?.[sessionID]?.[serverName] : undefined;
    if (override !== undefined)
        return override;
    const template = store.templates[activeTemplateName(store, directory)];
    return template?.mcp[serverName] ?? false;
}
/** Server names the session's override touches, for UI display. */
export function sessionOverrideNames(store, sessionID) {
    return Object.keys(store.sessionOverrides?.[sessionID] ?? {}).sort();
}
export function setSessionOverrideIn(store, sessionID, overrides) {
    if (!sessionID)
        throw new Error("Session ID is required");
    const sessionOverrides = { ...(store.sessionOverrides ?? {}) };
    if (overrides && Object.keys(overrides).length > 0) {
        sessionOverrides[sessionID] = { ...overrides };
    }
    else {
        delete sessionOverrides[sessionID];
    }
    return {
        ...store,
        ...(Object.keys(sessionOverrides).length > 0 ? { sessionOverrides } : { sessionOverrides: undefined }),
    };
}
export function setActiveTemplateIn(store, directory, name) {
    if (name !== undefined && !store.templates[name]) {
        throw new Error(`Template not found: ${name}`);
    }
    const activeTemplates = { ...(store.activeTemplates ?? {}) };
    if (name !== undefined) {
        activeTemplates[directory] = name;
    }
    else {
        delete activeTemplates[directory];
    }
    return {
        ...store,
        ...(Object.keys(activeTemplates).length > 0 ? { activeTemplates } : { activeTemplates: undefined }),
    };
}
export function removeTemplateFrom(store, name) {
    if (name === store.defaultTemplate)
        throw new Error("Cannot delete default template");
    if (!store.templates[name])
        throw new Error(`Template not found: ${name}`);
    const { [name]: _deleted, ...templates } = store.templates;
    const filtered = store.activeTemplates
        ? Object.fromEntries(Object.entries(store.activeTemplates).filter(([, tpl]) => tpl !== name))
        : undefined;
    return {
        ...store,
        templates,
        ...(filtered && Object.keys(filtered).length > 0 ? { activeTemplates: filtered } : { activeTemplates: undefined }),
    };
}
function invalidStore(cause) {
    return new TemplateStoreError("Invalid MCP template store", cause === undefined ? undefined : { cause });
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
