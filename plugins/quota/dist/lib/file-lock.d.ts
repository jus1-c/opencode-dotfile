/**
 * The lock was taken over, or what the work read changed, while it ran: nothing was written, and
 * the work runs again.
 */
export declare class LockLostError extends Error {
}
/**
 * Throws when the lock no longer holds our token. Call it right before the write that commits
 * (the atomic rename over the file).
 */
export type LockFence = () => Promise<void>;
/**
 * Runs `work` while holding the lock file `lock`, making its folder (mode 700) first. `work`
 * calls the fence it gets right before it commits; when the lock was lost, the work runs again
 * under a new lock. After `waitMs` without the lock it fails with `busyMessage`.
 */
export declare function withFileLock<T>(lock: string, work: (fence: LockFence) => Promise<T>, options: {
    waitMs: number;
    busyMessage: string;
}): Promise<T>;
