/**
 * The row contract providers return: per account, its rows (keyed like `five_hour`) and its
 * errors, plus debug details for /quota_status. `core/rows.ts` turns a result into v6 rows by
 * adding each row's id, provider and account.
 */
import type { ErrorFacts } from "../core/errors.js";
import type { Amount, DebugDetail, QuotaRow, QuotaWindow } from "../core/types.js";
import { type CredentialRow } from "../lib/opencode-auth.js";
/** One row as a provider reports it; `key` is the part of the row id after the provider id. */
export type ProviderRow = Omit<QuotaRow, "id" | "providerId" | "account"> & {
    key: string;
};
export type FetchError = {
    message: string;
    facts?: ErrorFacts;
};
/**
 * One account's rows and errors. `name` is its display name, for example
 * "[Claude Work] (active)" or "Copilot (pro)": the rows take their account from it, and it
 * labels the errors in debug details. `login` is the OpenCode login the rows came from.
 */
export type AccountResult = {
    name: string;
    login?: string;
    rows: ProviderRow[];
    errors: FetchError[];
};
/** `attempted` is false when the provider had nothing to query (it is not set up). `empty` is an
 * answer that there is nothing to show: it clears the last rows without an error. */
export type ProviderFetchResult = {
    attempted: boolean;
    accounts: AccountResult[];
    debug: DebugDetail[];
    empty?: true;
};
/** A row key part from provider text: lower case, `_` for anything else ("Claude/GPT" → "claude_gpt"). */
export declare function keySlug(text: string): string;
export declare const FIVE_HOUR: {
    readonly key: "five_hour";
    readonly label: "5h";
    readonly window: "five_hour";
};
export declare const WEEKLY: {
    readonly key: "weekly";
    readonly label: "Weekly";
    readonly window: "week";
};
export declare const MONTHLY: {
    readonly key: "monthly";
    readonly label: "Monthly";
    readonly window: "month";
};
/** A remote, provider-reported quota row with the percent left: most providers' row. */
export declare function quotaRow(fields: {
    key: string;
    label: string;
    window?: QuotaWindow;
    percentRemaining: number;
    resetsAt?: string;
    windowStartedAt?: string;
}): ProviderRow;
export type WindowValue = {
    percentRemaining: number;
    resetTimeIso?: string;
    fixedWindow?: {
        startedAtIso: string;
    };
    /** The counts a window reports besides the percent, such as the requests a Coding Plan window used. */
    used?: Amount;
    limit?: Amount;
};
export type Slot = {
    key: string;
    label: string;
    window: QuotaWindow;
};
export type WindowRow = {
    slot: Slot;
    value: WindowValue | undefined;
};
/** A quota row for each window the provider reported, in the given order. A window the provider
 * reports no quota for has no row: there is nothing to show for it. */
export declare function windowRows(windows: readonly WindowRow[], method?: ProviderRow["method"]): ProviderRow[];
export declare function failedAccount(name: string, message: string, facts?: ErrorFacts): AccountResult;
export declare function fetchError(message: string, facts?: ErrorFacts): FetchError;
/** What one login gave: its rows and errors, or null when it had nothing to query. */
export type LoginFetch = {
    rows: ProviderRow[];
    errors: FetchError[];
    /** The name of a login without an alias of its own, for example "Copilot (pro)". */
    fallbackName?: string;
} | null;
/**
 * Fetches every OpenCode login of a provider at once and names each account the way OpenCode
 * lists the logins ("[Claude Work] (active)"). A login that gave nothing has no account but
 * still counts when unnamed logins are numbered.
 */
export declare function fetchEachLogin<Login extends {
    row: CredentialRow;
}>(params: {
    providerName: string;
    logins: readonly Login[];
    fetchLogin: (login: Login) => Promise<LoginFetch>;
    /** Number unnamed logins ("[OpenAI 2]") instead of naming them after the fallback. */
    numberUnnamed?: (row: CredentialRow) => boolean;
}): Promise<AccountResult[]>;
