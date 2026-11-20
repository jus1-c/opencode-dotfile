import { WINDOWS } from "../core/windows.js";
import { levelOf } from "../view/format.js";
import { rowFacts } from "../view/row-facts.js";
import { visibleRow } from "../view/select.js";
import { lineText, toastInput, toastLines } from "../view/text.js";
/** The title of quota's one-line toasts (a hint, a wrong range); quota toasts have none. */
export const TOAST_TITLE = "OpenCode Quota";
/** While the Toast page shows, a new copy of its preview comes this often (see above)... */
const PREVIEW_STEP_MS = 1000;
/** ...and lasts this long: past the next copy, and short once the page closes. */
const PREVIEW_COPY_MS = 3000;
/** A copy of the preview shown this long replaces it and closes right away. */
const PREVIEW_CLOSE_MS = 1;
/** What a toast without a title keeps right of its text: OpenCode's close "x", 2 columns in. */
const CLOSE_ROOM = 3;
/**
 * The columns of a quota toast's text: OpenCode's toast is at most 60 columns and 6 fewer than
 * the terminal, inside a border and 2 columns of padding on each side; a toast without a title
 * has its close "x" beside the text.
 */
export function toastRoom(terminalWidth) {
    return Math.min(60, terminalWidth - 6) - 6 - CLOSE_ROOM;
}
function wantsTurnToast(display, trigger, anyLow) {
    if (trigger === "compaction")
        return display.toast.afterCompaction;
    if (trigger === "question")
        return display.toast.afterQuestion;
    return display.toast.afterReply === "always" || (display.toast.afterReply === "low" && anyLow);
}
/** `toast.resetNotice` asks for a notice of this reset: every reset, or only weekly ones. */
export function wantsResetNotice(display, notice) {
    if (!display.toast.show)
        return false;
    const setting = display.toast.resetNotice;
    return setting === "all" || (setting === "weekly" && notice.window === "week");
}
/**
 * "Weekly quota reset: Claude (work) Weekly is available again (100% left).": the row under its
 * toast name, else its label, with the percent it had at the reset in the percent words.
 * The row is the notice's account's: several accounts can share a row id. Undefined when the
 * provider no longer has the row.
 */
export function resetMessage(notice, snapshot, display, nowMs) {
    const provider = snapshot.providers.find((item) => item.providerId === notice.providerId);
    const row = provider?.rows.find((item) => item.id === notice.rowId && item.account === notice.account);
    if (!provider || !row)
        return undefined;
    const item = visibleRow({ ...row, percentRemaining: notice.percentRemaining }, display.toast.names);
    const place = { words: display.words, nowMs, names: "label", percent: "words" };
    const facts = rowFacts(item, { rows: [item] }, place);
    const title = notice.account ? `${provider.label} (${notice.account})` : provider.label;
    return `${WINDOWS[notice.window].label} quota reset: ${title} ${facts.name} is available again (${facts.value}).`;
}
export function createToasts(host) {
    const now = host.now ?? Date.now;
    /** Notices from before this TUI started were news to the TUI that saw them then. */
    const startedAtMs = now();
    const shownNotices = new Set();
    /** The "every provider fails" toast shows once until some provider answers again, by key. */
    const allFailShown = new Set();
    /** Turns whose toast is being made; reset notices wait for them. */
    let turnsRunning = 0;
    /** Reset notices to show, each with the snapshot it came in. */
    let waitingNotices = [];
    /** The Toast page's preview, until the page closes or a newer preview replaces it. */
    let preview;
    /** Shows the waiting reset notices the settings still ask for, worded as they are now. */
    function showNotices() {
        if (turnsRunning > 0 || waitingNotices.length === 0)
            return;
        const messages = waitingNotices.flatMap(({ notice, snapshot }) => {
            const display = host.display(snapshot);
            if (!wantsResetNotice(display, notice))
                return [];
            const message = resetMessage(notice, snapshot, display, now());
            return message ? [message] : [];
        });
        waitingNotices = [];
        if (messages.length === 0)
            return;
        host.show({
            variant: "success",
            title: "Quota available",
            message: messages.join("\n"),
            duration: host.display().toast.seconds * 1000,
        });
    }
    /** Shows a quota toast of `input`'s lines; nothing when they have no text. */
    function showQuota(variant, input, seconds) {
        const lines = toastLines(input);
        const message = lines.map(lineText).join("\n");
        if (message)
            host.show({ variant, message, duration: seconds * 1000 }, lines, input);
    }
    /** A quota toast now: the Toast surface's rows, as wide as the toast's text. */
    function quotaInput(snapshot, display) {
        return toastInput(snapshot, display, {
            nowMs: now(),
            width: toastRoom(host.terminalWidth()),
        });
    }
    /**
     * Shows a new copy of `open` while its last copy is on screen, then checks again in a second.
     * Until its newest copy is seen on screen it adds none: that copy may be held back or replaced
     * (see above).
     */
    function keepPreview(open) {
        if (preview !== open)
            return;
        if (open.next?.onScreen()) {
            open.shown = open.next;
            open.next = undefined;
        }
        if (open.next === undefined) {
            if (!open.shown?.onScreen())
                return;
            open.next = host.show({ ...open.toast, duration: PREVIEW_COPY_MS }, open.lines);
        }
        open.timer = setTimeout(() => keepPreview(open), PREVIEW_STEP_MS);
    }
    /** Closes the Toast page's preview when it is still on screen; another toast stays. */
    function closePreview() {
        const open = preview;
        preview = undefined;
        if (!open)
            return;
        clearTimeout(open.timer);
        if (!open.shown?.onScreen() && !open.next?.onScreen())
            return;
        host.show({ ...open.toast, duration: PREVIEW_CLOSE_MS }, open.lines);
    }
    async function turnToast(trigger, sessionID) {
        const snapshot = await host.quota.refresh("turn", sessionID);
        const display = host.display(snapshot);
        if (!snapshot || !display.toast.show)
            return;
        const input = quotaInput(snapshot, display);
        const allFail = snapshot.providers.length > 0 && snapshot.providers.every((provider) => provider.error);
        const allFailKey = host.allFailKey?.(sessionID) ?? "";
        if (!allFail)
            allFailShown.delete(allFailKey);
        const anyLow = input.groups.some((group) => group.rows.some(({ row }) => row.percentRemaining !== undefined &&
            levelOf(row.percentRemaining, display.colors) !== "good"));
        if (wantsTurnToast(display, trigger, anyLow)) {
            showQuota("info", input, display.toast.seconds);
            return;
        }
        if (allFail && display.toast.whenAllFail && !allFailShown.has(allFailKey)) {
            allFailShown.add(allFailKey);
            const failing = input.groups.filter((group) => group.error);
            showQuota("error", { ...input, groups: failing, sessionTokens: undefined }, display.toast.seconds);
        }
    }
    return {
        async afterTurn(trigger, sessionID) {
            if (host.isChildSession(sessionID))
                return;
            turnsRunning += 1;
            try {
                await turnToast(trigger, sessionID);
            }
            finally {
                turnsRunning -= 1;
                showNotices();
            }
        },
        showResetNotices(snapshot) {
            const display = host.display(snapshot);
            for (const notice of snapshot.resetNotices) {
                if (shownNotices.has(notice.id))
                    continue;
                shownNotices.add(notice.id);
                if (!wantsResetNotice(display, notice) || notice.atMs < startedAtMs)
                    continue;
                waitingNotices.push({ notice, snapshot });
            }
            showNotices();
        },
        preview(sessionID) {
            const snapshot = host.quota.snapshot(sessionID);
            const display = host.display(snapshot);
            const lines = snapshot && display.toast.show ? toastLines(quotaInput(snapshot, display)) : [];
            const message = lines.map(lineText).join("\n");
            if (!message) {
                closePreview();
                return;
            }
            const old = preview;
            clearTimeout(old?.timer);
            const toast = {
                variant: "info",
                message,
                duration: display.toast.seconds * 1000,
            };
            const open = { toast, lines, shown: undefined, next: undefined, timer: undefined };
            if (old?.shown?.onScreen() && old.next !== undefined && !old.next.onScreen()) {
                // OpenCode holds back the old preview's last copy, and would hold this toast too: the new
                // preview waits for that copy, then replaces it.
                open.shown = old.shown;
                open.next = old.next;
            }
            else {
                open.next = host.show(toast, lines);
            }
            preview = open;
            // Inside a Solid update OpenCode draws the toast only when the update ends: after this call.
            queueMicrotask(() => keepPreview(open));
        },
        closePreview,
        cancel() {
            for (const { notice } of waitingNotices)
                shownNotices.delete(notice.id);
            waitingNotices = [];
        },
    };
}
//# sourceMappingURL=toasts.js.map