/** @jsxImportSource @opentui/solid */
/**
 * Quota toasts in the sidebar's colors, through a trick OpenCode does not promise to keep.
 * OpenCode's plugin API types a toast's message as a string and draws a string in one color.
 * OpenCode's toast (checked on 2.0.26 to 2.0.28) passes the message on unchanged and puts it
 * inside its <text>, and plugins share OpenCode's @opentui/solid and solid-js, so a message of
 * <span>s draws each span in its own color.
 *
 * Quota sends the spans on every OpenCode version, once the TUI has drawn (the spans are made
 * under its renderer). Any error while making or showing the spans shows the plain message: the
 * same characters.
 *
 * The spans also tell whether their toast is still the one on screen: while it is, they hang
 * under the renderer's root through OpenCode's <text> and the toast's boxes. The plugin API has
 * no way to ask that or to close a toast; the Toast page's preview needs both (`toasts.ts`).
 */
import type { JSX } from "@opentui/solid";
import { type Owner } from "solid-js";
import type { Line } from "../view/text.js";
import type { DisplaySettings } from "./display.js";
import { type Theme } from "./theme.js";
import type { ToastOptions } from "./toasts.js";
/** A toast shown with its spans. */
export type DrawnToast = {
    /** Whether OpenCode still draws its spans: false once it closed or another toast came. */
    onScreen: () => boolean;
};
export type ColoredToastHost = {
    /** OpenCode's own toast. */
    show: (toast: ToastOptions) => void;
    theme: () => Theme;
    display: () => DisplaySettings;
    /** A Solid owner inside OpenCode's renderer, where spans can be made; none before it draws. */
    owner: () => Owner | undefined;
    /** The renderer's root: everything on screen hangs under it. */
    root: () => unknown;
};
/**
 * The children of OpenCode's toast <text>: each segment a <span> in its color, "\n" between
 * lines. A span reads bold from its style's `bold` key; it ignores an `attributes` key there.
 */
export declare function coloredMessage(lines: Line[], theme: Theme, display: DisplaySettings): JSX.Element;
/**
 * Shows a toast. A quota toast's `lines` show in their colors once the TUI has drawn (see
 * above); before that, and when that fails, the toast's plain message shows. Returns the toast
 * when it went with its spans, else undefined: a plain message can't tell whether it is on screen.
 */
export declare function createToastShow(host: ColoredToastHost): (toast: ToastOptions, lines?: Line[]) => DrawnToast | undefined;
