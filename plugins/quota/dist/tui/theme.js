/**
 * Quota's colors from the user's OpenCode theme. Every color role follows a named theme color
 * unless the display settings pick another one or a fixed "#rrggbb". The theme is read on every
 * call, so a surface that colors inside its JSX follows a theme or light/dark switch at once.
 */
import { RGBA } from "@opentui/core";
import { barLevel } from "../view/format.js";
import { THEME_COLORS } from "./display.js";
export function namedColor(theme, name) {
    switch (name) {
        case "text":
            return theme.text.base;
        case "muted":
            return theme.text.muted;
        case "accent":
            return theme.hue.accent[500] ?? theme.text.base;
        case "green":
            return theme.text.feedback.success.base;
        case "yellow":
            return theme.text.feedback.warning.base;
        case "red":
            return theme.text.feedback.error.base;
        case "blue":
            return theme.text.feedback.info.base;
    }
}
/** A fixed choice ("bar" is not one: the level roles can't follow themselves). */
function fixedColor(theme, choice, fallback) {
    if (choice === "bar")
        return namedColor(theme, fallback);
    return choice.startsWith("#") ? RGBA.fromHex(choice) : namedColor(theme, choice);
}
function choiceFor(display, role) {
    return display.colors[role] ?? THEME_COLORS[role];
}
/**
 * The bar color for a percent left: plenty left, getting low, or almost out. With the bar colors
 * following pace, a row's level by pace wins; a row without one falls back to its percent.
 */
export function levelColor(theme, display, percent, paceLevel) {
    const role = barLevel(display.colors, percent, paceLevel);
    return fixedColor(theme, choiceFor(display, role), THEME_COLORS[role]);
}
/** A role's color. A role set to "bar" takes the level color of the row's percent. */
export function roleColor(theme, display, role, percent = 100, paceLevel) {
    const choice = choiceFor(display, role);
    return choice === "bar"
        ? levelColor(theme, display, percent, paceLevel)
        : fixedColor(theme, choice, "text");
}
export function segmentColor(theme, display, segment) {
    return segment.role === "bar"
        ? levelColor(theme, display, segment.percent ?? 100, segment.paceLevel)
        : roleColor(theme, display, segment.role, segment.percent, segment.paceLevel);
}
//# sourceMappingURL=theme.js.map