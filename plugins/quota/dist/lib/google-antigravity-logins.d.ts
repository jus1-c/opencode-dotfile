import type { CredentialRow } from "./opencode-auth.js";
/**
 * The Antigravity logins among the `google` rows of `rows`. A login OpenCode returned is judged
 * by the companion's rule; once it is an Antigravity login, its connection id stays one for as
 * long as the connection exists in this process, even when OpenCode can no longer return it or
 * its account later leaves the pool.
 *
 * Limit: the companion also counts an `oauth` login as its own when the login has a saved
 * per-connection account binding. That binding is in the companion's private storage, which this
 * plugin does not read; keeping a login once seen in the pool covers the case where the companion
 * binds a login and later drops the account from the pool, but not a login that was bound
 * without ever being in the pool while this process ran.
 */
export declare function findAntigravityGoogleLogins(rows: readonly CredentialRow[]): Promise<Set<CredentialRow>>;
/** Test helper: forgets which connections were Antigravity logins, and the pool file read. */
export declare function clearAntigravityLoginMemoryForTests(): void;
