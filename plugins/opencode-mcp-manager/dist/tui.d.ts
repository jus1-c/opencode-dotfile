import { Plugin } from "@opencode/plugin/tui";
import type { Template, TemplateStore } from "./store.js";
import { type RuntimeStatusMap } from "./template.js";
export type TuiContext = {
    location: {
        directory: string;
    } | undefined;
    theme: {
        text: {
            base: string;
            muted: string;
            feedback: {
                success: {
                    base: string;
                };
                warning: {
                    base: string;
                };
            };
        };
    };
    client: {
        rpc(definition: unknown): McpClient;
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
    data: {
        on<Type extends string>(type: Type, handler: (event: {
            data: Record<string, string>;
        }) => void): () => void;
        location: {
            default(): {
                directory: string;
            };
            mcp: {
                server: {
                    list(location?: {
                        directory: string;
                    }): ServerStatus[] | undefined;
                };
            };
        };
    };
    keymap: {
        layer(factory: () => {
            mode?: string;
            commands: Command[];
        }): void;
    };
    ui: {
        dialog: {
            select<Value>(options: SelectOptions<Value>): Promise<Value | undefined>;
            prompt(options: {
                title: string;
                placeholder?: string;
            }): Promise<string | undefined>;
            confirm(options: {
                title: string;
                message: string;
                label?: {
                    confirm?: string;
                    cancel?: string;
                };
            }): Promise<boolean | undefined>;
            alert(options: {
                title: string;
                message: string;
            }): Promise<void>;
        };
        toast: {
            show(options: {
                title?: string;
                message: string;
                variant?: string;
                duration?: number;
            }): void;
        };
        router: {
            current(): {
                type: string;
                sessionID?: string;
            };
        };
        slot(claim: {
            append: "sidebar.footer";
            render: (input: {
                sessionID: string;
            }) => unknown;
        }): () => void;
    };
};
/** Second RPC argument: routes the call to this location's plugin instance. */
type RpcOptions = {
    location?: {
        directory: string;
    };
};
export type McpClient = {
    list(input?: unknown, options?: RpcOptions): Promise<TemplateStore>;
    apply(input: {
        name: string;
        sessionID?: string;
    }, options?: RpcOptions): Promise<{
        store: TemplateStore;
    }>;
    save(input: {
        name: string;
        template: Template;
    }, options?: RpcOptions): Promise<{
        store: TemplateStore;
    }>;
    setDefault(input: {
        name: string;
    }, options?: RpcOptions): Promise<{
        store: TemplateStore;
    }>;
    remove(input: {
        name: string;
    }, options?: RpcOptions): Promise<{
        store: TemplateStore;
    }>;
    clearActive(input?: unknown, options?: RpcOptions): Promise<{
        store: TemplateStore;
    }>;
    getSessionOverride(input: {
        sessionID: string;
    }, options?: RpcOptions): Promise<{
        overrides: Record<string, boolean>;
    }>;
    setSessionOverride(input: {
        sessionID: string;
        overrides: Record<string, boolean>;
    }, options?: RpcOptions): Promise<{
        store: TemplateStore;
    }>;
    clearSessionOverride(input: {
        sessionID: string;
    }, options?: RpcOptions): Promise<{
        store: TemplateStore;
    }>;
};
type Command = {
    id: string;
    title: string;
    description?: string;
    group?: string;
    palette?: true;
    slash?: {
        name: string;
        aliases?: string[];
    };
    run: () => void | Promise<void>;
};
type SelectOptions<Value> = {
    title: string;
    placeholder?: string;
    options: {
        title: string;
        value: Value;
        description?: string;
        category?: string;
    }[];
    current?: Value;
};
type ServerStatus = {
    name: string;
    status: {
        status: string;
        error?: string;
    };
};
export declare function runtimeTemplateFromStatuses(serverNames: readonly string[], statuses: RuntimeStatusMap): Template;
export declare function createTuiPlugin(): Plugin.Definition;
declare const _default: Plugin.Definition;
export default _default;
