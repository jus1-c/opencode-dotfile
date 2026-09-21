import { type OpencodeRuntimeDirs } from "./opencode-runtime-paths.js";
import type { QuotaError } from "./types.js";
export declare const VILAO_PAT_METADATA_KEY = "vilao_pat";
type VilaoState = {
    version: 1;
    accountFingerprint: string;
    baselineCents: number;
    updatedAt: number;
};
export type VilaoQuotaResult = {
    success: true;
    balance: number;
    baseline: number;
    percentRemaining: number;
    statePath: string;
} | QuotaError | null;
type VilaoDependencies = {
    runtimeDirs?: OpencodeRuntimeDirs;
    readText?: (path: string) => Promise<string>;
    writeState?: (path: string, state: VilaoState) => Promise<void>;
    nowMs?: number;
};
export declare function formatVilaoVnd(value: number): string;
export declare function queryVilaoQuota(options?: {
    requestTimeoutMs?: number;
}, dependencies?: VilaoDependencies): Promise<VilaoQuotaResult>;
export declare function hasVilaoPat(): Promise<boolean>;
export declare function getVilaoCacheIdentity(): Promise<string | undefined>;
export declare function getVilaoAuthDiagnostics(): Promise<{
    configured: boolean;
    authPaths: string[];
    statePath: string;
}>;
export {};
//# sourceMappingURL=vilao.d.ts.map