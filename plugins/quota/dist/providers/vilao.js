import { modelProviderMatchesRuntimeId } from "../lib/provider-model-matching.js";
import { formatVilaoVnd, getVilaoAuthDiagnostics, getVilaoCacheIdentity, hasVilaoPat, queryVilaoQuota, } from "../lib/vilao.js";
import { attemptedResult, mapNullableProviderResult, statusDetailsFromRecord, } from "./result-helpers.js";
export const vilaoProvider = {
    id: "vilao",
    cacheIdentity: getVilaoCacheIdentity,
    async isAvailable(_ctx) {
        return hasVilaoPat();
    },
    matchesCurrentModel(model) {
        return modelProviderMatchesRuntimeId(model, "vilao");
    },
    async fetch(ctx) {
        const result = await queryVilaoQuota({ requestTimeoutMs: ctx.config?.requestTimeoutMs });
        const diagnostics = await getVilaoAuthDiagnostics();
        const statusDetails = statusDetailsFromRecord({
            pat_metadata: diagnostics.configured ? "configured" : "(none)",
            auth_paths: diagnostics.authPaths.join(" | ") || "(none)",
            local_state_path: diagnostics.statePath,
        });
        const mapped = mapNullableProviderResult(result, {
            errorLabel: "Vilao",
            onSuccess: (success) => ({
                ...attemptedResult([
                    {
                        accounting: {
                            resultType: "balance",
                            acquisitionMethod: "remote_api",
                            ownership: "maintained",
                            authority: "locally_derived",
                            observedAtIso: new Date().toISOString(),
                        },
                        name: "Vilao Balance",
                        group: "Vilao",
                        label: `:: ${formatVilaoVnd(success.balance).replace(" VND", "")} / ${formatVilaoVnd(success.baseline).replace(" VND", "")} ₫`,
                        percentRemaining: success.percentRemaining,
                    },
                ]),
                rawDetails: [
                    { key: "balance", value: formatVilaoVnd(success.balance) },
                    { key: "observed_baseline", value: formatVilaoVnd(success.baseline) },
                ],
            }),
        });
        return { ...mapped, statusDetails };
    },
};
//# sourceMappingURL=vilao.js.map