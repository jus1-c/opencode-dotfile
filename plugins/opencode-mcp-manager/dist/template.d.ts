import type { Template, TemplateStore } from "./store.js";
export type McpConfigLike = {
    disabled?: boolean;
};
export type RuntimeStatus = {
    status: string;
    error?: string;
};
export type RuntimeStatusMap = Record<string, RuntimeStatus>;
export type RuntimeClient = {
    mcp: {
        connect(input: {
            server: string;
            location?: {
                directory: string;
            };
        }): Promise<unknown>;
        disconnect(input: {
            server: string;
            location?: {
                directory: string;
            };
        }): Promise<unknown>;
    };
};
export type RuntimeApplyResult = {
    name: string;
    desiredEnabled: boolean;
    operation: "connect" | "disconnect";
    ok: boolean;
    error?: string;
};
/**
 * Add servers the store does not know yet. A server that appears mid-session
 * starts disabled: enabling it is an explicit act, so a config change cannot
 * silently start a new MCP.
 */
export declare function reconcileStore(store: TemplateStore, serverNames: readonly string[]): {
    store: TemplateStore;
    changed: boolean;
};
/** v2 config uses the inverse `disabled` flag. */
export declare function applyTemplateToConfig(configs: Record<string, McpConfigLike>, template: Template): void;
export declare function isRuntimeEnabled(status: RuntimeStatus | undefined): boolean;
export declare function applyTemplateToRuntime(client: RuntimeClient, statuses: RuntimeStatusMap, template: Template, directory?: string): Promise<RuntimeApplyResult[]>;
