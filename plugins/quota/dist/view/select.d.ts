/**
 * Which providers and rows a surface shows, in which order and under which names. Pure:
 * every surface (TUI, Web text, CLI) picks its rows here from the snapshot and the display
 * settings.
 */
import type { QuotaError, QuotaRow, QuotaSnapshot, QuotaWindow, Words } from "../core/types.js";
export type Surface = "sidebar" | "collapsed" | "statusLine" | "toast";
/**
 * What one surface shows: its section of the settings (`sidebar.hidden`, …). Ids not named in an
 * order follow in the snapshot's order.
 */
export type SurfaceRows = {
    /** Provider ids and row ids this surface leaves out. */
    hidden: string[];
    providerOrder: string[];
    /** Row ids per provider id. */
    rowOrder: Record<string, string[]>;
    /**
     * Your names for rows, by row id: on the sidebar, which the collapsed sidebar and the status
     * line share, and on the toast.
     */
    names?: Record<string, string>;
};
/** The window a provider shows in the collapsed sidebar and the status line. */
export type WindowChoice = "lowest" | QuotaWindow;
export type RowSettings = Record<Surface, SurfaceRows>;
/** A row as a place shows it: `label` is your name for it, or its own; `named` says you named it. */
export type VisibleRow = {
    row: QuotaRow;
    label: string;
    named: boolean;
};
export declare function visibleRow(row: QuotaRow, names: Readonly<Record<string, string>>): VisibleRow;
/** One provider account on a surface: its title, its rows, and its last error. */
export type Group = {
    /** Provider id, or `${providerId} (account)` when it has several accounts. */
    id: string;
    providerId: string;
    /** "Claude" or "Claude (work)". */
    title: string;
    name: string;
    account?: string;
    rows: VisibleRow[];
    error?: QuotaError;
    /** True before the provider was ever checked. */
    unchecked: boolean;
};
/** `ids` first in the given order, then the rest in their own order. */
export declare function ordered<T>(items: readonly T[], idOf: (item: T) => string, order: readonly string[]): T[];
/**
 * The providers and rows `surface` shows, in order, with your row names: the toast's on toasts,
 * the sidebar's everywhere else.
 */
export declare function visibleGroups(snapshot: QuotaSnapshot, settings: RowSettings, surface: Surface, words: Words): Group[];
/**
 * The window a group shows in the collapsed sidebar or the status line, and the one its Settings
 * ‹ › shows: its provider's own pick; else the pick for all providers when one of its rows with a
 * percent has that window; else "lowest" (where `pickRow` would fall back anyway).
 */
export declare function windowFor(windows: Readonly<Record<string, WindowChoice>>, group: Pick<Group, "providerId" | "rows">): WindowChoice;
/**
 * The one row a group shows in the collapsed sidebar and the status line: the preferred
 * window's row; with "lowest", or when the group has no row of that window, the row with the
 * least left; else the first row.
 */
export declare function pickRow(group: Pick<Group, "rows">, choice?: WindowChoice): VisibleRow | undefined;
/** Keep the independent Codex balance beside the chosen window on the status line.
 * Rows already carry surface hiding, ordering and custom names. */
export declare function statusGroups(groups: Group[], windows: Readonly<Record<string, WindowChoice>>): Group[];
