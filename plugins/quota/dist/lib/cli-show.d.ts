import type { ProviderSourceHost } from "../core/provider-source.js";
import type { QuotaProviderContext } from "./entries.js";
interface RunCliCommandOptions {
    argv?: string[];
    cwd?: string;
    stdout?: Pick<NodeJS.WriteStream, "write">;
    stderr?: Pick<NodeJS.WriteStream, "write">;
    /** The registered providers; `getProviders()` when absent. */
    providers?: ProviderSourceHost["providers"];
}
/**
 * OpenCode's provider list without OpenCode: its config files that count for `directory`, plus
 * the CLI logins.
 */
export declare function createCliQuotaClient(params: {
    directory: string;
    anthropicBinaryPath: string;
}): QuotaProviderContext["client"];
export declare function runCliShowCommand(options?: RunCliCommandOptions): Promise<number>;
/** `status`: the same Quota Status diagnostics as /quota_status, without OpenCode. */
export declare function runCliStatusCommand(options?: RunCliCommandOptions): Promise<number>;
export {};
