import type { QuotaProvider, QuotaProviderContext } from "../lib/entries.js";
import type { LoadedSettings } from "../settings/index.js";
import type { StoreSource } from "./store.js";
import type { SessionModel } from "./types.js";
export type ProviderSourceHost = {
    /** OpenCode's provider list, for availability and model checks. */
    client: QuotaProviderContext["client"];
    /** The project folder quota is computed for. */
    workspaceRoot: string;
    /** The folder OpenCode runs the session in; see `QuotaProviderContext.locationDirectory`. */
    locationDirectory: string;
    settings: () => LoadedSettings;
    /** The registered providers in display order; `getProviders()` when absent. */
    providers?: () => readonly QuotaProvider[];
};
/** The settings the server reads besides the providers themselves. */
export type ServerSettings = {
    waitForQuotaReset: boolean;
    /** The export file, written after each snapshot change when on. */
    export: {
        enabled: boolean;
        path: string;
    };
    /** Quota gauges through the host's OpenTelemetry MeterProvider. */
    telemetry: boolean;
};
export declare function customRowPrefix(definitionId: string): string;
export declare function registeredProviders(host: ProviderSourceHost): readonly QuotaProvider[];
/** What every provider reads from the settings when it checks its quota. */
export declare function providerContext(host: ProviderSourceHost, loaded?: LoadedSettings, model?: SessionModel): QuotaProviderContext;
/**
 * Each login (a source id: an account number, a credential id, often an email) as an opaque id
 * keyed with the identity key (the install's protected key, or one held in memory where it
 * can't be protected), so the snapshot file and notice ids can't be matched against guessed
 * emails. Without that key no account identity exists either, so the store keeps such rows in
 * memory only, and a key of this process is enough.
 */
export declare function keyedLogins(providerId: string, logins: readonly string[]): Promise<string[]>;
/** The store's source: the enabled and available providers, with the settings now. */
export declare function loadProviderSource(host: ProviderSourceHost, model?: SessionModel): Promise<StoreSource>;
export declare function loadServerSettings(host: ProviderSourceHost): Promise<ServerSettings>;
