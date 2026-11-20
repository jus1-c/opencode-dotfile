/**
 * The row contract providers return: per account, its rows (keyed like `five_hour`) and its
 * errors, plus debug details for /quota_status. `core/rows.ts` turns a result into v6 rows by
 * adding each row's id, provider and account.
 */
import { formatCredentialDisplayNames } from "../lib/opencode-auth.js";
/** A row key part from provider text: lower case, `_` for anything else ("Claude/GPT" → "claude_gpt"). */
export function keySlug(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, "_")
        .replace(/^_+|_+$/gu, "");
}
export const FIVE_HOUR = { key: "five_hour", label: "5h", window: "five_hour" };
export const WEEKLY = { key: "weekly", label: "Weekly", window: "week" };
export const MONTHLY = { key: "monthly", label: "Monthly", window: "month" };
/** One quota row, the way a provider reports a window: the percent left, the counts when it has
 * them, when it resets and when it started. */
function windowRow(fields) {
    return {
        key: fields.key,
        label: fields.label,
        type: "quota",
        method: fields.method,
        authority: "provider_reported",
        prominence: "primary",
        ...(fields.window ? { window: fields.window } : {}),
        percentRemaining: fields.percentRemaining,
        ...(fields.used !== undefined ? { used: fields.used } : {}),
        ...(fields.limit !== undefined ? { limit: fields.limit } : {}),
        // An empty reset time means the provider gave none.
        ...(fields.resetsAt ? { resetsAt: fields.resetsAt } : {}),
        ...(fields.windowStartedAt ? { windowStartedAt: fields.windowStartedAt } : {}),
    };
}
/** A remote, provider-reported quota row with the percent left: most providers' row. */
export function quotaRow(fields) {
    return windowRow({ ...fields, method: "remote_api" });
}
/** A quota row for each window the provider reported, in the given order. A window the provider
 * reports no quota for has no row: there is nothing to show for it. */
export function windowRows(windows, method = "remote_api") {
    const rows = [];
    for (const { slot, value } of windows) {
        if (!value)
            continue;
        rows.push(windowRow({
            key: slot.key,
            label: slot.label,
            window: slot.window,
            method,
            percentRemaining: value.percentRemaining,
            ...(value.used !== undefined ? { used: value.used } : {}),
            ...(value.limit !== undefined ? { limit: value.limit } : {}),
            ...(value.resetTimeIso !== undefined ? { resetsAt: value.resetTimeIso } : {}),
            ...(value.fixedWindow ? { windowStartedAt: value.fixedWindow.startedAtIso } : {}),
        }));
    }
    return rows;
}
export function failedAccount(name, message, facts) {
    return { name, rows: [], errors: [fetchError(message, facts)] };
}
export function fetchError(message, facts) {
    return facts ? { message, facts } : { message };
}
/**
 * Fetches every OpenCode login of a provider at once and names each account the way OpenCode
 * lists the logins ("[Claude Work] (active)"). A login that gave nothing has no account but
 * still counts when unnamed logins are numbered.
 */
export async function fetchEachLogin(params) {
    const fetched = await Promise.all(params.logins.map((login) => params.fetchLogin(login)));
    const names = formatCredentialDisplayNames(params.providerName, params.logins.map(({ row }, index) => ({
        row,
        fallbackName: fetched[index]?.fallbackName ?? params.providerName,
        numberUnnamed: params.numberUnnamed?.(row) ?? false,
    })));
    return params.logins.flatMap(({ row }, index) => {
        const result = fetched[index];
        if (!result)
            return [];
        return [
            {
                name: names[index] ?? params.providerName,
                login: row.id,
                rows: result.rows,
                errors: result.errors,
            },
        ];
    });
}
//# sourceMappingURL=contract.js.map