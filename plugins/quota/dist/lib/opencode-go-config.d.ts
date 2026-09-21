export interface OpenCodeGoConfig {
    workspaceId: string;
    authCookie: string;
}
export type ResolvedOpenCodeGoConfig = {
    state: "none";
} | {
    state: "configured";
    config: OpenCodeGoConfig;
    source: string;
} | {
    state: "incomplete";
    source: string;
    missing: string;
} | {
    state: "invalid";
    source: string;
    error: string;
};
export interface OpenCodeGoConfigDiagnostics {
    state: ResolvedOpenCodeGoConfig["state"];
    source: string | null;
    missing: string | null;
    error: string | null;
    checkedPaths: string[];
}
export declare function resolveOpenCodeGoConfigFromEnv(env?: NodeJS.ProcessEnv): ResolvedOpenCodeGoConfig | null;
export declare function resolveOpenCodeGoConfig(): Promise<ResolvedOpenCodeGoConfig>;
declare const DEFAULT_CACHE_MAX_AGE_MS = 30000;
export { DEFAULT_CACHE_MAX_AGE_MS as DEFAULT_OPENCODE_GO_CONFIG_CACHE_MAX_AGE_MS };
export declare function resolveOpenCodeGoConfigCached(params?: {
    maxAgeMs?: number;
}): Promise<ResolvedOpenCodeGoConfig>;
export declare function getOpenCodeGoConfigDiagnostics(): Promise<OpenCodeGoConfigDiagnostics>;
//# sourceMappingURL=opencode-go-config.d.ts.map