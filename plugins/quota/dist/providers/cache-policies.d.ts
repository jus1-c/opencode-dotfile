/**
 * The cache policies several providers share. Each provider names its own policy
 * (`cachePolicy` in `src/providers/<vendor>.ts`).
 */
import { API_KEY_VENDORS, type VendorKeys } from "../lib/api-key-resolver.js";
import type { QuotaProviderCachePolicy, QuotaProviderContext } from "../lib/entries.js";
import type { CanonicalQuotaProviderId } from "../lib/provider-registration.js";
import { type ResolvedAuthIdentity } from "../lib/resolved-auth-identity.js";
export type ResolvedCredential = {
    credential: string;
    principalKind?: "stable-id" | "credential";
    qualifiers?: readonly string[];
};
/** The identity of the one credential `resolve` finds; none when it finds none. */
export declare function resolvedCredentialPolicy(providerId: CanonicalQuotaProviderId, resolve: (ctx: QuotaProviderContext) => Promise<ResolvedCredential | null>): QuotaProviderCachePolicy;
/**
 * Who the vendor's keys are: the env or config key with where it was found, else each stored key
 * login. A key bound to one regional `endpoint` has the endpoint in its identity. Null without a
 * key, or when a login can't be told apart safely.
 */
export declare function vendorKeysIdentity(providerId: CanonicalQuotaProviderId, keys: VendorKeys, endpoint?: string): Promise<ResolvedAuthIdentity | null>;
/** Every key the vendor checks; see `vendorKeysIdentity`. */
export declare function vendorKeysPolicy(providerId: CanonicalQuotaProviderId & keyof typeof API_KEY_VENDORS, endpoint?: string): QuotaProviderCachePolicy;
