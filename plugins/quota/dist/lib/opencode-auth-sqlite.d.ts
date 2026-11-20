/**
 * The terminal command's read-only login reader
 *
 * `opencode-quota show` and `status` bind this source while one report runs, so they work
 * with OpenCode closed. It is the only code that queries OpenCode's `credential` table. It
 * never refreshes or writes a login: a sign-in whose token expired stays expired here until
 * OpenCode refreshes it. The server plugin and the TUI must never import this file
 * (`tests/tui-dist-import-graph.test.ts`).
 */
import { type CredentialSource } from "./opencode-auth.js";
/**
 * Logins from OpenCode's database, in database order (active first, then most recently
 * updated), not in request order. The database path is resolved on every read, so
 * `OPENCODE_DB` and `XDG_DATA_HOME` apply. Any read error means no logins.
 */
export declare function createSqliteCredentialSource(): CredentialSource;
