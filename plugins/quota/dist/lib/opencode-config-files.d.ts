export type ConfigFileFormat = "json" | "jsonc";
export interface EditableConfigPath {
    path: string;
    format: ConfigFileFormat;
    existed: boolean;
}
/** One config file that exists and parses to an object. */
export interface OpenCodeConfigDocument {
    path: string;
    config: Record<string, unknown>;
}
/** Shares lazy config reads within one pass; `fresh` starts an independent read scope. */
export declare function withOpenCodeConfigReadScope<T>(read: () => Promise<T>, { fresh }?: {
    fresh?: boolean;
}): Promise<T>;
/**
 * The OpenCode config files that count for a session in `directory`, lowest priority first.
 * They may not exist.
 */
export declare function openCodeConfigFiles(directory: string): string[];
/** The config files that count for `directory` and exist, lowest priority first. */
export declare function existingOpenCodeConfigFiles(directory: string): string[];
/**
 * OpenCode config text as OpenCode parses it: comments and trailing commas are allowed in both
 * kinds. Null when it does not parse or is not an object; OpenCode then ignores the file.
 */
export declare function parseOpenCodeConfig(text: string): Record<string, unknown> | null;
/**
 * The config files that count for `directory`, read and parsed, lowest priority first. A file
 * that is missing, unreadable or does not parse is left out.
 */
export declare function readOpenCodeConfigs(directory: string): Promise<OpenCodeConfigDocument[]>;
/**
 * The global file OpenCode writes its own settings to: opencode.jsonc when it is a file, else
 * opencode.json when it is one, else a new opencode.jsonc.
 */
export declare function globalConfigWriteTarget(): EditableConfigPath;
