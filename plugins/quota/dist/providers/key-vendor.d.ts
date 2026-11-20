/**
 * API-key vendors: each check reads the vendor's one key list (`readVendorKeys`), and whether
 * the vendor shows, its stored-login accounts and its key status details all come from it.
 */
import { type VendorKeys } from "../lib/api-key-resolver.js";
import type { QuotaProviderContext } from "../lib/entries.js";
import type { CredentialRow } from "../lib/opencode-auth.js";
import type { CanonicalQuotaProviderId } from "../lib/provider-registration.js";
import { type AccountResult, type LoginFetch } from "./contract.js";
/**
 * When a key vendor shows: `key` with a key alone; `listed-or-key` when OpenCode lists the
 * vendor or a key is set; `listed-and-key` only when OpenCode lists it and a key is set.
 */
export type KeyVendorAvailability = "key" | "listed-or-key" | "listed-and-key";
export declare function isKeyVendorAvailable(params: {
    ctx: QuotaProviderContext;
    providerId: CanonicalQuotaProviderId;
    availability: KeyVendorAvailability;
    readKeys: () => Promise<VendorKeys>;
    /** Whether OpenCode lists the vendor; by default, its own provider id. */
    isListed?: () => Promise<boolean>;
}): Promise<boolean>;
/**
 * Each stored key login as its own account (a broken login as its error; `brokenFirst` lists
 * those before the fetched ones), or the broken first login as the vendor's one error. Not
 * attempted without either. The env or config key is the vendor's own to fetch.
 */
export declare function fetchStoredKeys(params: {
    providerName: string;
    keys: VendorKeys;
    brokenFirst: boolean;
    fetchKey: (apiKey: string, row: CredentialRow) => Promise<LoginFetch>;
}): Promise<{
    attempted: boolean;
    accounts: AccountResult[];
}>;
