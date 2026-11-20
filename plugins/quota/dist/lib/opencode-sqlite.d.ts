export interface SqliteConn {
    all<T = unknown>(sql: string, params?: unknown[]): T[];
    get<T = unknown>(sql: string, params?: unknown[]): T | null;
    close(): void;
}
/**
 * Open OpenCode's SQLite database read-only.
 * Inside OpenCode 2 (Bun) this uses bun:sqlite; the Node CLI uses node:sqlite.
 */
export declare function openOpenCodeSqliteReadOnly(dbPath: string): Promise<SqliteConn>;
