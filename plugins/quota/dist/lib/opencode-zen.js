import { failureFacts, requestJson } from "./http.js";
import { asRecord } from "./json-guards.js";
import { consoleBaseUrl, consoleHeaders, } from "./opencode-console-auth.js";
const CONSOLE_TIMEOUT_MS = 10_000;
const SESSION_ERROR = "OpenCode Console session expired or invalid. Run `opencode auth login opencode` to sign in again.";
/**
 * The OpenCode Console reports amounts in micro-cents:
 * one US dollar is 100,000,000 micro-cents (billing units).
 */
export const OPENCODE_ZEN_BILLING_UNITS_PER_DOLLAR = 100_000_000;
/** The /quota_status note when the member has budgets Zen cannot all evaluate. */
export const MEMBER_BUDGET_NOTE = "member budgets found, but not all can be evaluated (model filters, per-model limits, or missing amounts); using the credit limit";
/** Console micro-cent amounts arrive as decimal strings; numbers are accepted too. */
function parseMicroCents(value) {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
function invalidResponse() {
    throw new Error("Unexpected OpenCode Console response");
}
function parseDollars(value) {
    if (value === null)
        return null;
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    return invalidResponse();
}
/** A nullable micro-cent field: null stays null; a missing or malformed value is invalid. */
function parseNullableMicroCents(value) {
    if (value === null)
        return null;
    const parsed = parseMicroCents(value);
    return parsed === null ? invalidResponse() : parsed;
}
function parseBalance(json) {
    const balance = parseMicroCents(asRecord(json)?.balanceMicroCents);
    return balance === null ? invalidResponse() : Math.max(0, balance);
}
/** Returns the credit limit in USD, or null when the account has no limit. */
function parseCreditLimit(json) {
    const limit = parseNullableMicroCents(asRecord(json)?.creditLimitMicroCents);
    return limit === null ? null : limit / OPENCODE_ZEN_BILLING_UNITS_PER_DOLLAR;
}
function parseAutoRecharge(json) {
    const autoRecharge = asRecord(json);
    if (!autoRecharge || typeof autoRecharge.enabled !== "boolean")
        return invalidResponse();
    return {
        reload: autoRecharge.enabled,
        reloadAmount: parseDollars(autoRecharge.rechargeAmountDollars),
        reloadTrigger: parseDollars(autoRecharge.thresholdDollars),
    };
}
function currentUtcMonth(now) {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
/** Sums the current UTC month's daily costs in micro-cents; an empty list means no usage. */
function parseMonthlyUsage(json, now) {
    if (!Array.isArray(json))
        return invalidResponse();
    const month = currentUtcMonth(now);
    let total = 0;
    for (const item of json) {
        const day = asRecord(item);
        const cost = parseMicroCents(day?.totalCostMicroCents);
        if (typeof day?.date !== "string" || cost === null)
            return invalidResponse();
        if (day.date.slice(0, 7) === month)
            total += cost;
    }
    return Number.isFinite(total) ? total : invalidResponse();
}
/** Caps dollar amounts so the ×100,000,000 conversion cannot lose Number precision. */
const MAX_BUDGET_DOLLARS = 90_000_000;
/** A member budget dollar field: absent or null, else a non-negative finite number. */
function parseBudgetDollars(value) {
    if (value === undefined)
        return null;
    const dollars = parseDollars(value);
    if (dollars === null)
        return null;
    if (dollars < 0 || dollars > MAX_BUDGET_DOLLARS)
        return invalidResponse();
    return dollars;
}
function toMicroCents(dollars) {
    return Math.round(dollars * OPENCODE_ZEN_BILLING_UNITS_PER_DOLLAR);
}
/**
 * Current budgets already have their policies resolved by the Console. Select the least
 * USD left among whole-set caps covering all models; a $0 per-model cap also blocks all
 * models. Filtered caps, nonzero per-model caps and caps of an unknown `per` do not compete. Missing amounts on an
 * applicable cap make the binding budget unknown, so the credit-limit fallback applies.
 */
function parseMemberBudgets(json) {
    if (!Array.isArray(json))
        return invalidResponse();
    let selected = null;
    let skipped = false;
    for (const item of json) {
        const budget = asRecord(item);
        if (!budget)
            return invalidResponse();
        const { per } = budget;
        const limit = parseBudgetDollars(budget.limitDollars);
        const spent = parseBudgetDollars(budget.spentDollars);
        if (budget.coverage !== "all")
            continue;
        if (per !== "set" && !(per === "model" && limit === 0))
            continue;
        if (limit === null || spent === null) {
            skipped = true;
            continue;
        }
        if (selected === null || limit - spent < selected.limit - selected.spent) {
            const resetMs = typeof budget.resetsAt === "string" ? Date.parse(budget.resetsAt) : NaN;
            selected = {
                limit,
                spent,
                resetsAtIso: Number.isFinite(resetMs) ? new Date(resetMs).toISOString() : null,
            };
        }
    }
    if (skipped || selected === null) {
        return {
            limitMicroCents: null,
            spentMicroCents: null,
            budgetCount: json.length,
            resetsAtIso: null,
        };
    }
    return {
        limitMicroCents: toMicroCents(selected.limit),
        spentMicroCents: toMicroCents(selected.spent),
        budgetCount: json.length,
        resetsAtIso: selected.resetsAtIso,
    };
}
/** 00:00 UTC on the 1st of the month after `now`. */
function nextUtcMonthStartIso(now) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}
/**
 * The token, org id and account id are kept out of error text in raw and encoded forms.
 */
function consoleSecrets(credential) {
    const accountId = credential.accountId?.trim();
    return [
        credential.accessToken,
        credential.orgId,
        accountId,
        accountId && encodeURIComponent(accountId),
    ];
}
async function fetchConsoleRoute(params) {
    const reply = await requestJson(`${consoleBaseUrl(params.credential)}/api/${params.route}`, {
        method: "GET",
        redirect: "manual",
        headers: consoleHeaders(params.credential),
        secrets: consoleSecrets(params.credential),
        timeoutMs: params.timeoutMs,
        // An empty body carries no value, so the route parser sees it as JSON null.
        blankAsNull: true,
    });
    const status = reply.ok ? reply.status : reply.failure.status;
    const headers = reply.ok ? reply.headers : reply.failure.headers;
    // Redirects and 401 mean the whole session is gone; a 403 is treated as
    // a per-route failure so optional routes can fall back gracefully.
    if (status !== undefined && ((status >= 300 && status < 400) || status === 401)) {
        return { success: false, error: SESSION_ERROR };
    }
    if (!reply.ok && reply.failure.kind === "http") {
        return {
            success: false,
            error: `OpenCode Console ${params.route} error ${status}`,
            facts: failureFacts(reply.failure),
        };
    }
    if (headers?.get("content-type")?.includes("text/html")) {
        return { success: false, error: SESSION_ERROR };
    }
    if (!reply.ok && (reply.failure.kind === "timeout" || reply.failure.kind === "network")) {
        const detail = reply.failure.detail.replace(/\s+/g, " ").trim();
        return {
            success: false,
            error: `OpenCode Console ${params.route} request failed: ${(detail || "unknown").slice(0, 120)}`,
            facts: failureFacts(reply.failure),
        };
    }
    const notParsed = {
        success: false,
        error: `Could not parse OpenCode Console ${params.route} response`,
    };
    if (!reply.ok)
        return notParsed;
    try {
        return { success: true, data: params.parse(reply.json) };
    }
    catch {
        return notParsed;
    }
}
export async function queryOpenCodeZenQuota(credential, options = {}) {
    const request = {
        credential,
        timeoutMs: options.requestTimeoutMs ?? CONSOLE_TIMEOUT_MS,
    };
    const now = new Date();
    const [balance, creditLimit, autoRecharge, member, monthlyUsage] = await Promise.all([
        fetchConsoleRoute({ ...request, route: "billing/status", parse: parseBalance }),
        fetchConsoleRoute({ ...request, route: "billing/account", parse: parseCreditLimit }),
        fetchConsoleRoute({ ...request, route: "billing/auto-recharge", parse: parseAutoRecharge }),
        fetchConsoleRoute({ ...request, route: "policies/current-budgets", parse: parseMemberBudgets }),
        fetchConsoleRoute({
            ...request,
            route: "usage/cost-by-day",
            parse: (json) => parseMonthlyUsage(json, now),
        }),
    ]);
    const optional = [creditLimit, autoRecharge, member, monthlyUsage];
    if ([balance, ...optional].some((result) => !result.success && result.error === SESSION_ERROR)) {
        return { success: false, error: SESSION_ERROR };
    }
    if (!balance.success)
        return balance;
    // Prefer a member budget ($0 included: it blocks). Otherwise (no member budgets, budgets
    // that cannot be evaluated, or a failed budget route) fall back to the credit limit
    // plus this month's usage costs.
    let monthlyLimit = creditLimit.success ? creditLimit.data : null;
    let usage = monthlyUsage.success ? monthlyUsage.data : null;
    let budgetResetIso = null;
    let budgetSource = "credit_limit";
    let memberBudgetsSkipped = false;
    if (member.success) {
        const { limitMicroCents, spentMicroCents, budgetCount, resetsAtIso } = member.data;
        if (limitMicroCents !== null && spentMicroCents !== null) {
            monthlyLimit = limitMicroCents / OPENCODE_ZEN_BILLING_UNITS_PER_DOLLAR;
            usage = spentMicroCents;
            budgetResetIso = resetsAtIso ?? nextUtcMonthStartIso(now);
            budgetSource = "member_budget";
        }
        else if (budgetCount > 0) {
            memberBudgetsSkipped = true;
        }
    }
    return {
        success: true,
        data: {
            balance: balance.data,
            monthlyLimit,
            monthlyUsage: usage,
            lastPayment: null,
            ...(autoRecharge.success
                ? autoRecharge.data
                : { reload: null, reloadAmount: null, reloadTrigger: null }),
            budgetResetIso,
            budgetSource,
            memberBudgetsSkipped,
        },
        errors: optional.flatMap((result) => (result.success ? [] : [result.error])),
    };
}
//# sourceMappingURL=opencode-zen.js.map