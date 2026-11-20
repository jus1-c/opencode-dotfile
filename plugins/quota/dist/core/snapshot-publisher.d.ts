import type { ServerSettings } from "./provider-source.js";
import type { QuotaSnapshot } from "./types.js";
type SnapshotPublisher = {
    publish(snapshot: QuotaSnapshot): void;
    /** Resolves when nothing is waiting or running. */
    idle(): Promise<void>;
    /** Drops the gauges; later snapshots publish nothing. */
    dispose(): void;
};
export declare function createSnapshotPublisher(params: {
    loadSettings: () => Promise<Pick<ServerSettings, "export" | "telemetry">>;
    log: (message: string, error: unknown) => void;
}): SnapshotPublisher;
export {};
