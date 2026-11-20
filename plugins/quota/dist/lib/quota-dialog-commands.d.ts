/**
 * The /quota_status report of the slash command, the `quota_status` tool, the TUI and
 * `opencode-quota status`, and the quota lines of `opencode-quota show`. Each reads the server
 * settings the host holds now.
 */
import { type ProviderSourceHost } from "../core/provider-source.js";
import type { QuotaSnapshot, SessionModel } from "../core/types.js";
import type { V5Conversion } from "../settings/index.js";
import { type QuotaStatusReport, type StatusOrigin } from "./quota-status.js";
/**
 * The quota lines `opencode-quota show` prints, in the snapshot's words: a line per row (with
 * "runs out in …" when the quota runs out before its reset), a line per provider problem, then the session's
 * tokens when the snapshot has them.
 */
export declare function quotaReportLines(snapshot: QuotaSnapshot, nowMs: number): string[];
/**
 * A fresh check of every enabled and available provider (or only `providerId`), through a
 * store of its own that keeps nothing: the same providers, rows, errors and debug details the
 * plugin's store would hold.
 */
export declare function checkProviders(host: ProviderSourceHost, providerId?: string): Promise<QuotaSnapshot>;
/**
 * The Quota Status report of /quota_status, the `quota_status` tool, the TUI Plugin tab and
 * `opencode-quota status`: the settings read once, every known provider (or only
 * `onlyProviderId`) checked fresh, then the text and the `status --json` payload made from
 * the same facts.
 */
export declare function statusReport(host: ProviderSourceHost, options: {
    origin: StatusOrigin;
    /** OpenCode's version and release channel; the CLI runs without OpenCode. */
    opencode?: {
        version: string;
        channel: string;
    };
    /** The session's model; undefined without a session. */
    sessionModel?: SessionModel;
    /** The v5 settings conversion this server wrote when it started. */
    conversion?: V5Conversion;
    /** Only this provider is listed and checked. */
    onlyProviderId?: string;
    nowMs: number;
}): Promise<QuotaStatusReport>;
