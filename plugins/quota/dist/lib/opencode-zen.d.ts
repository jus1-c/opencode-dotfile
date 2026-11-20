import type { ErrorFacts } from "../core/errors.js";
import { type OpenCodeConsoleCredential } from "./opencode-console-auth.js";
/**
 * The OpenCode Console reports amounts in micro-cents:
 * one US dollar is 100,000,000 micro-cents (billing units).
 */
export declare const OPENCODE_ZEN_BILLING_UNITS_PER_DOLLAR = 100000000;
/**
 * Where the monthly limit and usage come from: a member budget
 * (policies/current-budgets), or the credit limit (billing/account) plus this
 * month's usage costs (usage/cost-by-day).
 */
type OpenCodeZenBudgetSource = "member_budget" | "credit_limit";
/** The /quota_status note when the member has budgets Zen cannot all evaluate. */
export declare const MEMBER_BUDGET_NOTE = "member budgets found, but not all can be evaluated (model filters, per-model limits, or missing amounts); using the credit limit";
interface OpenCodeZenBillingData {
    balance: number;
    /**
     * Monthly limit in USD from `budgetSource`: null when there is no limit or its route
     * failed. A member budget of $0 is a real blocking limit, not an absence.
     */
    monthlyLimit: number | null;
    /** Current-month usage in billing units from `budgetSource`; null when its route failed. */
    monthlyUsage: number | null;
    lastPayment: number | null;
    /** Auto-reload state; null (unknown) when billing/auto-recharge failed. */
    reload: boolean | null;
    reloadAmount: number | null;
    reloadTrigger: number | null;
    /**
     * Member-budget reset ISO timestamp from the Console, else the start of the next UTC
     * month. Null for the credit limit.
     */
    budgetResetIso: string | null;
    budgetSource: OpenCodeZenBudgetSource;
    /**
     * True when the member has budgets but none can be used, or an applicable budget has
     * missing amounts. The credit-limit fallback applies.
     */
    memberBudgetsSkipped: boolean;
}
/**
 * billing/status (balance) is required. The other routes are optional: when one fails,
 * its fields are null and its error is listed in `errors`.
 */
type OpenCodeZenResult = {
    success: true;
    data: OpenCodeZenBillingData;
    errors: string[];
} | {
    success: false;
    error: string;
    facts?: ErrorFacts;
};
export declare function queryOpenCodeZenQuota(credential: OpenCodeConsoleCredential, options?: {
    requestTimeoutMs?: number;
}): Promise<OpenCodeZenResult>;
export {};
