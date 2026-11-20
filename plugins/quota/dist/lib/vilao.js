/**
 * Vilao balance client.
 *
 * Vilao has no quota windows: it holds a pay-as-you-go balance. The percentage is measured
 * against the last balance this machine saw rise, so a top-up starts a new baseline and usage
 * lowers the percentage from there. The state file keeps that baseline between runs.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonAtomic } from "./atomic-json.js";
import { sanitizeDisplaySnippet, sanitizeDisplayText } from "./display-sanitize.js";
import { clampPercent } from "./format-utils.js";
import { requestJson } from "./http.js";
import { getCredentialDatabasePaths, readCredentialRows, } from "./opencode-auth.js";
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
/** The PAT of a Vilao login; undefined for a login of another method or without one. */
function patFromRow(row) {
    if (row.value.type !== "api")
        return undefined;
    // The database reader flattens metadata onto the value; the integration source keeps it
    // under `metadata`.
    return (nonEmptyString(row.value[VILAO_PAT_METADATA_KEY]) ??
        nonEmptyString(asRecord(row.value.metadata)[VILAO_PAT_METADATA_KEY]));
}
/** Every Vilao login that holds a PAT. */
export async function readVilaoPatLogins() {
    const rows = await readCredentialRows(["vilao"], { methods: ["key"] });
    return rows.flatMap((row) => {
        const pat = patFromRow(row);
        return pat ? [{ row, pat }] : [];
    });
}
function cents(value) {
    const amount = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(amount) || amount < 0)
        return undefined;
    return Math.round(amount * 100);
}
function fingerprint(pat) {
    return createHash("sha256").update(pat).digest("hex");
}
function statePath(accountFingerprint, runtimeDirs = getOpencodeRuntimeDirs()) {
    return join(runtimeDirs.stateDir, `quota-vilao-balance-${accountFingerprint}.json`);
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
        // State written before lastBalanceCents existed keeps its baseline and
        // treats this read as the previous balance.
        const lastBalanceCents = Number.isInteger(saved.lastBalanceCents) && Number(saved.lastBalanceCents) >= 0
            ? Number(saved.lastBalanceCents)
            : balanceCents;
        baselineCents = balanceCents > lastBalanceCents ? balanceCents : savedBaseline;
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
            lastBalanceCents: balanceCents,
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
/** The balance of one PAT, read and measured against its baseline. */
async function queryOne(pat, requestTimeoutMs, dependencies) {
    try {
        const reply = await requestJson(BALANCE_URL, {
            method: "GET",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${pat}`,
                "User-Agent": USER_AGENT,
            },
            secrets: [pat],
            timeoutMs: requestTimeoutMs,
        });
        if (!reply.ok) {
            const { failure } = reply;
            return {
                success: false,
                error: redactPat(failure.kind === "http"
                    ? `Vilao API error ${failure.status}: ${sanitizeDisplaySnippet(failure.detail, 120)}`
                    : failure.detail, pat),
            };
        }
        const balanceCents = cents(asRecord(asRecord(reply.json).data).balance);
        if (balanceCents === undefined) {
            return {
                success: false,
                error: "Vilao balance response returned an unexpected response shape",
            };
        }
        const state = await updateBaseline(pat, balanceCents, dependencies);
        return {
            success: true,
            balanceCents,
            baselineCents: state.baselineCents,
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
/** Reads the active Vilao balance, or null when no Vilao login holds a PAT. */
export async function queryVilaoQuota(options = {}, dependencies = {}) {
    const logins = await readVilaoPatLogins();
    const read = await Promise.all(logins.map(async ({ pat }) => ({
        pat,
        result: await queryOne(pat, options.requestTimeoutMs, dependencies),
    })));
    return read;
}
export async function getVilaoAuthDiagnostics() {
    const logins = await readVilaoPatLogins();
    const pat = logins[0]?.pat;
    return {
        configured: logins.length > 0,
        authPaths: getCredentialDatabasePaths(),
        statePath: pat
            ? statePath(fingerprint(pat))
            : join(getOpencodeRuntimeDirs().stateDir, "quota-vilao-balance-<account>.json"),
    };
}
/** The balance in đồng, whole: "40,000 ₫". */
export function formatVilaoVnd(cents) {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(cents / 100)} ₫`;
}
//# sourceMappingURL=vilao.js.map