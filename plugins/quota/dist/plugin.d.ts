/**
 * OpenCode V2 server plugin: quota slash commands for Web and Desktop, a diagnostics tool, and
 * the quota RPC that serves the quota snapshot, the Home notice line, active notices and reports
 * to the TUI. It reads the server settings (settings.jsonc, converted from v5 once) and follows
 * every change to them.
 * It also writes the export file and the OpenTelemetry gauges from each snapshot. Inside
 * OpenCode, logins are read only here, through OpenCode's integration API.
 */
import { Plugin } from "@opencode/plugin";
import { type ProviderSourceHost } from "./core/provider-source.js";
/** The server plugin; `providers` replaces the registered providers (tests pass their own). */
export declare function createQuotaServerPlugin(options?: {
    providers?: ProviderSourceHost["providers"];
}): Plugin.Plugin;
export declare const QuotaToastPlugin: Plugin.Plugin;
export default QuotaToastPlugin;
