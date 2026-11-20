export declare function dedupeNonEmptyStrings(items: string[]): string[];
export declare function findGitWorktreeRoot(startDir: string): string | null;
/** Reads the package spec from a legacy `plugin` entry or an OpenCode 2 native `plugins` entry. */
export declare function getPluginSpecFromEntry(entry: unknown): string | null;
export declare function extractPluginSpecsFromParsedConfig(parsed: unknown): string[];
export declare function extractProviderIdsFromParsedConfig(parsed: unknown): string[];
