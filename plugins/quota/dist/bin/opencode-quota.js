#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const USAGE = [
    "Usage:",
    "  npx @slkiser/opencode-quota show [--provider <provider-id>] [--json] [--threshold <pct>]",
    "  npx @slkiser/opencode-quota status [--provider <provider-id>] [--json]",
    "  npx @slkiser/opencode-quota --help",
    "",
    "Commands:",
    "  show    Print a quick quota glance",
    "          --json               Machine-readable JSON output (reads from cache)",
    "          --threshold <pct>    With --json, exit 1 if below <pct>%, 2 if incomplete/not comparable",
    "          --provider <id>      Filter to one provider",
    "  status  Print Quota Status diagnostics (same data as /quota_status)",
    "          --json               Machine-readable JSON output",
    "          --provider <id>      Filter to one provider",
].join("\n");
function printUsage() {
    console.log(USAGE);
}
function resolveCliPath(filePath) {
    try {
        return realpathSync.native(filePath);
    }
    catch {
        return resolve(filePath);
    }
}
export function cliShouldRunMain(argv1 = process.argv[1], modulePath = fileURLToPath(import.meta.url), resolvePath = resolveCliPath) {
    if (!argv1) {
        return false;
    }
    return resolvePath(modulePath) === resolvePath(argv1);
}
/**
 * `show` and `status` read OpenCode's database through node:sqlite, and Node prints
 * "ExperimentalWarning: SQLite is an experimental feature..." when it loads. Hide only
 * that warning; every other warning still prints. Call before node:sqlite loads.
 */
export function hideSqliteExperimentalWarning() {
    const emitWarning = process.emitWarning;
    process.emitWarning = ((warning, ...rest) => {
        if (typeof warning === "string" &&
            rest[0] === "ExperimentalWarning" &&
            warning.startsWith("SQLite is an experimental feature")) {
            return;
        }
        return emitWarning.call(process, warning, ...rest);
    });
}
export async function main(argv = process.argv.slice(2)) {
    const [command, ...rest] = argv;
    if (!command) {
        printUsage();
        return 1;
    }
    if (command === "--help" || command === "-h" || command === "help") {
        printUsage();
        return 0;
    }
    if (command === "show") {
        const { runCliShowCommand } = await import("../lib/cli-show.js");
        return await runCliShowCommand({ argv: rest });
    }
    if (command === "status") {
        const { runCliStatusCommand } = await import("../lib/cli-show.js");
        return await runCliStatusCommand({ argv: rest });
    }
    printUsage();
    return 1;
}
if (cliShouldRunMain()) {
    hideSqliteExperimentalWarning();
    void main().then((code) => {
        process.exitCode = code;
    });
}
//# sourceMappingURL=opencode-quota.js.map