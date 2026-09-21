import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonAtomic } from "./atomic-json.js";
import { sanitizeDisplaySnippet, sanitizeDisplayText } from "./display-sanitize.js";
import { clampPercent } from "./format-utils.js";
import { fetchWithTimeout } from "./http.js";
import { getAuthPaths, readAuthFile } from "./opencode-auth.js";
import { getOpencodeRuntimeDirs } from "./opencode-runtime-paths.js";
const BALANCE_URL = "https://vilao.ai/api/v2/account/balance";
const STATE_VERSION = 1;
const USER_AGENT = "OpenCode-Quota-Toast/1.0";
export const VILAO_PAT_METADATA_KEY = "vilao_pat";
const stateUpdates = new Map();
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
function nonEmptyString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function patFromAuth(auth) {
    const entry = asRecord(asRecord(auth).vilao);
    if (entry.type !== "api")
        return undefined;
    return nonEmptyString(asRecord(entry.metadata)[VILAO_PAT_METADATA_KEY]);
}
function cents(value) {
    const amount = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(amount) || amount < 0)
        return undefined;
    return Math.round(amount * 100);
}
function statePath(accountFingerprint, runtimeDirs = getOpencodeRuntimeDirs()) {
    return join(runtimeDirs.stateDir, `quota-vilao-balance-${accountFingerprint}.json`);
}
function fingerprint(pat) {
    return createHash("sha256").update(pat).digest("hex");
}
async function updateBaseline(pat, balanceCents, dependencies) {
    const accountFingerprint = fingerprint(pat);
    const path = statePath(accountFingerprint, dependencies.runtimeDirs);
    const previous = stateUpdates.get(path) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
        release = resolve;
    });
    const queued = previous.then(() => current);
    stateUpdates.set(path, queued);
    await previous;
    const readText = dependencies.readText ?? ((target) => readFile(target, "utf8"));
    const writeState = dependencies.writeState ??
        ((target, state) => writeJsonAtomic(target, state, { trailingNewline: true, fileMode: 0o600 }));
    let baselineCents = balanceCents;
    try {
        const saved = asRecord(JSON.parse(await readText(path)));
        const savedBaseline = Number.isInteger(saved.baselineCents) && Number(saved.baselineCents) >= 0
            ? Number(saved.baselineCents)
            : undefined;
        if (saved.version !== STATE_VERSION ||
            saved.accountFingerprint !== accountFingerprint ||
            savedBaseline === undefined) {
            throw new Error("Vilao balance baseline state is invalid; remove it to start a new baseline");
        }
        baselineCents = Math.max(savedBaseline, balanceCents);
    }
    catch (error) {
        const code = error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "";
        if (code !== "ENOENT") {
            release();
            if (stateUpdates.get(path) === queued)
                stateUpdates.delete(path);
            throw error;
        }
    }
    try {
        await writeState(path, {
            version: STATE_VERSION,
            accountFingerprint,
            baselineCents,
            updatedAt: dependencies.nowMs ?? Date.now(),
        });
        return { baselineCents, path };
    }
    finally {
        release();
        if (stateUpdates.get(path) === queued)
            stateUpdates.delete(path);
    }
}
function redactPat(text, pat) {
    return sanitizeDisplayText(text.split(pat).join("[redacted]"));
}
export function formatVilaoVnd(value) {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)} VND`;
}
export async function queryVilaoQuota(options = {}, dependencies = {}) {
    const pat = patFromAuth(await readAuthFile());
    if (!pat)
        return null;
    try {
        const balanceCents = await fetchWithTimeout(BALANCE_URL, {
            request: {
                method: "GET",
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${pat}`,
                    "User-Agent": USER_AGENT,
                },
            },
            timeoutMs: options.requestTimeoutMs,
            consume: async (response) => {
                if (response.status === 401 || response.status === 403) {
                    throw new Error("Vilao PAT was rejected. Run /connect to connect Vilao again.");
                }
                if (!response.ok) {
                    throw new Error(`Vilao API error ${response.status}: ${sanitizeDisplaySnippet(redactPat(await response.text(), pat), 120)}`);
                }
                const balance = cents(asRecord(asRecord(await response.json()).data).balance);
                if (balance === undefined) {
                    throw new Error("Vilao balance response returned an unexpected response shape");
                }
                return balance;
            },
        });
        const state = await updateBaseline(pat, balanceCents, dependencies);
        return {
            success: true,
            balance: balanceCents / 100,
            baseline: state.baselineCents / 100,
            percentRemaining: state.baselineCents === 0 ? 0 : clampPercent((balanceCents / state.baselineCents) * 100),
            statePath: state.path,
        };
    }
    catch (error) {
        return {
            success: false,
            error: redactPat(error instanceof Error ? error.message : String(error), pat),
        };
    }
}
export async function hasVilaoPat() {
    try {
        return Boolean(patFromAuth(await readAuthFile()));
    }
    catch {
        return false;
    }
}
export async function getVilaoCacheIdentity() {
    try {
        const pat = patFromAuth(await readAuthFile());
        return pat ? fingerprint(pat) : undefined;
    }
    catch {
        return undefined;
    }
}
export async function getVilaoAuthDiagnostics() {
    const identity = await getVilaoCacheIdentity();
    return {
        configured: Boolean(identity),
        authPaths: getAuthPaths(),
        statePath: identity
            ? statePath(identity)
            : join(getOpencodeRuntimeDirs().stateDir, "quota-vilao-balance-<account>.json"),
    };
}
//# sourceMappingURL=vilao.js.map