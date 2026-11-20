import type { ObservableResult } from "@opentelemetry/api";
import type { QuotaSnapshot } from "../core/types.js";
type ObservableCallback = (result: ObservableResult) => void;
type ObservableGauge = {
    addCallback(callback: ObservableCallback): void;
    removeCallback?(callback: ObservableCallback): void;
};
type TelemetryApi = {
    metrics: {
        getMeter(name: string): {
            createObservableGauge(name: string, options: {
                description: string;
                unit: string;
            }): ObservableGauge;
        };
    };
};
type TelemetryApiLoader = () => Promise<TelemetryApi>;
interface QuotaTelemetryToken {
    readonly ownerId: number;
    readonly generation: number;
}
export declare function configureQuotaTelemetry(params: {
    owner: object;
    enabled: boolean;
    identity: string;
}): QuotaTelemetryToken | undefined;
export declare function disposeQuotaTelemetryOwner(ownerKey: object): void;
/**
 * Publishes the percent rows of a quota snapshot as this owner's series, replacing what the
 * owner published before. Each provider reports how old its rows are (`okAtMs`).
 */
export declare function publishQuotaTelemetry(token: QuotaTelemetryToken | undefined, snapshot: QuotaSnapshot): void;
export declare function __flushQuotaTelemetryInitializationForTests(): Promise<void>;
export declare function __setQuotaTelemetryApiLoaderForTests(loader: TelemetryApiLoader): void;
export declare function __resetQuotaTelemetryForTests(): void;
export {};
