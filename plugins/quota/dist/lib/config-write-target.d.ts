export declare const MAX_CONFIG_SYMLINK_HOPS = 40;
export declare const NEW_CONFIG_FILE_MODE = 384;
export declare const NEW_CONFIG_DIRECTORY_MODE = 448;
type ConfigWriteTargetReason = "dangling" | "loop" | "depth" | "non-regular" | "permission" | "changed" | "bytes-changed";
interface ConfigWriteHop {
    path: string;
    linkText: string;
}
export interface ConfigWriteTargetSnapshot {
    configuredPath: string;
    writePath: string;
    hops: ConfigWriteHop[];
    terminalExisted: boolean;
}
export declare class ConfigWriteTargetError extends Error {
    readonly path: string;
    readonly reason: ConfigWriteTargetReason;
    constructor(message: string, path: string, reason: ConfigWriteTargetReason);
}
export declare function configWriteTargetsEqual(left: ConfigWriteTargetSnapshot, right: ConfigWriteTargetSnapshot): boolean;
export declare function resolveConfigWriteTarget(path: string): Promise<ConfigWriteTargetSnapshot>;
export declare function writeResolvedConfigText(snapshot: ConfigWriteTargetSnapshot, content: string, beforeCommit?: () => Promise<void>): Promise<void>;
export {};
