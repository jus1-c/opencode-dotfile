/**
 * The `/quota` text of Web and Desktop: the quotas next to what OpenCode's own history used.
 * Pure. One block per provider: a provider OpenCode used gets its cost and, when quota checks it
 * too, its limits; a quota provider OpenCode did not use gets only its limits.
 * `quotaProviderIdsOfUsage` matches the two.
 */
import type { QuotaSnapshot } from "../core/types.js";
import { type UsageRange } from "../core/usage-ranges.js";
import type { UsageReport } from "../core/usage.js";
import { type RowSettings } from "./select.js";
/** The range of the usage `/quota` shows. */
export declare const DEFAULT_QUICK_LOOK_RANGE: Exclude<UsageRange, "between">;
type QuickLookTextInput = {
    snapshot: QuotaSnapshot | undefined;
    usage: UsageReport | undefined;
    settings: RowSettings;
    nowMs: number;
    /** The columns a line may take; without it lines are as long as they get. */
    width?: number;
};
/**
 * The matching table: the quota providers an OpenCode provider id (a model's `providerID`,
 * like "github-copilot" or "zai-coding-plan") stands for. The id itself (a custom provider
 * named after it), then every quota provider that lists it among its OpenCode ids.
 */
export declare function quotaProviderIdsOfUsage(usageProviderID: string): string[];
/**
 * The short text: the range and totals, then one line per provider with its limits and its
 * cost. Pace words show when the quota runs out before its reset. With `width`, a line that
 * would be wider goes on under itself, never inside an amount or a limit.
 */
export declare function quickLookText(input: QuickLookTextInput): string;
export {};
