/** LLMGate billing-overview quota client. */
import { sanitizeDisplaySnippet, sanitizeDisplayText } from "./display-sanitize.js";
import { clampPercent } from "./format-utils.js";
import { fetchWithTimeout } from "./http.js";
import { getAuthPaths, readAuthFile } from "./opencode-auth.js";
const LLMGATE_BILLING_OVERVIEW_URL = "https://llmgate.app/api/v1/billing/overview";
const USER_AGENT = "OpenCode-Quota-Toast/1.0";
export const LLMGATE_ACCESS_TOKEN_METADATA_KEY = "llmgate_access_token";
export const LLMGATE_REFRESH_TOKEN_METADATA_KEY = "llmgate_refresh_token";
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
function nonEmptyString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function authMetadataFromAuth(auth) {
    const entry = asRecord(asRecord(auth).llmgate);
    if (entry.type !== "api")
        return {};
    const metadata = asRecord(entry.metadata);
    return {
        accessToken: nonEmptyString(metadata[LLMGATE_ACCESS_TOKEN_METADATA_KEY]),
        refreshToken: nonEmptyString(metadata[LLMGATE_REFRESH_TOKEN_METADATA_KEY]),
    };
}
function authTokensFromAuth(auth) {
    const metadata = authMetadataFromAuth(auth);
    if (!metadata.accessToken || !metadata.refreshToken)
        return undefined;
    return { accessToken: metadata.accessToken, refreshToken: metadata.refreshToken };
}
function finiteNumber(value) {
    if (typeof value === "boolean" || value === null || value === undefined)
        return undefined;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}
function resetTimeIso(value) {
    const unix = finiteNumber(value);
    if (unix === undefined || unix <= 0)
        return undefined;
    const milliseconds = unix * 1000;
    return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : undefined;
}
function parseWindow(value) {
    const record = asRecord(value);
    const limit = finiteNumber(record.limit);
    const used = finiteNumber(record.used);
    const reportedRemaining = finiteNumber(record.remaining);
    if (limit === undefined || !Number.isFinite(limit) || limit <= 0 || used === undefined || used < 0) {
        return undefined;
    }
    const remaining = reportedRemaining !== undefined && reportedRemaining >= 0
        ? reportedRemaining
        : Math.max(0, limit - used);
    return {
        limit,
        used,
        remaining,
        percentRemaining: clampPercent((remaining / limit) * 100),
        resetTimeIso: resetTimeIso(record.reset_at_unix),
    };
}
function parseOverview(payload) {
    const data = asRecord(asRecord(payload).data);
    if (Object.keys(data).length === 0) {
        return { success: false, error: "LLMGate billing response returned an unexpected response shape" };
    }
    const quota = asRecord(data.usage_quota);
    const fiveHour = parseWindow(quota.five_hour);
    const weekly = parseWindow(quota.weekly);
    if (!fiveHour && !weekly) {
        return { success: false, error: "LLMGate billing response has no reportable usage quota windows" };
    }
    return {
        success: true,
        ...(nonEmptyString(data.plan_code) ? { planCode: nonEmptyString(data.plan_code) } : {}),
        ...(nonEmptyString(data.plan_name) ? { planName: nonEmptyString(data.plan_name) } : {}),
        ...(nonEmptyString(data.status) ? { planStatus: nonEmptyString(data.status) } : {}),
        ...(finiteNumber(data.credit_balance) !== undefined ? { creditBalance: finiteNumber(data.credit_balance) } : {}),
        windows: {
            ...(fiveHour ? { fiveHour } : {}),
            ...(weekly ? { weekly } : {}),
        },
    };
}
async function fetchOverview(auth, requestTimeoutMs) {
    try {
        return await fetchWithTimeout(LLMGATE_BILLING_OVERVIEW_URL, {
            request: {
                method: "GET",
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${auth.accessToken}`,
                    "User-Agent": USER_AGENT,
                },
            },
            timeoutMs: requestTimeoutMs,
            consume: async (response) => {
                if (response.status === 401 || response.status === 403)
                    return { state: "unauthorized" };
                if (!response.ok) {
                    return {
                        state: "failed",
                        error: `LLMGate API error ${response.status}: ${sanitizeDisplaySnippet(await response.text(), 120)}`,
                    };
                }
                const parsed = parseOverview(await response.json());
                return parsed.success ? { state: "success", data: parsed } : { state: "failed", error: parsed.error };
            },
        });
    }
    catch (error) {
        return {
            state: "failed",
            error: sanitizeDisplayText(error instanceof Error ? error.message : String(error)),
        };
    }
}
export async function queryLlmGateQuota(options = {}) {
    let auth;
    try {
        auth = authTokensFromAuth(await readAuthFile());
    }
    catch {
        return null;
    }
    if (!auth)
        return null;
    // Provider owns login and renewal. Quota only accepts a complete login pair,
    // never reads a gateway credential, and never refreshes tokens itself.
    const result = await fetchOverview(auth, options.requestTimeoutMs);
    if (result.state === "success")
        return result.data;
    if (result.state === "unauthorized") {
        return {
            success: false,
            error: "LLMGate access token was rejected. Run /connect to sign in again.",
        };
    }
    return { success: false, error: result.error };
}
export async function hasLlmGateAuthTokens() {
    try {
        return Boolean(authTokensFromAuth(await readAuthFile()));
    }
    catch {
        return false;
    }
}
export async function getLlmGateAuthDiagnostics() {
    try {
        const metadata = authMetadataFromAuth(await readAuthFile());
        return {
            configured: Boolean(metadata.accessToken && metadata.refreshToken),
            accessTokenConfigured: Boolean(metadata.accessToken),
            refreshTokenConfigured: Boolean(metadata.refreshToken),
            authPaths: getAuthPaths(),
        };
    }
    catch {
        return {
            configured: false,
            accessTokenConfigured: false,
            refreshTokenConfigured: false,
            authPaths: getAuthPaths(),
        };
    }
}
//# sourceMappingURL=llmgate.js.map