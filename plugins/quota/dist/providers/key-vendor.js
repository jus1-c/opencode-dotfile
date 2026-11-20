/**
 * API-key vendors: each check reads the vendor's one key list (`readVendorKeys`), and whether
 * the vendor shows, its stored-login accounts and its key status details all come from it.
 */
import { hasVendorKey } from "../lib/api-key-resolver.js";
import { isCanonicalProviderAvailable } from "../lib/provider-availability.js";
import { failedAccount, fetchEachLogin } from "./contract.js";
export async function isKeyVendorAvailable(params) {
    if (params.availability === "key")
        return hasVendorKey(await params.readKeys());
    const listed = await (params.isListed?.() ??
        isCanonicalProviderAvailable({
            ctx: params.ctx,
            providerId: params.providerId,
            fallbackOnError: false,
        }));
    if (params.availability === "listed-or-key" && listed)
        return true;
    if (params.availability === "listed-and-key" && !listed)
        return false;
    return hasVendorKey(await params.readKeys());
}
/**
 * Each stored key login as its own account (a broken login as its error; `brokenFirst` lists
 * those before the fetched ones), or the broken first login as the vendor's one error. Not
 * attempted without either. The env or config key is the vendor's own to fetch.
 */
export async function fetchStoredKeys(params) {
    const { keys } = params;
    if (keys.logins.length === 0) {
        return keys.broken === null
            ? { attempted: false, accounts: [] }
            : { attempted: true, accounts: [failedAccount(params.providerName, keys.broken)] };
    }
    const accounts = await fetchEachLogin({
        providerName: params.providerName,
        logins: keys.logins,
        async fetchLogin({ row, auth }) {
            if (auth.state === "invalid")
                return { rows: [], errors: [{ message: auth.error }] };
            return params.fetchKey(auth.apiKey, row);
        },
    });
    if (!params.brokenFirst)
        return { attempted: true, accounts };
    const broken = new Set(keys.logins.filter(({ auth }) => auth.state === "invalid").map(({ row }) => row.id));
    return {
        attempted: true,
        accounts: [
            ...accounts.filter((account) => broken.has(account.login ?? "")),
            ...accounts.filter((account) => !broken.has(account.login ?? "")),
        ],
    };
}
//# sourceMappingURL=key-vendor.js.map