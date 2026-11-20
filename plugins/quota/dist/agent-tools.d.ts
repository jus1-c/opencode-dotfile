import { type LiveSettings } from "./settings/index.js";
type QuotaAgentToolsHost = {
    /** The providers OpenCode serves now; a custom provider shows only when its providerId is one. */
    openCodeProviderIds(): Promise<readonly string[]>;
    /** The folder OpenCode runs the session in; OpenCode's config files that count start here. */
    locationDirectory: string;
    /** The settings the server holds; an edit through them is in use when it resolves. */
    settings: Pick<LiveSettings, "current" | "edit" | "editFile">;
};
/** A tool as `ctx.tool.transform(editor => editor.add(tool))` takes it. */
type QuotaAgentTool = {
    name: string;
    description: string;
    input: {
        type: "object";
        properties: Record<string, {
            type: string;
            description: string;
        }>;
        required?: string[];
        additionalProperties: false;
    };
    execute(input: unknown): Promise<{
        content: string;
    }>;
};
export declare function quotaAgentTools(host: QuotaAgentToolsHost): QuotaAgentTool[];
export {};
