/**
 * Quota toasts (§4.4). OpenCode shows one toast at a time, so quota takes a turn only when
 * the display settings say so: after compaction and when every provider fails by default;
 * after each reply, after a question, and on a limit reset only when turned on. A quota toast
 * shows its rows in the grouped or detailed layout (`toast.layout`), with bars in the sidebar's
 * bar shape; the host colors them where OpenCode can draw that (`toast-colors.tsx`). It has no
 * title: its rows say what it is. Every quota toast is made here, the Toast page's preview too.
 *
 * The Toast page's preview stays open while the page shows, until another toast replaces it. The
 * plugin API can only show a toast, for a duration; quota tells whether its toast is still on
 * screen from the toast's colored spans (`toast-colors.tsx`). The preview first shows like any
 * quota toast; while a copy of it is on screen, a new copy that lasts 3 s replaces it every
 * second. Leaving the page stops that and closes the preview: a copy that lasts 1 ms replaces it,
 * unless another toast already did. Without the spans the preview shows for `toast.seconds`, as
 * other quota toasts do.
 *
 * Once another toast replaces the preview, or a copy runs out before the next one comes (the TUI
 * stalled for over 2 s), the preview does not come back by itself: quota can't tell a copy that
 * is gone from one OpenCode holds back, and a new copy would cut the other toast short. A change
 * on the page, or Show toast, shows it again.
 *
 * While the mouse is on a toast, OpenCode pauses it and holds back the toasts shown meanwhile,
 * the closing copy too. Quota then adds no copy, a change on the page included, until its
 * held-back one shows. OpenCode shows each held-back toast in turn for its whole duration, and
 * the plugin API can't take one back. So once the mouse moves away, a closed preview ends within
 * about 6 s: the paused copy's rest, then the held-back copy. A copy held back behind another
 * toast, such as a reset notice that came while the mouse was on the preview, brings the preview
 * back after that toast; it shows then even when the page closed meanwhile, for 3 s, or for
 * `toast.seconds` when it is the preview's first toast.
 *
 * Reset notices that arrive together show as one toast. While a turn's toast is being made,
 * they wait and show after it, so the turn's toast does not replace them at once; each follows
 * the settings as they are when it shows. When the TUI leaves its server, waiting notices are
 * dropped unshown, so a later snapshot can bring them.
 */
import type { QuotaSnapshot, ResetNotice } from "../core/types.js";
import { type Line, type ToastInput } from "../view/text.js";
import type { QuotaClient } from "./client.js";
import type { DisplaySettings } from "./display.js";
import type { DrawnToast } from "./toast-colors.js";
/** The title of quota's one-line toasts (a hint, a wrong range); quota toasts have none. */
export declare const TOAST_TITLE = "OpenCode Quota";
export type ToastOptions = {
    variant: "info" | "success" | "warning" | "error";
    title?: string;
    message: string;
    duration: number;
};
export type TurnEnd = "reply" | "compaction" | "question";
export type ToastHost = {
    /**
     * Shows a toast. A quota toast brings its `lines` too, and a turn's the `input` they were laid
     * out from; its message is their plain text. Returns the toast when it can tell whether it is
     * still on screen.
     */
    show: (toast: ToastOptions, lines?: Line[], input?: ToastInput) => DrawnToast | undefined;
    /** The settings a toast follows: those of `snapshot`, the one it shows, when given. */
    display: (snapshot?: QuotaSnapshot) => DisplaySettings;
    /** The terminal's columns, which a toast's width follows. */
    terminalWidth: () => number;
    quota: Pick<QuotaClient, "refresh" | "snapshot">;
    /** Subagent (child) sessions never show quota toasts. */
    isChildSession: (sessionID: string) => boolean;
    /**
     * Which "every provider fails" toast a session's turn counts toward (each shows once until
     * some provider of its key answers again); without it, one for all sessions.
     */
    allFailKey?: (sessionID: string) => string;
    now?: () => number;
};
export type Toasts = {
    /**
     * A turn ended in `sessionID`: refresh quota, then show the toast the settings ask for,
     * then the reset notices that arrived meanwhile.
     */
    afterTurn(trigger: TurnEnd, sessionID: string): Promise<void>;
    /** Shows the reset notices of a snapshot that this TUI has not shown yet, in one toast. */
    showResetNotices(snapshot: QuotaSnapshot): void;
    /**
     * The Toast page's preview: the toast a turn would show in `sessionID` now. It replaces the
     * page's earlier preview and stays open until `closePreview` or another toast (see above).
     */
    preview(sessionID: string): void;
    /**
     * The Toast page closed: closes its preview, when that is still the toast on screen. A copy
     * that OpenCode holds back still shows (see above).
     */
    closePreview(): void;
    /** The TUI left its server: drops the notices still waiting, as not shown. */
    cancel(): void;
};
/**
 * The columns of a quota toast's text: OpenCode's toast is at most 60 columns and 6 fewer than
 * the terminal, inside a border and 2 columns of padding on each side; a toast without a title
 * has its close "x" beside the text.
 */
export declare function toastRoom(terminalWidth: number): number;
/** `toast.resetNotice` asks for a notice of this reset: every reset, or only weekly ones. */
export declare function wantsResetNotice(display: DisplaySettings, notice: ResetNotice): boolean;
/**
 * "Weekly quota reset: Claude (work) Weekly is available again (100% left).": the row under its
 * toast name, else its label, with the percent it had at the reset in the percent words.
 * The row is the notice's account's: several accounts can share a row id. Undefined when the
 * provider no longer has the row.
 */
export declare function resetMessage(notice: ResetNotice, snapshot: QuotaSnapshot, display: DisplaySettings, nowMs: number): string | undefined;
export declare function createToasts(host: ToastHost): Toasts;
