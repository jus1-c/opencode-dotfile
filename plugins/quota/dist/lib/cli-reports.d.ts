/**
 * The reports behind `opencode-quota show` and `status`. The terminal command builds them
 * in its own process (`cli-show.ts`) and prints them.
 */
import { type ProviderSourceHost } from "../core/provider-source.js";
export type CliReport = {
    exitCode: number;
    stdout: string;
    stderr: string;
};
/**
 * `show`: live quota rows as text: per provider, a line per row with its reset, then a line for
 * its error. Exit 1 when no provider returned a row.
 */
export declare function buildCliShowText(host: ProviderSourceHost): Promise<CliReport>;
/**
 * `show --json`: the last known quota (the snapshot file OpenCode keeps) as export JSON; no
 * provider is asked. With a threshold, exit 1 when a percentage is below it and 2 when the
 * data is incomplete or has no percentage to compare.
 */
export declare function buildCliShowJson(params: {
    host: ProviderSourceHost;
    threshold?: number;
}): Promise<CliReport>;
/**
 * `status`: the Quota Status report as text, or its payload as JSON. With JSON, exit 2 when
 * no provider produced comparable data.
 */
export declare function buildCliStatus(params: {
    host: ProviderSourceHost;
    providerId?: string;
    json: boolean;
}): Promise<CliReport>;
