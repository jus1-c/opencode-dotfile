/**
 * Error thrown when a session is not found.
 *
 * OpenCode 2 stores sessions and messages in SQLite (`opencode.db`) under the
 * `session_v2` and `session_message` tables. This is thrown by
 * iterAssistantMessagesForSession when the database is missing/unreadable, the
 * session id is invalid, or the session row does not exist.
 */
export declare class SessionNotFoundError extends Error {
    readonly sessionID: string;
    readonly checkedPath: string;
    constructor(sessionID: string, checkedPath: string);
}
interface OpenCodeTokenCache {
    read: number;
    write: number;
}
interface OpenCodeTokens {
    input: number;
    output: number;
    reasoning?: number;
    cache: OpenCodeTokenCache;
}
export interface OpenCodeMessage {
    id: string;
    sessionID: string;
    role: "user" | "assistant" | string;
    providerID?: string;
    modelID?: string;
    tokens?: OpenCodeTokens;
    /** True when the stored message has token usage metadata, even when its values are all zero. */
    hasUsageMetadata?: boolean;
    /** OpenCode's structured assistant error type, e.g. `aborted` for an interrupted step. */
    errorType?: string;
    cost?: number;
    time?: {
        created?: number;
        completed?: number;
    };
}
export interface OpenCodeSessionInfo {
    id: string;
    title?: string;
    parentID?: string;
    time?: {
        created?: number;
        updated?: number;
    };
}
type OpenCodeDbStats = {
    dbPath: string;
    sessionCount: number;
    messageCount: number;
    assistantMessageCount: number;
};
export declare function getOpenCodeDbStats(): Promise<OpenCodeDbStats>;
export declare function iterAssistantMessages(params: {
    sinceMs?: number;
    untilMs?: number;
}): Promise<OpenCodeMessage[]>;
/**
 * Read authoritative completed assistant/model-loop rows by completion time.
 *
 * This path intentionally does not share the creation-time filters used by token
 * history. A request may be created before a window cutoff and complete inside it.
 */
export declare function iterCompletedAssistantMessages(params: {
    completedSinceMs?: number;
    completedUntilMs?: number;
}): Promise<OpenCodeMessage[]>;
/**
 * Reads the rows that used tokens, at most `pageSize` at a time so the caller can let other
 * work run between pages: assistant messages and compactions that recorded usage, by creation
 * time, without the copies a fork starts with. `role` is the row type ("assistant" or
 * "compaction"). With `sessionIDs`, reads only those sessions, one after another.
 */
export declare function readUsageMessagePages(params: {
    sinceMs?: number;
    untilMs?: number;
    sessionIDs?: readonly string[];
    pageSize: number;
}): AsyncGenerator<OpenCodeMessage[]>;
export declare function readAllSessionsIndex(): Promise<Record<string, OpenCodeSessionInfo>>;
/** The ids of a session and all its subagent sessions, depth first, children oldest first. */
export declare function resolveSessionTree(rootSessionID: string): Promise<string[]>;
export {};
