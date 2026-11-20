#!/usr/bin/env node
export declare function cliShouldRunMain(argv1?: string | undefined, modulePath?: string, resolvePath?: (filePath: string) => string): boolean;
/**
 * `show` and `status` read OpenCode's database through node:sqlite, and Node prints
 * "ExperimentalWarning: SQLite is an experimental feature..." when it loads. Hide only
 * that warning; every other warning still prints. Call before node:sqlite loads.
 */
export declare function hideSqliteExperimentalWarning(): void;
export declare function main(argv?: string[]): Promise<number>;
