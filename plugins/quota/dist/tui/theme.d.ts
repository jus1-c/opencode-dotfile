/**
 * Quota's colors from the user's OpenCode theme. Every color role follows a named theme color
 * unless the display settings pick another one or a fixed "#rrggbb". The theme is read on every
 * call, so a surface that colors inside its JSX follows a theme or light/dark switch at once.
 */
import { RGBA } from "@opentui/core";
import { type Level } from "../view/format.js";
import type { ColorRole, Segment } from "../view/text.js";
import { type ColorName, type DisplaySettings } from "./display.js";
/** The theme tokens quota reads (OpenCode's `ResolvedTheme`). */
export type Theme = {
    text: {
        base: RGBA;
        muted: RGBA;
        /** The label of the line the Settings tabs have selected, on a surface. */
        action: {
            primary: {
                selected: RGBA;
            };
        };
        feedback: Record<"success" | "warning" | "error" | "info", {
            base: RGBA;
        }>;
    };
    /** Behind the line the Settings tabs have selected, on a surface. */
    background: {
        raised: {
            high: RGBA;
        };
    };
    hue: {
        accent: Record<number, RGBA>;
    };
};
export declare function namedColor(theme: Theme, name: ColorName): RGBA;
/**
 * The bar color for a percent left: plenty left, getting low, or almost out. With the bar colors
 * following pace, a row's level by pace wins; a row without one falls back to its percent.
 */
export declare function levelColor(theme: Theme, display: DisplaySettings, percent: number, paceLevel?: Level): RGBA;
/** A role's color. A role set to "bar" takes the level color of the row's percent. */
export declare function roleColor(theme: Theme, display: DisplaySettings, role: ColorRole, percent?: number, paceLevel?: Level): RGBA;
export declare function segmentColor(theme: Theme, display: DisplaySettings, segment: Segment): RGBA;
