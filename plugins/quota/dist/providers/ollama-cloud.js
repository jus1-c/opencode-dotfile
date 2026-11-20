/**
 * Ollama Cloud (https://docs.ollama.com/api/balance): included credits (credit plans) or session
 * and weekly limits (legacy plans), and purchased credits. Each key stored in OpenCode is queried
 * as its own account; an env or config key is used alone.
 */
import { API_KEY_VENDORS, readVendorKeys } from "../lib/api-key-resolver.js";
import { sanitizeSingleLineDisplayText } from "../lib/display-sanitize.js";
import { failureFacts, requestJson } from "../lib/http.js";
import { finiteNumber, isRecord } from "../lib/json-guards.js";
import { modelProviderMatchesRuntimeId } from "../lib/provider-model-matching.js";
import { accountingDecimalFromNumber } from "./accounting-decimal.js";
import { vendorKeysPolicy } from "./cache-policies.js";
import { fetchError, MONTHLY, quotaRow, WEEKLY, } from "./contract.js";
import { fetchStoredKeys, isKeyVendorAvailable } from "./key-vendor.js";
import { statusDetailsFromRecord, vendorKeyDetails } from "./result-helpers.js";
const LABEL = "Ollama Cloud";
const SPEC = API_KEY_VENDORS["ollama-cloud"];
const OLLAMA_CLOUD_BALANCE_URL = "https://ollama.com/api/balance";
const MAX_RESPONSE_BYTES = 256 * 1024;
const SESSION = { key: "session", label: "Session", window: "session" };
const NO_DATA = "Ollama Cloud returned no limits or balance";
function sanitizeMessage(text, maxLength = 200) {
    const sanitized = sanitizeSingleLineDisplayText(text).replace(/\p{Cf}/gu, "");
    return (sanitized || "unknown").slice(0, maxLength);
}
/** Canonical ISO time, or undefined when the value is not a parseable time. */
function isoTime(value) {
    if (typeof value !== "string")
        return undefined;
    const timeMs = Date.parse(value);
    return Number.isFinite(timeMs) ? new Date(timeMs).toISOString() : undefined;
}
/** A legacy plan limit: `{ remaining_percent: 0..100, resets_at }`. */
function parseLegacyWindow(value) {
    if (!isRecord(value))
        return undefined;
    const percentRemaining = finiteNumber(value.remaining_percent);
    if (percentRemaining === undefined || percentRemaining < 0 || percentRemaining > 100) {
        return undefined;
    }
    const resetTimeIso = isoTime(value.resets_at);
    return { percentRemaining, ...(resetTimeIso ? { resetTimeIso } : {}) };
}
/** A credit plan's included credits: `{ balance_usd, allowance_usd, period: { from, until } }`. */
function parseIncludedCredits(included) {
    const balanceUsd = finiteNumber(included.balance_usd);
    const allowanceUsd = finiteNumber(included.allowance_usd);
    if (balanceUsd === undefined || allowanceUsd === undefined || allowanceUsd < 0) {
        return undefined;
    }
    const period = isRecord(included.period) ? included.period : undefined;
    const periodStartIso = isoTime(period?.from);
    const resetTimeIso = isoTime(period?.until);
    return {
        balanceUsd,
        allowanceUsd,
        // A plan without an included allowance has no share left to show.
        ...(allowanceUsd > 0
            ? { percentRemaining: Math.min(100, Math.max(0, (balanceUsd / allowanceUsd) * 100)) }
            : {}),
        ...(periodStartIso ? { periodStartIso } : {}),
        ...(resetTimeIso ? { resetTimeIso } : {}),
    };
}
function parsePurchasedUsd(value) {
    if (!isRecord(value))
        return undefined;
    const balanceUsd = finiteNumber(value.balance_usd);
    return balanceUsd !== undefined && balanceUsd >= 0 ? balanceUsd : undefined;
}
function usd(value) {
    return { decimal: accountingDecimalFromNumber(value), unit: { kind: "currency", code: "USD" } };
}
/** A credit plan's included credits: the share left this monthly period, with its USD. */
function includedCreditsRow(included, percentRemaining) {
    const remainingUsd = Math.max(0, included.balanceUsd);
    return {
        ...MONTHLY,
        type: "quota",
        method: "remote_api",
        authority: "locally_derived",
        prominence: "primary",
        percentRemaining,
        used: usd(Math.max(0, included.allowanceUsd - remainingUsd)),
        limit: usd(included.allowanceUsd),
        remaining: usd(remainingUsd),
        ...(included.resetTimeIso ? { resetsAt: included.resetTimeIso } : {}),
        ...(included.periodStartIso ? { windowStartedAt: included.periodStartIso } : {}),
    };
}
function failedKeyFetch(message, facts) {
    return { rows: [], errors: [fetchError(message, facts)], debug: [] };
}
/** One balance reply as rows; a field that could not be used is an error next to them. */
function parseOllamaCloudBalance(payload) {
    if (!isRecord(payload)) {
        return failedKeyFetch("Ollama Cloud balance API returned an unexpected response shape");
    }
    const included = isRecord(payload.included) ? payload.included : undefined;
    const hasCreditFields = included?.balance_usd !== undefined || included?.allowance_usd !== undefined;
    const credits = included && hasCreditFields ? parseIncludedCredits(included) : undefined;
    const session = parseLegacyWindow(included?.session);
    const weekly = parseLegacyWindow(included?.weekly);
    const purchasedUsd = parsePurchasedUsd(payload.purchased);
    const rowErrors = [];
    if (!included) {
        rowErrors.push("Included: missing or invalid, expected an object");
    }
    else if (!hasCreditFields && included.session === undefined && included.weekly === undefined) {
        rowErrors.push("Included: invalid, expected credits or session and weekly limits");
    }
    if (hasCreditFields && !credits) {
        rowErrors.push("Included credits: ignored invalid balance");
    }
    if (included?.session !== undefined && !session) {
        rowErrors.push("Session: ignored invalid remaining percent");
    }
    if (included?.weekly !== undefined && !weekly) {
        rowErrors.push("Weekly: ignored invalid remaining percent");
    }
    if (payload.purchased !== undefined && purchasedUsd === undefined) {
        rowErrors.push("Purchased credits: ignored invalid balance");
    }
    if (!credits && !session && !weekly && purchasedUsd === undefined) {
        return failedKeyFetch(NO_DATA);
    }
    const rows = [];
    if (session) {
        rows.push(quotaRow({
            ...SESSION,
            percentRemaining: session.percentRemaining,
            resetsAt: session.resetTimeIso,
        }));
    }
    if (weekly) {
        rows.push(quotaRow({
            ...WEEKLY,
            percentRemaining: weekly.percentRemaining,
            resetsAt: weekly.resetTimeIso,
        }));
    }
    // A plan with no included allowance has no share to show.
    if (credits?.percentRemaining !== undefined) {
        rows.push(includedCreditsRow(credits, credits.percentRemaining));
    }
    // Purchased credits show when there are some, or when they are all Ollama returned.
    if (purchasedUsd !== undefined && (purchasedUsd > 0 || rows.length === 0)) {
        rows.push({
            key: "purchased",
            label: "Purchased",
            type: "balance",
            method: "remote_api",
            authority: "provider_reported",
            prominence: "primary",
            amount: usd(purchasedUsd),
        });
    }
    const errors = [...rowErrors, ...(rows.length === 0 ? [NO_DATA] : [])];
    return {
        rows,
        errors: errors.map((message) => ({ message })),
        debug: [
            ...statusDetailsFromRecord({
                included_period_from: credits?.periodStartIso,
                included_period_until: credits?.resetTimeIso,
                session_resets_at: session?.resetTimeIso,
                weekly_resets_at: weekly?.resetTimeIso,
            }),
            ...rowErrors.map((message, index) => ({ key: `live_error_${index + 1}`, value: message })),
        ],
    };
}
async function queryOllamaCloudQuota(apiKey, requestTimeoutMs) {
    const reply = await requestJson(OLLAMA_CLOUD_BALANCE_URL, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
        redirect: "manual",
        secrets: [apiKey],
        timeoutMs: requestTimeoutMs,
        maxBytes: MAX_RESPONSE_BYTES,
    });
    if (!reply.ok) {
        const { failure } = reply;
        if (failure.kind === "http") {
            const snippet = sanitizeMessage(failure.detail);
            return failedKeyFetch(`Ollama Cloud balance API error ${failure.status}: ${snippet}`, failureFacts(failure));
        }
        return failedKeyFetch(sanitizeMessage(failure.kind === "too_large"
            ? `Ollama Cloud balance API ${failure.detail}`
            : failure.detail), failureFacts(failure));
    }
    try {
        return parseOllamaCloudBalance(reply.json);
    }
    catch (error) {
        return failedKeyFetch(sanitizeMessage(error instanceof Error ? error.message : String(error)));
    }
}
export const ollamaCloudProvider = {
    id: "ollama-cloud",
    cachePolicy: vendorKeysPolicy("ollama-cloud"),
    async isAvailable(ctx) {
        return await isKeyVendorAvailable({
            ctx,
            providerId: "ollama-cloud",
            availability: "key",
            readKeys: () => readVendorKeys(SPEC, ctx.locationDirectory),
        });
    },
    matchesCurrentModel(model) {
        return modelProviderMatchesRuntimeId(model, "ollama-cloud");
    },
    async fetch(ctx) {
        const keys = await readVendorKeys(SPEC, ctx.locationDirectory);
        const keyDetails = vendorKeyDetails(SPEC, keys, ctx.locationDirectory);
        const query = (apiKey) => queryOllamaCloudQuota(apiKey, ctx.config?.requestTimeoutMs);
        if (keys.envOrConfig) {
            const { rows, errors, debug } = await query(keys.envOrConfig.key);
            return {
                attempted: true,
                accounts: [{ name: LABEL, rows, errors }],
                debug: [...keyDetails, ...debug],
            };
        }
        const debugByLogin = new Map();
        const { attempted, accounts } = await fetchStoredKeys({
            providerName: LABEL,
            keys,
            brokenFirst: false,
            async fetchKey(apiKey, row) {
                const { rows, errors, debug } = await query(apiKey);
                debugByLogin.set(row.id, debug);
                return { rows, errors };
            },
        });
        return {
            attempted,
            accounts,
            debug: [...keyDetails, ...keys.logins.flatMap(({ row }) => debugByLogin.get(row.id) ?? [])],
        };
    },
};
//# sourceMappingURL=ollama-cloud.js.map