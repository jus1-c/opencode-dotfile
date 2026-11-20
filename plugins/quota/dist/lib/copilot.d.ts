/**
 * GitHub Copilot accounting fetcher.
 *
 * Current usage is read from GitHub's public AI Credit billing reports.
 * Legacy premium-request reports are available only when explicitly selected
 * for an eligible Copilot Pro or Pro+ annual plan.
 */
import { type CredentialRow } from "./opencode-auth.js";
import { type ResolvedAuthIdentity } from "./resolved-auth-identity.js";
import type { CopilotBillingModel, CopilotQuotaConfig, CopilotResult } from "./types.js";
/** Integration ids that can hold the Copilot OAuth login, in precedence order. */
export declare const COPILOT_AUTH_KEYS: readonly ["github-copilot", "copilot", "copilot-chat", "github-copilot-chat"];
type CopilotAuthKeyName = (typeof COPILOT_AUTH_KEYS)[number];
type CopilotPatTokenKind = "github_pat" | "ghp" | "ghu" | "ghs" | "other";
interface BillingPeriodQuery {
    year: number;
    month: number;
}
interface UserBillingTarget {
    scope: "user";
    username?: string;
    billingPeriod: BillingPeriodQuery;
}
interface OrganizationBillingTarget {
    scope: "organization";
    organization: string;
    username?: string;
    billingPeriod: BillingPeriodQuery;
}
interface EnterpriseBillingTarget {
    scope: "enterprise";
    enterprise: string;
    organization?: string;
    username?: string;
    billingPeriod: BillingPeriodQuery;
}
type ManagedBillingTarget = OrganizationBillingTarget | EnterpriseBillingTarget;
type CopilotBillingTarget = UserBillingTarget | ManagedBillingTarget;
interface CopilotPatReadResult {
    state: "absent" | "invalid" | "valid";
    checkedPaths: string[];
    selectedPath?: string;
    config?: CopilotQuotaConfig;
    error?: string;
    tokenKind?: CopilotPatTokenKind;
}
export interface CopilotQuotaAuthDiagnostics {
    pat: CopilotPatReadResult;
    oauth: {
        configured: boolean;
        keyName: CopilotAuthKeyName | null;
        hasRefreshToken: boolean;
        hasAccessToken: boolean;
        hasEnterpriseUrl: boolean;
    };
    deployment: "github.com" | "ghe.com" | "invalid" | "none";
    apiHost: string | null;
    enterpriseHostSource: "pat" | "oauth" | "none";
    effectiveSource: "pat" | "oauth" | "none";
    override: "pat_overrides_oauth" | "none";
    quotaApi: "github_ai_credit_api" | "github_legacy_premium_request_api" | "copilot_internal_user" | "none";
    billingMode: "user_quota" | "organization_usage" | "enterprise_usage" | "none";
    billingScope: CopilotBillingTarget["scope"] | "none";
    billingApiAccessLikely: boolean;
    remainingTotalsState: "available" | "value_only_without_denominator" | "not_available_from_org_usage" | "not_available_from_enterprise_usage" | "reported_by_copilot_internal_user" | "unavailable";
    queryPeriod?: BillingPeriodQuery;
    billingModel?: CopilotBillingModel;
    budgetApi: "organization_budgets" | "enterprise_budgets" | "not_available";
    oauthAccountingState: "available_via_copilot_internal_user" | "invalid_enterprise_host" | "not_configured";
}
/** What Copilot can check: the PAT config, and every OpenCode Copilot OAuth login. */
export type CopilotLogins = {
    pat: CopilotPatReadResult;
    oauth: CredentialRow[];
};
/** Any PAT config, even an invalid one, is authoritative over OAuth. */
export declare function readCopilotLogins(): Promise<CopilotLogins>;
export declare function getCopilotQuotaAuthDiagnostics(logins: CopilotLogins): CopilotQuotaAuthDiagnostics;
/**
 * Query GitHub Copilot accounting.
 *
 * A trusted local PAT config remains authoritative. When it is absent, the
 * OpenCode-managed Copilot OAuth token can query the per-user internal quota endpoint.
 */
export declare function queryCopilotQuota(options?: {
    requestTimeoutMs?: number;
    login?: CredentialRow;
}): Promise<CopilotResult>;
/** Who Copilot is signed in as: the PAT config, or every OAuth login it checks. */
export declare function copilotLoginsIdentity(logins: CopilotLogins): Promise<ResolvedAuthIdentity | null>;
export {};
