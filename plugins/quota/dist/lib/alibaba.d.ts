/** Alibaba Token Plan and Coding Plan quota from the official `bl` CLI. Console auth belongs to the
 * CLI: this module never installs `bl`, logs in, reads credential stores or uses a shell. */
import type { ErrorFacts } from "../core/errors.js";
export declare const ALIBABA_TOKEN_PLAN_ARGS: readonly ["usage", "token-plan", "--output", "json"];
/** The units the CLI's field names use. */
export type AlibabaTokenPlanUnit = "Hour" | "Day" | "Week" | "Month";
/** One quota window the CLI reported: its own name (`per1Month`), its count and its unit. */
export type AlibabaTokenPlanWindow = {
    key: string;
    count: number;
    unit: AlibabaTokenPlanUnit;
    /** 0..100 of the window still left; absent when the CLI reported no usage ratio for it. */
    percentRemaining?: number;
    resetTimeIso?: string;
};
/** One `NORMAL` team seat; every field is optional in the CLI's reply, so each is guarded alone. */
export type AlibabaTokenPlanSeat = {
    name: string;
    /** `CycleSurplusValue`, full precision. */
    surplus?: number;
    total?: number;
    /** 0..100 of the cycle still left; only when the cycle granted a positive total. */
    percentRemaining?: number;
    used?: number;
    resetsAt?: string;
    startedAt?: string;
};
export type AlibabaTokenPlanSeatResult = {
    ok: true;
    seats: AlibabaTokenPlanSeat[];
} | AlibabaFailure;
export type AlibabaErrorKind = "unsupported_platform" | "executable_not_found" | "shell_launcher_rejected" | "workspace_path_rejected" | "spawn_failed" | "timeout" | "output_truncated" | "nonzero_exit" | "not_authenticated" | "seat_not_authenticated" | "seat_command_failed" | "seat_invalid_schema" | "coding_plan_command_failed" | "coding_plan_invalid_schema" | "invalid_json" | "invalid_schema";
type AlibabaTokenPlanError = {
    kind: AlibabaErrorKind;
    message: string;
    facts?: ErrorFacts;
};
type AlibabaFailure = {
    ok: false;
    error: AlibabaTokenPlanError;
};
export type AlibabaTokenPlanClosedResult = {
    ok: true;
    /** Every window the reply carried, in the order the CLI wrote them. */
    windows: AlibabaTokenPlanWindow[];
    /** The CLI's own flag: whether any window carried a usage ratio. Absent when the CLI is
     * older than bailian-cli 2.7.1 and sends no flag. */
    hasQuotaData?: boolean;
} | AlibabaFailure;
/** One Coding Plan window: the requests used, the limit, the percent left and when it resets. */
export type AlibabaCodingPlanWindow = {
    used: number;
    limit: number;
    percentRemaining: number;
    resetTimeIso?: string;
};
export type AlibabaCodingPlanUsage = {
    fiveHour?: AlibabaCodingPlanWindow;
    weekly?: AlibabaCodingPlanWindow;
    monthly?: AlibabaCodingPlanWindow;
};
type AlibabaCodingPlanResult = {
    ok: true;
    usage?: AlibabaCodingPlanUsage;
} | AlibabaFailure;
export type AlibabaTokenPlanSpawnRequest = {
    file: string;
    args: readonly string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
    stdoutLimitBytes: number;
    stderrLimitBytes: number;
    stdin: "ignore";
    shell: false;
    killGraceMs: number;
};
type AlibabaTokenPlanSpawnResult = {
    /** stdout held a whole document, so the exit code was never waited for. */
    complete?: true;
    code: number | null;
    stdout: Buffer;
    stderr: Buffer;
    timedOut: boolean;
    truncated: boolean;
    spawnErrorCode?: string;
};
type AlibabaTokenPlanExecutableResolution = {
    ok: true;
    file: string;
    /** Set when `file` is `node`: `[entry]`, the shim package's entry, run before the command's
     * own arguments. */
    args?: readonly string[];
} | AlibabaFailure;
type AlibabaTokenPlanRuntime = {
    platform?: NodeJS.Platform;
    pathEnv?: string;
    cwd: string;
    tmpdir?: string;
    homedir?: string;
    env?: NodeJS.ProcessEnv;
    spawn?: (request: AlibabaTokenPlanSpawnRequest) => Promise<AlibabaTokenPlanSpawnResult>;
};
export declare const ERROR_MESSAGES: Record<AlibabaErrorKind, string>;
/** A reply without a usage ratio. The CLI says the limit may be unlimited, so the hint says so in
 * OpenCode Quota's own words. */
export declare const NO_QUOTA_DATA_HINT = "no quota data in the reply; the limit may be unlimited, so verify in the Bailian Token Plan console";
/** A reply with a ratio for some windows only: the windows in `no_data_windows` have no row. */
export declare const NO_WINDOW_DATA_HINT = "no quota data for the windows in no_data_windows, so they have no row; their limit may be unlimited, so verify in the Bailian Token Plan console";
export declare function isAlibabaTokenPlanSupportedPlatform(platform?: NodeJS.Platform): boolean;
export declare function resolveAlibabaTokenPlanExecutable(params: {
    pathEnv?: string;
    cwd: string;
    homedir?: string;
    platform?: NodeJS.Platform;
}): Promise<AlibabaTokenPlanExecutableResolution>;
export declare function parseAlibabaTokenPlanUsageJson(text: string): AlibabaTokenPlanClosedResult;
/** `{ per5Hour, perWeek, perBillMonth }`. `{}` is the CLI's "this account has no Coding Plan" and
 * stays a silent absence; a window the plan does not cover has no quota and no row. */
export declare function parseAlibabaCodingPlanUsageJson(text: string): AlibabaCodingPlanResult;
/**
 * Run the CLI without a shell or a Windows console window, with stdin ignored and stdout/stderr
 * capped. A timeout or an overflow sends SIGTERM to the process group, then SIGKILL after
 * `killGraceMs`.
 */
export declare function runAlibabaTokenPlanProcess(request: AlibabaTokenPlanSpawnRequest): Promise<AlibabaTokenPlanSpawnResult>;
export declare const USAGE_SPAWN_KINDS: {
    readonly auth: "not_authenticated";
    readonly nonzero: "nonzero_exit";
};
/** The Coding Plan reads the same console session as the personal plan, so exit 3 means the same. */
export declare const CODING_PLAN_SPAWN_KINDS: {
    readonly auth: "not_authenticated";
    readonly nonzero: "coding_plan_command_failed";
};
export declare function parseAlibabaTokenPlanSeatsJson(text: string): AlibabaTokenPlanSeatResult;
/** The kinds a command's own failures report: exit 3 names the credential that command needs. */
export type AlibabaSpawnKinds = {
    auth: AlibabaErrorKind;
    nonzero: AlibabaErrorKind;
};
type AlibabaReply = {
    ok: true;
    text: string;
} | AlibabaFailure;
/** A failure envelope inside a successful stdout is left to the command's own parser. */
export declare function queryAlibabaReply(options: {
    args: readonly string[];
    kinds: AlibabaSpawnKinds;
    requestTimeoutMs?: number;
    runtime: AlibabaTokenPlanRuntime;
}): Promise<AlibabaReply>;
/** The masked credential markers `bl auth status` reports, each `null` when absent so it cannot
 * collide with a present credential. `bl` already masks them; they never reach a user, log or
 * export. */
export type AlibabaCredentialMarkers = {
    consoleMasked: string | null;
    apiKeyMasked: string | null;
    openapiAccessKeyId: string | null;
};
/** A half whose credential block is absent was never set up, so it is left out entirely: no rows,
 * no errors, no backoff. A block `bl` reports is a set-up session, expired or not, so its failure is
 * real; a failed read reports both halves, since absence cannot be told from failure there. */
export declare function alibabaCredentialHalves(markers: AlibabaCredentialMarkers | null): {
    console: boolean;
    openapi: boolean;
};
/** The markers `bl auth status` reports, read through the same machinery as the quota commands. One
 * read is reused for ALIBABA_TOKEN_PLAN_IDENTITY_TTL_MS and a mid-flight caller joins it. A `fresh`
 * caller joins nothing and starts its own read: a fetch reads its markers after its commands, so an
 * earlier read cannot hide a switch made while they ran, and the store's re-check reuses them. */
export declare function resolveAlibabaIdentity(options: {
    requestTimeoutMs?: number;
    runtime: AlibabaTokenPlanRuntime;
    fresh?: boolean;
}): Promise<AlibabaCredentialMarkers | null>;
export declare function clearAlibabaIdentityCacheForTests(): void;
/** The team seats, one page at a time. `Total` counts every status, so the loop compares the raw
 * item count against it; a reply without `Total` stops on a short page. */
export declare function queryAlibabaTokenPlanSeats(options: {
    requestTimeoutMs?: number;
    runtime: AlibabaTokenPlanRuntime;
}): Promise<AlibabaTokenPlanSeatResult>;
export {};
