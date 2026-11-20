export declare const STORE_VERSION: 1;
export declare const DEFAULT_TEMPLATE_NAME = "default";
export declare const STORAGE_KEY = "templates";
export type Template = {
    mcp: Record<string, boolean>;
};
export type TemplateStore = {
    version: typeof STORE_VERSION;
    defaultTemplate: string;
    /** Directory -> template name. Applying a template only affects that project. */
    activeTemplates?: Record<string, string>;
    /**
     * Session -> per-server override. Wins over the directory template.
     * Only affects which MCP tools the model sees in that session; MCP
     * connections themselves stay location-scoped.
     */
    sessionOverrides?: Record<string, Record<string, boolean>>;
    templates: Record<string, Template>;
};
export declare class TemplateStoreError extends Error {
    constructor(message: string, options?: ErrorOptions);
}
export declare function createEmptyStore(): TemplateStore;
export declare function validateStore(value: unknown): TemplateStore;
/** Parse an unknown storage value, falling back to an empty store. */
export declare function parseStore(value: unknown): TemplateStore;
export declare function activeTemplateName(store: TemplateStore, directory: string | undefined): string;
/**
 * Resolve the enabled state for one MCP server.
 * Priority: session override -> active directory template -> default template.
 * A server no template mentions stays off: a newly configured MCP must be
 * enabled explicitly through /mcps or /mcp-man.
 */
export declare function resolveServerEnabled(store: TemplateStore, serverName: string, directory: string | undefined, sessionID: string | undefined): boolean;
/** Server names the session's override touches, for UI display. */
export declare function sessionOverrideNames(store: TemplateStore, sessionID: string): string[];
export declare function setSessionOverrideIn(store: TemplateStore, sessionID: string, overrides: Record<string, boolean> | undefined): TemplateStore;
export declare function setActiveTemplateIn(store: TemplateStore, directory: string, name: string | undefined): TemplateStore;
export declare function removeTemplateFrom(store: TemplateStore, name: string): TemplateStore;
