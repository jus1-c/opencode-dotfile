/**
 * OpenRouter: the budget or spend of the key GET https://openrouter.ai/api/v1/key reports. It
 * reads the reply with the custom-provider OpenRouter format, so built-in and custom OpenRouter
 * sources read it the same way.
 */
import { modelProviderMatchesRuntimeId } from "../lib/provider-model-matching.js";
import { fetchRemoteQuotaProvider, resolveQuotaProviderApiKey, } from "../lib/quota-providers-remote.js";
import { deriveResolvedAuthIdentity } from "../lib/resolved-auth-identity.js";
import { failedAccount } from "./contract.js";
import { simpleApiKeyStatusDetails } from "./result-helpers.js";
const LABEL = "OpenRouter";
const OPENROUTER_KEY_SOURCE = {
    id: "openrouter",
    providerId: "openrouter",
    label: LABEL,
    mode: "remote-api",
    url: "https://openrouter.ai/api/v1/key",
    apiKeyEnv: "OPENROUTER_API_KEY",
    format: "openrouter-key-v1",
};
/** The key from the env variable, OpenCode's config files for `directory`, or its logins. */
export async function resolveOpenRouterApiKey(directory) {
    return await resolveQuotaProviderApiKey(OPENROUTER_KEY_SOURCE, directory);
}
export const openRouterProvider = {
    id: "openrouter",
    cachePolicy: {
        kind: "resolved-auth",
        async resolveIdentity(ctx) {
            const { key } = await resolveOpenRouterApiKey(ctx.locationDirectory);
            if (!key)
                return null;
            return deriveResolvedAuthIdentity({
                providerId: "openrouter",
                principal: { kind: "credential", value: key },
            });
        },
    },
    async isAvailable(ctx) {
        return Boolean((await resolveOpenRouterApiKey(ctx.locationDirectory)).key);
    },
    matchesCurrentModel(model) {
        return modelProviderMatchesRuntimeId(model, "openrouter");
    },
    async fetch(ctx) {
        const resolved = await resolveOpenRouterApiKey(ctx.locationDirectory);
        const debug = simpleApiKeyStatusDetails({
            configured: Boolean(resolved.key),
            source: resolved.source,
            checkedPaths: resolved.checkedPaths,
            credentialDatabasePaths: resolved.credentialDatabasePaths,
        });
        if (!resolved.key)
            return { attempted: false, accounts: [], debug };
        const result = await fetchRemoteQuotaProvider(OPENROUTER_KEY_SOURCE, resolved.key, ctx.config?.requestTimeoutMs);
        if (!result.success) {
            return {
                attempted: true,
                accounts: [failedAccount(LABEL, result.error, result.facts)],
                debug,
            };
        }
        return {
            attempted: true,
            accounts: [
                {
                    name: LABEL,
                    // The key's one row: its budget (percent left) or, without a limit, its spend.
                    rows: result.rows.map((row) => ({ ...row, key: "key" })),
                    errors: (result.rowErrors ?? []).map((message) => ({ message })),
                },
            ],
            debug,
        };
    },
};
//# sourceMappingURL=openrouter.js.map