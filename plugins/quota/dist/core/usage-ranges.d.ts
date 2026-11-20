export declare const USAGE_RANGES: readonly [{
    readonly range: "today";
    readonly label: "Today";
}, {
    readonly range: "24h";
    readonly label: "24 hours";
}, {
    readonly range: "7d";
    readonly label: "7 days";
}, {
    readonly range: "30d";
    readonly label: "30 days";
}, {
    readonly range: "90d";
    readonly label: "90 days";
}, {
    readonly range: "all";
    readonly label: "All time";
}, {
    readonly range: "session";
    readonly label: "This session";
}, {
    readonly range: "between";
    readonly label: "Between";
}];
export type UsageRange = (typeof USAGE_RANGES)[number]["range"];
export declare const DEFAULT_USAGE_RANGE: UsageRange;
/** The 4.x and 5.x token commands (`system.oldCommands`), each `/quota_usage` on its range. */
export declare const OLD_USAGE_COMMANDS: Readonly<Record<string, UsageRange>>;
export declare function usageRangeLabel(range: UsageRange): string;
type UsageArguments = {
    ok: true;
    range: UsageRange;
    from?: string;
    to?: string;
} | {
    ok: false;
    error: string;
};
/**
 * The range a `/quota_usage` command asks for: nothing is the default range, "between" takes
 * two dates in order.
 */
export declare function parseUsageArguments(text: string): UsageArguments;
export {};
