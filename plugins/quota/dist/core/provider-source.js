/**
 * The providers as the store needs them: which ones the server settings turn on and which of
 * those are available, how to ask each one, and who it is signed in as. Every read takes the
 * settings the host holds now, so a settings change applies to the next snapshot or refresh.
 */
import { createHmac, randomBytes } from "node:crypto";
import { withOpenCodeConfigReadScope } from "../lib/opencode-config-files.js";
import { getQuotaProviderDisplayLabel, isLiveLocalUsageProviderId, } from "../lib/provider-metadata.js";
import { exportProviderFromCheck } from "../lib/quota-export.js";
import { cloneQuotaProviders, QUOTA_PROVIDERS_AGGREGATE_ID, selectEligibleQuotaProviderDefinitions, } from "../lib/quota-providers.js";
import { deriveResolvedAuthIdentity, isResolvedAuthIdentityKeyDurable, } from "../lib/resolved-auth-identity.js";
import { createRuntimeProviderIdResolver } from "../lib/runtime-provider-ids.js";
import { getProviders } from "../providers/registry.js";
import { offProviderId } from "../settings/schema.js";
import { rowsFromProviderResult } from "./rows.js";
import { matchesQuotaProviderCurrentSelection } from "./selection.js";
export function customRowPrefix(definitionId) {
    return `${QUOTA_PROVIDERS_AGGREGATE_ID}.custom.${definitionId}.`;
}
export function registeredProviders(host) {
    return host.providers ? host.providers() : getProviders();
}
/** All registered providers except the ids switched off, with custom mapped to its registry id. */
function registryProviderIds(providers, off) {
    return providers.map((provider) => provider.id).filter((id) => !off.includes(offProviderId(id)));
}
/** What every provider reads from the settings when it checks its quota. */
export function providerContext(host, loaded = host.settings(), model) {
    const { settings, fromFile } = loaded;
    const { anthropic, cursor, opencode } = settings.providers;
    return {
        client: host.client,
        resolveRuntimeProviderIds: createRuntimeProviderIdResolver(host.client),
        workspaceRoot: host.workspaceRoot,
        locationDirectory: host.locationDirectory,
        config: {
            anthropicBinaryPath: anthropic.binaryPath,
            cursorPlan: cursor.plan,
            cursorIncludedApiUsd: cursor.includedApiUsd ?? undefined,
            cursorBillingCycleStartDay: cursor.billingCycleStartDay ?? undefined,
            opencodeMonthlyLimit: opencode.monthlyLimitUsd ?? undefined,
            requestTimeoutMs: settings.providers.checking.requestTimeoutMs,
            requestTimeoutMsConfigured: fromFile.includes("providers.checking.requestTimeoutMs"),
            enabledProviders: registryProviderIds(registeredProviders(host), settings.providers.off),
            automaticDiscovery: true,
            quotaProviders: cloneQuotaProviders(settings.providers.custom),
            currentModel: model?.id,
            currentProviderID: model?.providerID,
        },
    };
}
function providerIdsForModel(providers, ctx, model) {
    return providers
        .filter((provider) => matchesQuotaProviderCurrentSelection({
        provider,
        currentModel: model.id,
        currentProviderID: model.providerID,
        enabledProviders: ctx.config.enabledProviders,
        automaticDiscovery: ctx.config.automaticDiscovery,
        quotaProviders: ctx.config.quotaProviders,
    }))
        .map((provider) => provider.id);
}
/** OpenCode's provider ids; none when its list can't be read. */
async function openCodeProviderIds(ctx) {
    try {
        return await ctx.resolveRuntimeProviderIds();
    }
    catch {
        return new Set();
    }
}
/**
 * The custom definitions (rows `customRowPrefix(id)`) that serve `model`; without OpenCode's
 * provider list none can be matched to a model.
 */
function customDefinitionIdsForModel(ctx, availableProviderIds, model) {
    return selectEligibleQuotaProviderDefinitions({
        definitions: ctx.config.quotaProviders ?? [],
        availableProviderIds,
        onlyCurrentModel: true,
        currentModel: model.id,
        currentProviderID: model.providerID,
    }).map((definition) => definition.id);
}
/** The quota-providers aggregate needs the custom definitions OpenCode can serve right now. */
async function cacheContextFor(provider, ctx) {
    if (provider.id !== QUOTA_PROVIDERS_AGGREGATE_ID)
        return {};
    return {
        runtimeEligibleQuotaProviders: selectEligibleQuotaProviderDefinitions({
            definitions: ctx.config.quotaProviders ?? [],
            availableProviderIds: await ctx.resolveRuntimeProviderIds(),
        }),
    };
}
/** The signed-in account per the provider's cache policy; null when it can't be told safely. */
async function accountIdentity(provider, ctx, cacheContext) {
    const policy = provider.cachePolicy;
    if (!policy || policy.kind === "uncached")
        return null;
    if (policy.kind === "account-neutral")
        return "account-neutral";
    try {
        return await policy.resolveIdentity(ctx, cacheContext);
    }
    catch {
        return null;
    }
}
/** Keys logins while the identity key can't be read; no account is saved then. */
const processLoginKey = randomBytes(32);
/**
 * Each login (a source id: an account number, a credential id, often an email) as an opaque id
 * keyed with the identity key (the install's protected key, or one held in memory where it
 * can't be protected), so the snapshot file and notice ids can't be matched against guessed
 * emails. Without that key no account identity exists either, so the store keeps such rows in
 * memory only, and a key of this process is enough.
 */
export async function keyedLogins(providerId, logins) {
    return Promise.all(logins.map(async (login) => {
        if (!login)
            return "";
        const keyed = await deriveResolvedAuthIdentity({
            providerId,
            principal: { kind: "stable-id", value: login },
            qualifiers: ["v6-row-login"],
        });
        return (keyed ??
            createHmac("sha256", processLoginKey)
                .update(JSON.stringify([providerId, login]))
                .digest("base64url"));
    }));
}
function storeProvider(provider, ctx, settingsKey, definition) {
    const cacheContext = () => definition
        ? Promise.resolve({ runtimeEligibleQuotaProviders: [definition] })
        : cacheContextFor(provider, ctx);
    const buildExportPart = (check, accounts) => exportProviderFromCheck({
        ...check,
        providerId: provider.id,
        label: getQuotaProviderDisplayLabel(provider.id),
        customDefinitions: ctx.config.quotaProviders ?? [],
        accounts,
    });
    return {
        id: provider.id,
        ...(definition ? { key: `${provider.id}:${definition.id}` } : {}),
        label: getQuotaProviderDisplayLabel(provider.id),
        // Cursor counts OpenCode's own history: cheap, and stale at once.
        ...(isLiveLocalUsageProviderId(provider.id) ? { minIntervalMs: 0 } : {}),
        ...(definition?.minIntervalMs === undefined ? {} : { minIntervalMs: definition.minIntervalMs }),
        ...(definition
            ? {
                restoreExportPart(snapshot) {
                    // The saved rows can predate a failed check; only that check determines source status.
                    const answered = snapshot.okAtMs === snapshot.checkedAtMs;
                    return buildExportPart({ ...snapshot, checkedAtMs: snapshot.checkedAtMs }, [
                        {
                            name: definition.label,
                            login: definition.id,
                            rows: answered ? snapshot.rows.map((row) => ({ ...row, key: row.id })) : [],
                            errors: snapshot.error ? [{ message: "" }] : [],
                        },
                    ]);
                },
            }
            : {}),
        async identity() {
            const account = await accountIdentity(provider, ctx, await cacheContext());
            if (account === null) {
                const scope = provider.cachePolicy?.kind === "resolved-auth"
                    ? await provider.cachePolicy.resolveScope?.(ctx)
                    : undefined;
                return { key: scope ? `${scope}\u001f${settingsKey}` : settingsKey, persist: false };
            }
            // An account keyed in memory only is another one after a reload: its rows stay in memory.
            const persist = provider.cachePolicy.kind !== "resolved-auth" || isResolvedAuthIdentityKeyDurable();
            return { key: `${account}\u001f${settingsKey}`, persist };
        },
        async fetch() {
            const result = await provider.fetch(ctx, await cacheContext());
            const fetched = rowsFromProviderResult(provider.id, result);
            const exportPart = (check) => buildExportPart(check, result.accounts);
            if (!fetched.rowLogins)
                return { ...fetched, buildExportPart: exportPart };
            return {
                ...fetched,
                rowLogins: await keyedLogins(provider.id, fetched.rowLogins),
                buildExportPart: exportPart,
            };
        },
    };
}
/** The store's source: the enabled and available providers, with the settings now. */
export function loadProviderSource(host, model) {
    return withOpenCodeConfigReadScope(() => readProviderSource(host, model));
}
async function readProviderSource(host, model) {
    const loaded = host.settings();
    const providers = registeredProviders(host);
    const ctx = providerContext(host, loaded, model);
    // Resolve scopes even for unavailable or disabled providers: their absence must belong to
    // the same credential source as their rows. Settings changes keep that source's scope.
    const scopes = await Promise.all(providers.map(async (provider) => {
        if (provider.cachePolicy?.kind !== "resolved-auth")
            return undefined;
        const scope = await provider.cachePolicy.resolveScope?.(ctx);
        return scope === undefined ? undefined : [provider.id, scope];
    }));
    const scoped = scopes.filter((scope) => scope !== undefined);
    const { enabledProviders } = ctx.config;
    const enabled = providers.filter((provider) => enabledProviders.includes(provider.id));
    const available = await Promise.all(enabled.map(async (provider) => {
        try {
            return await provider.isAvailable(ctx);
        }
        catch {
            return false;
        }
    }));
    // A settings change that alters what a provider reports also changes its identity.
    const { config } = ctx;
    const settingsKey = JSON.stringify([
        config.anthropicBinaryPath ?? null,
        config.cursorPlan,
        config.cursorIncludedApiUsd ?? null,
        config.cursorBillingCycleStartDay ?? null,
        config.opencodeMonthlyLimit ?? null,
        config.quotaProviders ?? [],
    ]);
    const availableProviderIds = config.quotaProviders?.length
        ? await openCodeProviderIds(ctx)
        : new Set();
    const customDefinitions = selectEligibleQuotaProviderDefinitions({
        definitions: config.quotaProviders ?? [],
        availableProviderIds,
    });
    const separateCustomChecks = customDefinitions.some((definition) => definition.minIntervalMs !== undefined);
    return {
        ...(scoped.length ? { scope: JSON.stringify(scoped) } : {}),
        providers: enabled
            .filter((_, index) => available[index])
            .flatMap((provider) => provider.id === QUOTA_PROVIDERS_AGGREGATE_ID && separateCustomChecks
            ? customDefinitions.map((definition) => storeProvider(provider, ctx, JSON.stringify([settingsKey, definition.id]), definition))
            : [storeProvider(provider, ctx, settingsKey)]),
        minIntervalMs: loaded.settings.providers.checking.minIntervalMs,
        providerIdsForModel: (model) => providerIdsForModel(providers, ctx, model),
        // A custom definition's rows serve only the models the definition serves.
        rowPrefixesForModel: (model) => ({
            [QUOTA_PROVIDERS_AGGREGATE_ID]: customDefinitionIdsForModel(ctx, availableProviderIds, model).map(customRowPrefix),
        }),
    };
}
export async function loadServerSettings(host) {
    const { settings } = host.settings();
    return {
        waitForQuotaReset: settings.providers.checking.waitForQuotaReset,
        export: { enabled: settings.system.exportFile, path: settings.system.exportPath },
        telemetry: settings.system.telemetry,
    };
}
//# sourceMappingURL=provider-source.js.map