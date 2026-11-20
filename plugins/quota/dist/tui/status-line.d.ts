import type { JSX } from "@opentui/solid";
import { type SurfaceHost } from "./sidebar.js";
/**
 * The status line shows under a session's message box: it is on, and its Settings tab is open,
 * it shows next to the sidebar, or no sidebar panel with quota is on screen.
 */
export declare function statusLineShows(host: SurfaceHost): boolean;
/**
 * The flex basis of the status line's box: the width it asks for before the free room is
 * shared. OpenCode's session footer cuts its folder name to the room that name had at the last
 * layout, so at start a long folder name keeps all the free room, and a box with basis 0 stays
 * empty. With this basis the folder name gives room back: `wanted` columns (the line's
 * narrowest form), but never more than a third of the footer row, nor more than the
 * `statusLine.width` setting (0: no limit). The box still shrinks with the folder name when the
 * row is too narrow for both.
 */
export declare function statusLineBasis(wanted: number, rowWidth: number, maxWidth: number): number;
export declare function StatusLine(props: {
    host: SurfaceHost;
    sessionID?: string;
    /** The terminal's width: the footer row's width until the box is first measured. */
    terminalWidth?: () => number;
}): JSX.Element;
/**
 * The bottom of Home: the maintainer notice line, then the status line when it is on for Home.
 * Home has its own switch (`statusLine.home`); the one for sessions does not hide it.
 */
export declare function HomeFooter(props: {
    host: SurfaceHost;
}): JSX.Element;
