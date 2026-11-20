type ResolvedMimoConfig = {
    state: "none";
} | {
    state: "configured";
    config: {
        cookie: string;
    };
    source: string;
} | {
    state: "invalid";
    source: string;
    error: string;
};
interface MimoConfigDiagnostics {
    state: ResolvedMimoConfig["state"];
    source: string | null;
    error: string | null;
    checkedPaths: string[];
}
export declare const DEFAULT_MIMO_CONFIG_CACHE_MAX_AGE_MS = 30000;
export declare function resolveMimoConfigCached(params?: {
    maxAgeMs?: number;
}): Promise<ResolvedMimoConfig>;
export declare function getMimoConfigDiagnostics(): Promise<MimoConfigDiagnostics>;
export {};
