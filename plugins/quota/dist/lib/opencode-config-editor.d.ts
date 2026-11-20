import { type ConfigWriteTargetSnapshot } from "./config-write-target.js";
import { type ConfigFileFormat, type EditableConfigPath } from "./opencode-config-files.js";
interface ManagedConfigComment {
    path: (string | number)[];
    text: string;
}
interface ConfigDocumentEdit {
    path: string;
    format: ConfigFileFormat;
    originalBytes: Buffer | null;
    writeTarget: ConfigWriteTargetSnapshot;
    updated: string;
    changed: boolean;
}
export declare class ConfigDocumentError extends Error {
    readonly path: string;
    constructor(message: string, path: string);
}
/** Parses either file kind the way OpenCode does: comments and trailing commas are allowed. */
export declare function parseConfigDocument(raw: string, path: string): Record<string, unknown>;
export declare function planConfigDocumentEdit(params: {
    target: EditableConfigPath;
    desiredData: Record<string, unknown>;
    managedComments?: ManagedConfigComment[];
}): Promise<ConfigDocumentEdit>;
export declare function applyConfigDocumentEdit(edit: ConfigDocumentEdit): Promise<void>;
export {};
