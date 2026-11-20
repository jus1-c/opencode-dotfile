import { type ConfigFileFormat } from "./opencode-config-files.js";
interface ReconcileDetectedProviderConfigOptions {
    /** The session's folder: the OpenCode config files that count for it say what is declared. */
    directory: string;
    detectedProviderIds: readonly string[];
}
interface ReconcileDetectedProviderConfigResult {
    path: string | null;
    format: ConfigFileFormat | null;
    addedProviderIds: string[];
    changed: boolean;
}
/** The providers the OpenCode config files that count for `directory` declare or imply. */
export declare function loadConfiguredProviderIds(directory: string): Promise<string[]>;
/**
 * Adds providers proven available at runtime, and declared in no OpenCode config file that
 * counts for the session, to the global OpenCode config only; see `globalConfigWriteTarget`.
 */
export declare function reconcileDetectedProvidersInGlobalConfig(options: ReconcileDetectedProviderConfigOptions): Promise<ReconcileDetectedProviderConfigResult>;
export {};
