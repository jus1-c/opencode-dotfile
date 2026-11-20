import type { CheckForExport } from "../core/store.js";
import type { QuotaSnapshot } from "../core/types.js";
import type { AccountResult } from "../providers/contract.js";
import type { QuotaExport, QuotaExportProvider } from "./quota-export-types.js";
import { type QuotaProviderDefinition } from "./quota-providers.js";
/**
 * Resolves the export file path from a configured value.
 *
 * - Empty string → XDG cache default: `$XDG_CACHE_HOME/opencode/quota-export.json`
 * - Starts with `~/` → expands `~` to `homedir()`
 * - Starts with `~\` → expands `~` and treats backslashes as path separators
 * - Otherwise → returns as-is (caller is responsible for absolute paths)
 */
export declare function resolveExportPath(configured: string): string;
/**
 * A provider's part of the export file from one check: this check's rows as the snapshot
 * shows them, or its error. The custom providers also list each definition, from this check's
 * `accounts`.
 */
export declare function exportProviderFromCheck(params: CheckForExport & {
    providerId: string;
    label: string;
    customDefinitions: readonly QuotaProviderDefinition[];
    accounts: readonly AccountResult[];
}): QuotaExportProvider;
/** Builds the export document from the quota snapshot; no provider is asked again. */
export declare function buildQuotaExportFromSnapshot(snapshot: QuotaSnapshot, nowMs?: number): QuotaExport;
/**
 * Writes a `QuotaExport` document atomically to disk.
 *
 * Errors are re-thrown — callers are responsible for catching and logging them.
 */
export declare function writeQuotaExport(exportData: QuotaExport, resolvedPath: string): Promise<void>;
