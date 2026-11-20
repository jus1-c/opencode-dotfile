import { sanitizeDisplayText } from "../lib/display-sanitize.js";
import { googleLoginsIdentity, hasGoogleQuotaRuntimeAvailable, inspectGoogleAuthPresence, queryGoogleQuota, readGoogleLogins, } from "../lib/google-oauth-quota.js";
import { fetchEachLogin, fetchError, } from "./contract.js";
import { statusDetailsFromRecord } from "./result-helpers.js";
/** Set up when a login OpenCode uses has an account and the companion plugin is installed. */
export async function isGoogleProviderAvailable(flavor, ctx) {
    try {
        return await hasGoogleQuotaRuntimeAvailable(flavor.quota, ctx.locationDirectory);
    }
    catch {
        return false;
    }
}
/** Who the provider is signed in as: its logins and the companion's OAuth client. */
export function googleCachePolicy(flavor) {
    return {
        kind: "resolved-auth",
        resolveIdentity: async (ctx) => googleLoginsIdentity(flavor.quota, await readGoogleLogins(flavor.quota, ctx.locationDirectory)),
    };
}
/** A remaining count Google reported ("1200", "12.5") in `unit`; none for anything else. */
export function remainingCount(text, unit) {
    const number = text?.trim();
    if (!number || !/^\d+(?:\.\d+)?$/u.test(number))
        return undefined;
    const [integer = "0", fraction = ""] = number.split(".");
    const whole = integer.replace(/^0+(?=\d)/u, "");
    const decimals = fraction.replace(/0+$/u, "");
    return {
        decimal: decimals ? `${whole}.${decimals}` : whole,
        unit: { kind: "count", unit },
    };
}
/** One account per OpenCode login, named after the login. */
export async function fetchGoogleProviderQuota(flavor, ctx) {
    const { quota } = flavor;
    const [logins, companion] = await Promise.all([
        readGoogleLogins(quota, ctx.locationDirectory),
        quota.companion.inspect(),
    ]);
    const auth = inspectGoogleAuthPresence(quota, logins);
    const debug = statusDetailsFromRecord({
        auth_state: auth.state,
        auth_source: auth.sourceKey ?? "(none)",
        account_count: String(auth.accountCount),
        valid_account_count: String(auth.validAccountCount),
        companion_package_state: companion.state,
        companion_package_path: companion.state === "missing" ? "(none)" : (companion.resolvedPath ?? "(none)"),
        auth_error: auth.state === "invalid" ? sanitizeDisplayText(auth.error) : undefined,
    });
    const requestTimeoutMs = ctx.config?.requestTimeoutMsConfigured
        ? ctx.config.requestTimeoutMs
        : undefined;
    const accounts = await fetchEachLogin({
        providerName: quota.name,
        logins: logins.rows.map((row) => ({ row })),
        async fetchLogin({ row }) {
            const result = row.resolveError !== undefined && flavor.failedLoginError
                ? { success: false, error: flavor.failedLoginError(row.resolveError) }
                : await queryGoogleQuota(quota, {
                    requestTimeoutMs,
                    login: row,
                    directory: ctx.locationDirectory,
                });
            if (!result)
                return null;
            if (!result.success)
                return { rows: [], errors: [fetchError(result.error, result.facts)] };
            const buckets = flavor.compareBuckets
                ? [...result.buckets].sort(flavor.compareBuckets)
                : result.buckets;
            return { rows: buckets.flatMap((bucket) => flavor.row(bucket) ?? []), errors: [] };
        },
    });
    return { attempted: logins.rows.length > 0, accounts, debug };
}
//# sourceMappingURL=google-oauth-provider.js.map