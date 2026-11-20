type AtomicWritePolicy = "ordinary" | "configuration";
export interface WriteJsonAtomicOptions {
    trailingNewline?: boolean;
    directoryMode?: number;
    fileMode?: number;
    /** Default ordinary. Configuration never deletes the destination; it only removes the temp file. */
    policy?: AtomicWritePolicy;
    /** Runs after the temp file is written, right before it replaces `path`; throwing writes nothing. */
    beforeCommit?: () => Promise<void>;
}
export declare function writeJsonAtomic(path: string, data: unknown, opts?: WriteJsonAtomicOptions): Promise<void>;
export declare function writeTextAtomic(path: string, content: string, opts?: Omit<WriteJsonAtomicOptions, "trailingNewline">): Promise<void>;
export {};
