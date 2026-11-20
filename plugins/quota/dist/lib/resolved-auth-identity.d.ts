declare const resolvedAuthIdentityBrand: unique symbol;
/**
 * Provider-scoped opaque identity for one winning resolved-auth principal.
 *
 * The token is safe to use only as an internal derivation input. It must not be
 * rendered, logged, diagnosed, telemetered, or included in JSON exports.
 */
export type ResolvedAuthIdentity = string & {
    readonly [resolvedAuthIdentityBrand]: true;
};
type ResolvedAuthPrincipal = {
    kind: "stable-id";
    value: string;
} | {
    kind: "credential";
    value: string;
};
export declare function isProtectedResolvedAuthStorageSupported(params: {
    platform: NodeJS.Platform;
    hasOwnerIdentity: boolean;
}): boolean;
/**
 * Whether identities stay the same after a reload: true where the key lives in the protected
 * key file, false where it is held in memory only (Windows, or no owner uid).
 */
export declare function isResolvedAuthIdentityKeyDurable(): boolean;
export declare function getResolvedAuthIdentityKeyPath(): string;
export declare function deriveResolvedAuthIdentity(params: {
    providerId: string;
    principal: ResolvedAuthPrincipal;
    qualifiers?: readonly string[];
}): Promise<ResolvedAuthIdentity | null>;
export declare function composeResolvedAuthIdentities(params: {
    providerId: string;
    identities: readonly ResolvedAuthIdentity[];
    qualifiers?: readonly string[];
}): Promise<ResolvedAuthIdentity | null>;
/**
 * Who a provider is signed in as across every login it checks: each login's connection with its
 * own identity and whether OpenCode uses it, in a stable order. Adding, removing, switching or
 * swapping a login changes it. Null without logins, or when one of them can't be told apart
 * safely.
 */
export declare function loginListIdentity(providerId: string, logins: ReadonlyArray<{
    row: {
        id: string;
        active: boolean;
    };
    identity: ResolvedAuthIdentity | null;
}>): Promise<ResolvedAuthIdentity | null>;
export declare function __resetResolvedAuthIdentityForTests(): void;
export {};
