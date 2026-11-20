/**
 * Vilao balance client.
 *
 * Vilao has no quota windows: it holds a pay-as-you-go balance. The percentage is measured
 * against the last balance this machine saw rise, so a top-up starts a new baseline and usage
 * lowers the percentage from there. The state file keeps that baseline between runs.
 */
import { type CredentialRow } from "./opencode-auth.js";
import { type OpencodeRuntimeDirs } from "./opencode-runtime-paths.js";
export declare const VILAO_PAT_METADATA_KEY = "vilao_pat";
export type VilaoState = {
    version: 1;
    accountFingerprint: string;
    baselineCents: number;
    /** Balance seen on the previous successful read; a rise resets the baseline. */
    lastBalanceCents: number;
    updatedAt: number;
};
export type VilaoResult = {
    success: true;
    balanceCents: number;
    baselineCents: number;
    percentRemaining: number;
    statePath: string;
} | {
    success: false;
    error: string;
};
export type VilaoDependencies = {
    runtimeDirs?: OpencodeRuntimeDirs;
    readText?: (path: string) => Promise<string>;
    writeState?: (path: string, state: VilaoState) => Promise<void>;
    nowMs?: number;
};
/** Every Vilao login that holds a PAT. */
export declare function readVilaoPatLogins(): Promise<Array<{
    row: CredentialRow;
    pat: string;
}>>;
/** Reads the active Vilao balance, or null when no Vilao login holds a PAT. */
export declare function queryVilaoQuota(options?: {
    requestTimeoutMs?: number;
}, dependencies?: VilaoDependencies): Promise<Array<{
    pat: string;
    result: VilaoResult;
}>>;
export declare function getVilaoAuthDiagnostics(): Promise<{
    configured: boolean;
    authPaths: string[];
    statePath: string;
}>;
/** The balance in đồng, whole: "40,000 ₫". */
export declare function formatVilaoVnd(cents: number): string;
