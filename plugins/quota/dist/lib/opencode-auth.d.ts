/**
 * OpenCode login reader
 *
 * Reads OpenCode 2 logins through the bound credential source. The server
 * plugin binds its integration API (`ctx.integration`) in `setup`; the terminal
 * command binds the read-only database reader in `opencode-auth-sqlite.ts`
 * while one report runs; the TUI binds nothing, so a read there finds no login.
 * Every read names the integration ids it needs, so OpenCode resolves (and may
 * refresh) only those logins.
 */
import type { Plugin } from "@opencode/plugin";
export type CredentialRow = {
    id: string;
    integrationId: string;
    label: string;
    /**
     * Whether OpenCode uses this login. The integration source marks, per
     * integration id, the connection `connection.active(integrationId)` reports;
     * the database reader marks the database's active row.
     */
    active: boolean;
    value: Record<string, unknown>;
    /**
     * Why OpenCode could not return this login (for example a failed token
     * refresh), as `<category>: <scrubbed detail>`. A failed row keeps its id,
     * label and position, but its `value` is only `{ type: "api" | "oauth" | "external" }`;
     * consumers show `resolveError` as a per-account error.
     */
    resolveError?: string;
};
/**
 * The OpenCode 2 connection methods a read can ask for: a stored API key or an OAuth
 * sign-in. OpenCode's third method, `external` (an AWS profile, Azure CLI or gcloud
 * login), keeps its secrets outside OpenCode, so no read asks for it.
 */
export type CredentialMethod = "key" | "oauth";
type ReadCredentialRowsOptions = {
    /** Keep only connections using one of these methods; checked before OpenCode resolves them. */
    methods?: readonly CredentialMethod[];
    /** Read only the active connection of each integration id. */
    firstOnly?: boolean;
};
type CredentialReadRequest = ReadCredentialRowsOptions & {
    integrationIds: readonly string[];
};
export type CredentialSourceKind = "opencode-integration-api" | "sqlite";
/**
 * Where logins come from. The two production sources: `ctx.integration` in the
 * server plugin, and the terminal command's read-only reader of OpenCode's database.
 */
export type CredentialSource = {
    kind: CredentialSourceKind;
    readRows(request: CredentialReadRequest): Promise<CredentialRow[]>;
};
/** The parts of the server plugin's `ctx.integration` the reader uses. */
type CredentialIntegration = Pick<Plugin.Context["integration"], "list" | "connection">;
type CredentialFailureCategory = "refresh_failed" | "resolve_empty" | "active_failed";
type CredentialFailure = {
    at: number;
    category: CredentialFailureCategory;
    detail: string;
    integrationId: string;
    label: string;
};
export type CredentialSourceDiagnostics = ({
    state: "bound";
    kind: CredentialSourceKind;
} | {
    state: "unbound";
}) & {
    lastListError?: {
        at: number;
        detail: string;
    };
    failures: Array<CredentialFailure & {
        connectionId: string;
    }>;
};
export declare function formatCredentialDisplayNames(providerName: string, credentials: ReadonlyArray<{
    row: CredentialRow;
    fallbackName: string;
    numberUnnamed?: boolean;
}>): string[];
/**
 * The database OpenCode keeps its logins in: the one resolved path, or none
 * when `OPENCODE_DB` is `:memory:`. Inside OpenCode it is for diagnostics only
 * (logins are read through OpenCode); the terminal command reads its logins
 * from this file.
 */
export declare function getCredentialDatabasePaths(): string[];
/**
 * Makes `source` the one reads use until the returned function unbinds it.
 * Unbinding removes only this binding; the last binding still bound wins.
 */
export declare function bindCredentialSource(source: CredentialSource): () => void;
/** Drops cached logins, failed-login entries and the last `list()` error. */
export declare function notifyCredentialsChanged(): void;
export declare function getCredentialSourceDiagnostics(): CredentialSourceDiagnostics;
/** The credential source backed by the server plugin's `ctx.integration`. */
export declare function createIntegrationCredentialSource(integration: CredentialIntegration): CredentialSource;
/**
 * The first row of each integration id, in order. Rows come active first, so these are the
 * logins OpenCode uses.
 */
export declare function activeCredentialRows(rows: readonly CredentialRow[]): CredentialRow[];
/**
 * An OAuth sign-in read from its credential row. `failed`: OpenCode could not return it (see
 * `CredentialRow.resolveError`). Otherwise its tokens (trimmed; none when blank or not text),
 * its expiry (a finite number), and every field as stored, for the fields one vendor knows.
 */
export type OAuthLogin = {
    state: "failed";
    error: string;
} | {
    state: "signed-in";
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    fields: Readonly<Record<string, unknown>>;
};
/** The OAuth sign-in a row holds; null for a row of another method. */
export declare function readOAuthLogin(row: CredentialRow): OAuthLogin | null;
/**
 * Credential rows of the requested integration ids from the last bound source.
 * Row order depends on the source: the integration API returns request-id
 * order, then OpenCode's connection order (active first, then newest); the
 * database reader returns database order. With no bound source (the TUI) there
 * are none.
 */
export declare function readCredentialRows(integrationIds: readonly string[], options?: ReadCredentialRowsOptions): Promise<CredentialRow[]>;
/**
 * Collapse credential rows that represent the same upstream connection.
 *
 * Rows holding identical credential values are the same connection (e.g. the
 * same workspace key stored under the `opencode-go` integration and its legacy
 * `opencode` alias), and rows under `primaryIntegrationId` take precedence over
 * alias rows so a real credential for another integration that shares the key
 * is not reported as an additional connection. A failed row holds only
 * `{ type }`, so its connection id keeps each failed login a row of its own.
 * Input order is preserved otherwise.
 */
export declare function selectConnectionCredentialRows(rows: readonly CredentialRow[], primaryIntegrationId: string): CredentialRow[];
/**
 * The active login of each requested integration id (a `firstOnly` read), cached for
 * `maxAgeMs`: per-question hooks read often, and login changes still show quickly.
 */
export declare function readActiveCredentialRowsCached(params: {
    maxAgeMs: number;
    integrationIds: readonly string[];
    methods?: readonly CredentialMethod[];
}): Promise<CredentialRow[]>;
export declare function clearCredentialRowCacheForTests(): void;
export {};
