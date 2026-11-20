import { ALL_PROVIDERS } from "../core/windows.js";
export function visibleRow(row, names) {
    const name = names[row.id];
    return { row, label: name ?? row.label, named: name !== undefined };
}
/** `ids` first in the given order, then the rest in their own order. */
export function ordered(items, idOf, order) {
    const rank = new Map(order.map((id, index) => [id, index]));
    return items
        .map((item, index) => ({ item, index, rank: rank.get(idOf(item)) ?? order.length + index }))
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .map(({ item }) => item);
}
/**
 * A provider's rows, one group per account in the order the accounts first appear. The
 * provider's last error shows once, on its first shown group: the one the collapsed sidebar,
 * the status line and the big bar show first. A failed check can't be told apart by account
 * (a custom source that failed has none), so the other accounts keep their rows without it.
 */
function groupsOf(provider, rows, hadRows) {
    const accounts = [...new Set(provider.rows.map((row) => row.account))];
    if (accounts.length === 0)
        accounts.push(undefined);
    const several = accounts.length > 1;
    const unchecked = provider.checkedAtMs === undefined && provider.rows.length === 0;
    const group = (account, own) => ({
        id: several && account !== undefined
            ? `${provider.providerId} (${account})`
            : provider.providerId,
        providerId: provider.providerId,
        title: account ? `${provider.label} (${account})` : provider.label,
        name: provider.label,
        ...(account === undefined ? {} : { account }),
        rows: own,
        unchecked,
    });
    const groups = accounts
        .map((account) => group(account, rows.filter((item) => item.row.account === account)))
        // An account whose rows are all hidden is left out.
        .filter((item) => !hadRows || item.rows.length > 0);
    if (!provider.error)
        return groups;
    // Every row hidden: the error still shows, on a line of the provider's own.
    const [first = group(several ? undefined : accounts[0], []), ...rest] = groups;
    return [{ ...first, error: provider.error }, ...rest];
}
/**
 * The providers and rows `surface` shows, in order, with your row names: the toast's on toasts,
 * the sidebar's everywhere else.
 */
export function visibleGroups(snapshot, settings, surface, words) {
    const shown = settings[surface];
    const names = settings[surface === "toast" ? "toast" : "sidebar"].names ?? {};
    const hidden = new Set(shown.hidden);
    const currentModel = words.onlyCurrentModel ? snapshot.currentModelProviderIds : undefined;
    const rowPrefixes = words.onlyCurrentModel ? snapshot.currentModelRowPrefixes : undefined;
    const providers = ordered(snapshot.providers, (provider) => provider.providerId, shown.providerOrder).filter((provider) => !hidden.has(provider.providerId) &&
        (currentModel === undefined || currentModel.includes(provider.providerId)));
    return providers.flatMap((provider) => {
        // A provider whose rows serve different models shows only those of the current one.
        const prefixes = rowPrefixes?.[provider.providerId];
        const rows = ordered(provider.rows, (row) => row.id, shown.rowOrder[provider.providerId] ?? [])
            .filter((row) => !hidden.has(row.id))
            .filter((row) => prefixes === undefined || prefixes.some((prefix) => row.id.startsWith(prefix)))
            .filter((row) => words.detail === "detailed" || row.prominence === "primary")
            .map((row) => visibleRow(row, names));
        return groupsOf(provider, rows, provider.rows.length > 0);
    });
}
/**
 * The window a group shows in the collapsed sidebar or the status line, and the one its Settings
 * ‹ › shows: its provider's own pick; else the pick for all providers when one of its rows with a
 * percent has that window; else "lowest" (where `pickRow` would fall back anyway).
 */
export function windowFor(windows, group) {
    const all = windows[ALL_PROVIDERS];
    const hasAll = group.rows.some(({ row }) => row.percentRemaining !== undefined && row.window === all);
    return windows[group.providerId] ?? (all !== undefined && hasAll ? all : "lowest");
}
/**
 * The one row a group shows in the collapsed sidebar and the status line: the preferred
 * window's row; with "lowest", or when the group has no row of that window, the row with the
 * least left; else the first row.
 */
export function pickRow(group, choice = "lowest") {
    const withPercent = group.rows.filter((item) => item.row.percentRemaining !== undefined);
    const preferred = withPercent.find((item) => choice !== "lowest" && item.row.window === choice);
    if (preferred)
        return preferred;
    const primary = withPercent.filter((item) => item.row.prominence === "primary");
    const candidates = primary.length > 0 ? primary : withPercent;
    const lowest = [...candidates].sort((a, b) => a.row.percentRemaining - b.row.percentRemaining)[0];
    return lowest ?? group.rows[0];
}
/** Keep the independent Codex balance beside the chosen window on the status line.
 * Rows already carry surface hiding, ordering and custom names. */
export function statusGroups(groups, windows) {
    return groups.flatMap((group) => {
        const credits = group.rows.find(({ row }) => row.id === "openai.codex_credits");
        if (!credits)
            return [group];
        const creditGroup = {
            ...group,
            id: `${group.id}.codex_credits`,
            name: credits.label,
            title: group.account ? `${credits.label} (${group.account})` : credits.label,
            rows: [credits],
        };
        // A snapshot cannot attribute a failed refresh to a login: warn on all its balances.
        const providerError = groups.find((other) => other.providerId === group.providerId && other.error)?.error;
        if (providerError)
            creditGroup.error = providerError;
        if (pickRow(group, windowFor(windows, group)) === credits)
            return [creditGroup];
        return [group, creditGroup];
    });
}
//# sourceMappingURL=select.js.map