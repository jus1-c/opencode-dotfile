/**
 * On OpenCode 2, quota slash commands from Web and Desktop post their report into the chat as
 * a user message that never starts a model turn. These helpers write the /quota report and
 * mark every such message, so the server plugin can keep it out of every model request.
 */
import type { QuotaSnapshot } from "../core/types.js";
import type { UsageReport } from "../core/usage.js";
import type { Notice } from "../rpc.js";
/** Metadata key on every quota report message. OpenCode stores message metadata with the message. */
export declare const QUOTA_REPORT_METADATA_KEY = "opencodeQuota";
export type QuotaReportMetadata = {
    command: string;
    at: number;
};
export declare function formatQuotaReportMessage(report: string): string;
export declare function containsQuotaReport(text: string): boolean;
/** Cuts every complete quota report, first to last line, out of the text. */
export declare function removeQuotaReports(text: string): string;
/**
 * The limits of every provider as the /quota report of Web and Desktop writes them, without its
 * usage and notices: what the TUI's Limits tab copies. Like that tab, it ignores
 * `onlyCurrentModel`.
 */
export declare function quotaLimitsText(snapshot: QuotaSnapshot, nowMs: number): string;
/**
 * The /quota report of Web and Desktop: the short text of `view/quick-look.ts` for every
 * provider, then all active notices.
 */
export declare function quotaMessageText(params: {
    snapshot: QuotaSnapshot;
    usage: UsageReport | undefined;
    notices: Notice[];
    nowMs: number;
}): string;
