/**
 * Vilao: the pay-as-you-go balance of each Vilao PAT login, as a share of the last balance this
 * machine saw rise. Vilao reports no plan or quota windows, so the row is a balance with a
 * percent and no reset time.
 */
import { modelProviderMatchesRuntimeId } from "../lib/provider-model-matching.js";
import { loginListIdentity, deriveResolvedAuthIdentity } from "../lib/resolved-auth-identity.js";
import { getVilaoAuthDiagnostics, queryVilaoQuota, readVilaoPatLogins, } from "../lib/vilao.js";
import { failedAccount, quotaRow, } from "./contract.js";
import { statusDetailsFromRecord } from "./result-helpers.js";
const LABEL = "Vilao";
const VND = { kind: "custom", symbol: "₫" };
/** Đồng with no trailing zeros: 4,000,000 cents → "40000" (rendered "40,000 ₫"). */
function vnd(cents) {
    const value = cents / 100;
    const decimal = Number.isInteger(value)
        ? String(value)
        : value.toFixed(2).replace(/0+$/u, "").replace(/\.$/u, "");
    return { decimal, unit: VND };
}
/** The wallet glyph (Nerd Font) that stands for the balance row, in place of a word. */
const BALANCE_ICON = "󰯝";
/** The single balance row: what is left, the baseline it is measured against, and the share. */
function balanceRow(result) {
    return {
        ...quotaRow({
            key: "balance",
            label: BALANCE_ICON,
            percentRemaining: result.percentRemaining,
        }),
        type: "balance",
        authority: "locally_derived",
        amount: vnd(result.balanceCents),
        limit: vnd(result.baselineCents),
    };
}
export const vilaoProvider = {
    id: "vilao",
    cachePolicy: {
        kind: "resolved-auth",
        async resolveIdentity() {
            return loginListIdentity("vilao", await Promise.all((await readVilaoPatLogins()).map(async ({ row, pat }) => ({
                row,
                identity: await deriveResolvedAuthIdentity({
                    providerId: "vilao",
                    principal: { kind: "credential", value: pat },
                }),
            }))));
        },
    },
    async isAvailable() {
        return (await readVilaoPatLogins()).length > 0;
    },
    matchesCurrentModel(model, context) {
        if (context?.currentProviderID) {
            return context.currentProviderID.trim().toLowerCase() === "vilao";
        }
        return modelProviderMatchesRuntimeId(model, "vilao");
    },
    async fetch(ctx) {
        const diagnostics = await getVilaoAuthDiagnostics();
        const debug = statusDetailsFromRecord({
            pat_metadata: diagnostics.configured ? "configured" : "(none)",
            auth_paths: diagnostics.authPaths.join(" | ") || "(none)",
            local_state_path: diagnostics.statePath,
        });
        const read = await queryVilaoQuota({ requestTimeoutMs: ctx.config?.requestTimeoutMs });
        if (read.length === 0)
            return { attempted: false, accounts: [], debug };
        const accounts = read.map(({ result }) => result.success
            ? { name: LABEL, rows: [balanceRow(result)], errors: [] }
            : failedAccount(LABEL, result.error));
        return { attempted: true, accounts, debug };
    },
};
//# sourceMappingURL=vilao.js.map