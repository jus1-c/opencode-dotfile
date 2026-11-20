import type { JSX } from "@opentui/solid";
import type { Surface } from "../view/select.js";
import { type Line } from "../view/text.js";
import type { QuotaClient } from "./client.js";
import type { DisplaySettings } from "./display.js";
import { type Theme } from "./theme.js";
/** What the quota window's Settings tabs tell the surfaces while you edit them. */
export type SurfaceEditing = {
    /** The provider or row id selected on the tab that edits `surface`; that surface marks it. */
    marked(surface: Surface): string | undefined;
    /** The Sidebar tab shows the panel expanded, the Collapsed tab collapsed. */
    panelOpen(): boolean | undefined;
    /** A sidebar panel is on screen until the returned function runs. */
    sidebarShown(): () => void;
    sidebarOnScreen(): boolean;
    /** The Settings tab of `surface` is open. */
    tabOpen(surface: Surface): boolean;
};
/** What every always-on surface reads. */
export type SurfaceHost = {
    theme: () => Theme;
    /**
     * The saved display settings, or the draft while the Settings tabs edit it. Surfaces take
     * their words from here, so unsaved words show while you edit them.
     */
    display: () => DisplaySettings;
    quota: QuotaClient;
    editing: SurfaceEditing;
};
/** One line of a surface, each segment in its color. A marked line has a soft background. */
export declare function LineText(props: {
    line: Line;
    host: SurfaceHost;
    marked?: boolean;
}): JSX.Element;
export declare function SidebarPanel(props: {
    host: SurfaceHost;
    sessionID: string;
    open: () => boolean;
    setOpen: (open: boolean) => void;
}): JSX.Element;
