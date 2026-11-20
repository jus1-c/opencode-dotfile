interface CursorAuthPresence {
    state: "missing" | "present" | "invalid";
    selectedPath?: string;
    presentPaths: string[];
    candidatePaths: string[];
    error?: string;
}
interface CursorOpenCodeIntegration {
    pluginEnabled: boolean;
    providerConfigured: boolean;
    matchedPaths: string[];
    checkedPaths: string[];
}
export declare const CURSOR_CANONICAL_PLUGIN_PACKAGE = "cursor-opencode-provider";
export declare function inspectCursorAuthPresence(): Promise<CursorAuthPresence>;
/**
 * Whether an OpenCode config file that counts for a session in `directory` loads Cursor's
 * plugin or declares its provider. Files that do not parse are left out.
 */
export declare function inspectCursorOpenCodeIntegration(directory: string): Promise<CursorOpenCodeIntegration>;
export {};
