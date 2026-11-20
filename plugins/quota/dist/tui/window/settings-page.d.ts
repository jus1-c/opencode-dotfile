/**
 * One Settings page apart from how it is drawn: its option lines (settings, presets, OpenCode's
 * theme, custom provider switches, provider ticks, the window for all providers), the surface's
 * provider tree, the order ↑↓ select them in, and what ←/→ (`step`), space or enter (`activate`)
 * and Reset do. Every edit goes to the window's draft (`DisplayStore`); Save writes it.
 */
import type { QuotaSnapshot } from "../../core/types.js";
import type { Surface, WindowChoice } from "../../view/select.js";
import { type DisplayStore, type SettingsTab } from "../display.js";
import { type ServerSettings } from "../server-settings.js";
import { type OptionLine } from "./option-line.js";
import type { WindowHost } from "./shell.js";
import { type TreeLine } from "./surface-editor.js";
/** The id of a surface page's switch line. */
export declare const SWITCH_ID = "surface";
/** Selection id of a tree line; a row id could equal a setting's path. */
export declare function lineKey(id: string): string;
/**
 * Reset tab or Reset page: every line of `tab` back to its default in the draft, so Save
 * removes them from settings.jsonc. On Providers the switched-off providers too, and each
 * custom provider switch goes back to its saved state.
 */
export declare function resetPage(server: ServerSettings, tab: SettingsTab): void;
export type PageHost = Pick<WindowHost, "theme" | "themeMode" | "keymap">;
export type SettingsPage = ReturnType<typeof settingsPage>;
/** A window choice as its ‹ › shows it: "lowest left", "5h", … */
export declare function windowTitle(choice: WindowChoice): string;
/**
 * `tab`'s page over the draft and the quota snapshot. `refocus` gives the window the keyboard
 * again after OpenCode's light/dark switch took it.
 */
export declare function settingsPage(input: {
    tab: SettingsTab;
    draft: DisplayStore;
    snapshot: QuotaSnapshot | undefined;
    host: PageHost;
    refocus: () => void;
}): {
    surface: Surface | undefined;
    editor: {
        lines(settings: import("../display.js").DisplaySettings, nowMs: number): TreeLine[];
        toggleSurface(): import("./surface-editor.js").SettingsEdit;
        toggleHidden(id: string): import("./surface-editor.js").SettingsEdit;
        cycleWindow(providerId: string, delta: number): import("./surface-editor.js").SettingsEdit;
        pickWindow(providerId: string, choice: WindowChoice): import("./surface-editor.js").SettingsEdit;
        windowChoices(providerId: string, settings: import("../display.js").DisplaySettings): WindowChoice[];
        move(id: string, delta: number): import("./surface-editor.js").SettingsEdit;
        drag(id: string, pointer: number): import("./surface-editor.js").SettingsEdit;
        rename(id: string): {
            hint: string;
            apply: (text: string) => import("./surface-editor.js").SettingsEdit;
        } | undefined;
    } | undefined;
    options: OptionLine[];
    /** The surface's providers (and rows) as `nowMs` shows them; none without a surface. */
    tree(nowMs: number): TreeLine[];
    /** The selection ids, top to bottom: the surface switch, the options, then `tree`'s lines. */
    ids(tree: readonly TreeLine[]): string[];
    /** ←/→ or ‹ ›: the line's next or previous value, or a provider's next or previous window. */
    step(id: string, delta: number): void;
    /**
     * Space or enter: flip the surface switch, run a button, the next value, or show or hide a
     * tree line. "type" when the line takes typing instead.
     */
    activate(id: string): "type" | undefined;
    reset(): void;
};
