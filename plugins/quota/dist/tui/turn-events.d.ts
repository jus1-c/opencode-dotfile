/**
 * The session events after which quota toasts or refreshes, for the TUI and the GUI window: a
 * reply (`session.execution.succeeded`), a compaction, an answered question (the `question`
 * tool's call succeeded), and every step (each can use quota; the server skips a refresh that is
 * not due yet). Both read OpenCode's synced data events, `on(type, handler)`.
 */
import type { TurnEnd } from "./toasts.js";
export type SessionEvent = {
    location?: {
        directory?: string;
    };
    data?: Record<string, unknown>;
};
export type TurnListeners = {
    afterTurn(trigger: TurnEnd, sessionID: string, event: SessionEvent): void;
    stepEnded(sessionID: string, event: SessionEvent): void;
};
type On = (type: string, handler: (event: SessionEvent) => void) => () => void;
/** Listens to the turn events until the returned stop. */
export declare function listenForTurns(on: On, listeners: TurnListeners): () => void;
export {};
