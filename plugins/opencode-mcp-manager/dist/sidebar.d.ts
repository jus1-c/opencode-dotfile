import type { McpClient, TuiContext } from "./tui.js";
import type { TemplateStore } from "./store.js";
export type SidebarState = {
    template: string;
    custom: boolean;
    applying?: string;
};
/** The word after the label: what the line is reporting about. */
export declare function templateLineSuffix(state: SidebarState | undefined): string;
export declare function describeTemplateLine(state: SidebarState | undefined): string;
type ServerStatus = {
    name: string;
    status: {
        status: string;
    };
};
/**
 * A template is "custom" when the session pins servers, or when the runtime
 * disagrees with the template for a server that is currently loaded.
 */
export declare function isCustomized(store: TemplateStore, templateName: string, directory: string, sessionID: string | undefined, statuses: readonly ServerStatus[]): boolean;
export declare function activeTemplateFor(store: TemplateStore, directory: string): string;
export type SidebarHandle = {
    /** Recompute the line from the store and the runtime statuses. */
    refresh(): Promise<void>;
    /** Show `applying <name> …` until cleared. */
    setApplying(name: string | undefined): void;
    /** True while a template apply is settling. */
    isApplying(): boolean;
};
export type SidebarTheme = {
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
/**
 * Green marks a template that is applied as saved; yellow marks one that drifted
 * (a session pin, or the runtime disagreeing with the template).
 */
export declare function suffixColor(theme: SidebarTheme, state: SidebarState | undefined): string;
export declare function registerSidebar(context: TuiContext, rpc: McpClient): SidebarHandle;
export {};
