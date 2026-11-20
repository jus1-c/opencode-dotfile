/**
 * The provider tree of a Settings surface page (Sidebar, Collapsed, Status line, Toast): its
 * lines, and the edits the page's keys, clicks and drags make to the display settings. A provider
 * moves with its rows; a row moves only among its own provider's rows. Pure.
 */
import type { QuotaSnapshot } from "../../core/types.js";
import { type Surface, type WindowChoice } from "../../view/select.js";
import type { DisplaySettings, SettingsTab } from "../display.js";
/** A change of the display settings, as `DisplayStore.edit` makes it. */
export type SettingsEdit = (settings: DisplaySettings) => DisplaySettings;
/**
 * One line of the tree: a provider, or one of its rows on a page that shows rows. `detail` is
 * what the page shows of it ("3% left · 2h"), its error, or why it shows nothing; `window` is what
 * its ‹ › shows (only a provider with two windows or more, on Collapsed and Status line); `hidden`
 * is an unticked line; `muted` a line that it, its provider or the surface switch leaves out.
 */
export type TreeLine = {
    id: string;
    providerId: string;
    row: boolean;
    /** A row that is its provider's last one (└, not ├). */
    last: boolean;
    label: string;
    detail: string;
    window?: WindowChoice;
    hidden: boolean;
    muted: boolean;
};
export type SurfaceEditor = ReturnType<typeof surfaceEditor>;
/** Sidebar and Toast list each provider's rows under it; Collapsed and Status line don't. */
export declare function showsRows(page: SettingsTab): boolean;
/**
 * The tree and edits of `surface`'s page. Without a snapshot the tree is empty, so only the
 * surface switch and the ticks edit anything. Each edit reads the settings it is given.
 */
export declare function surfaceEditor(surface: Surface, snapshot?: QuotaSnapshot): {
    /** The tree's lines, top to bottom: each provider, then its rows on a page that shows rows. */
    lines(settings: DisplaySettings, nowMs: number): TreeLine[];
    /** The surface switch on top of the page, flipped. */
    toggleSurface(): SettingsEdit;
    /** A tick: the page shows the provider or row again, or leaves it out. */
    toggleHidden(id: string): SettingsEdit;
    /**
     * ‹ or ›: the provider's window steps `delta` through its choices. The window it would show
     * without a pick of its own is no pick, so it follows "For all providers" again. Nothing on a
     * line without ‹ ›: a page that shows rows, or a provider with fewer than two windows.
     */
    cycleWindow(providerId: string, delta: number): SettingsEdit;
    /** A click on one of the provider's windows (`windowChoices`): the same as stepping to it. */
    pickWindow(providerId: string, choice: WindowChoice): SettingsEdit;
    /** The windows a provider's ‹ › steps through; none where `cycleWindow` does nothing. */
    windowChoices(providerId: string, settings: DisplaySettings): WindowChoice[];
    /** shift+↑↓: `id` moves `delta` places. */
    move(id: string, delta: number): SettingsEdit;
    /**
     * A drag: `id` goes where the pointer is, `pointer` lines below the tree's first line. A row
     * never leaves its provider: a pointer outside counts as its provider's first or last row.
     */
    drag(id: string, pointer: number): SettingsEdit;
    /**
     * e or a double-click on a row: typing its new name (nothing typed puts its own name back),
     * with the hint. Its line's label is the input's placeholder. Undefined for a provider, or on a
     * page without rows.
     */
    rename(id: string): {
        hint: string;
        apply: (text: string) => SettingsEdit;
    } | undefined;
};
/**
 * Where a dragged block goes, given the line under the pointer (0 = the first block's first
 * line). It moves only when the pointer would land inside it after the move, so blocks of
 * different heights never flip back and forth.
 */
export declare function dropIndex(from: number, heights: readonly number[], pointer: number): number;
