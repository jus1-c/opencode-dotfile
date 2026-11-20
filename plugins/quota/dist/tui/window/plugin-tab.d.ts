/** @jsxImportSource @opentui/solid */
/**
 * The quota window's Plugin tab: the maintainer notices, the switches for other tools (each
 * saves straight away), and the status report with Copy, each under its own title. Each show
 * asks the server again; an answer that arrives after a newer question is dropped.
 */
import type { JSX } from "@opentui/solid";
import { type SettingsEditor } from "./settings.js";
import type { WindowHost } from "./shell.js";
/** Copies `text` and says in a toast titled `title` whether the terminal let it. */
export type CopyWithToast = (text: string, title: string, messages: {
    copied: string;
    failed: string;
}) => void;
export type PluginTab = ReturnType<typeof createPluginTab>;
export declare function createPluginTab(api: WindowHost, settings: SettingsEditor, copy: CopyWithToast): {
    /**
     * The tab shows: the notices and the status report are asked again, and the saved settings
     * read, so the switches show even if a snapshot is late. Copy is selected, so enter copies.
     */
    show(sessionID: string | undefined): void;
    /** ↑↓: the next line; false past the first or last one, where the window scrolls. */
    select(delta: number): boolean;
    /** Space or enter. */
    activate(): void;
    /** ←/→. */
    step(delta: number): void;
    View(props: {
        width: number;
    }): JSX.Element;
};
