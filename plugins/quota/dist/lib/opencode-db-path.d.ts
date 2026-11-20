/**
 * OpenCode's SQLite database path, resolved the way OpenCode 2 does
 * (`packages/cli/src/database-path.ts`): `OPENCODE_DB` (absolute, or relative
 * to the data dir; `:memory:` passes through), else `<data dir>/opencode.db`.
 *
 * Credentials, sessions, and messages all live in this one database.
 */
export declare function getOpenCodeDbPath(): string;
