import { stepIn } from "./settings-edit.js";
/** Every color role, in the order the Colors lines list them. */
export const COLOR_ROLES = [
    "good",
    "warning",
    "low",
    "empty",
    "title",
    "provider",
    "account",
    "label",
    "percent",
    "reset",
    "value",
    "error",
    "statusName",
    "separator",
    "arrows",
];
function layoutChoice(barWidth, indent, labelWidth, providerGap) {
    return {
        "layout.barWidth": barWidth,
        "layout.indent": indent,
        "layout.labelWidth": labelWidth,
        "layout.providerGap": providerGap,
    };
}
function toastChoice(afterReply, afterQuestion, afterCompaction, resetNotice) {
    return {
        "toast.afterReply": afterReply,
        "toast.afterQuestion": afterQuestion,
        "toast.afterCompaction": afterCompaction,
        "toast.whenAllFail": true,
        "toast.resetNotice": resetNotice,
    };
}
/** Every color line: `changes`' colors, the theme's for the rest. */
function colorChoice(changes) {
    return Object.fromEntries(COLOR_ROLES.map((role) => [`colors.${role}`, changes[role]]));
}
/** Each preset's choices by name, with the values each sets by path. */
export const PRESET_CHOICES = {
    layout: {
        compact: layoutChoice(6, 1, 6, 0),
        normal: layoutChoice("fill", 1, 8, 1),
        large: layoutChoice("fill", 2, 8, 2),
    },
    toast: {
        "only failures": toastChoice("off", false, false, "off"),
        quiet: toastChoice("off", false, true, "off"),
        normal: toastChoice("low", false, true, "off"),
        "every reply": toastChoice("always", true, true, "all"),
    },
    colors: {
        "theme colors": colorChoice({}),
        // The panel title in the text color, Almost out and errors in their red, the rest grey.
        grey: colorChoice({
            good: "muted",
            warning: "muted",
            provider: "muted",
            label: "muted",
            arrows: "muted",
        }),
    },
    words: {
        normal: { "words.percent": "left", "words.reset": "smart", "words.rowNames": "short" },
        short: { "words.percent": "bare", "words.reset": "compact", "words.rowNames": "short" },
        "spelled out": {
            "words.percent": "remaining",
            "words.reset": "exact",
            "words.rowNames": "full",
        },
    },
};
/** The preset choice whose values all match the lines' values; undefined is "your own". */
export function presetChoice(name, value) {
    return Object.entries(PRESET_CHOICES[name]).find(([, values]) => Object.entries(values).every(([path, wanted]) => value(path) === wanted))?.[0];
}
/** ‹ or ›: the values of the previous or next choice after `current`; from "your own", the first. */
export function presetValues(name, current, delta) {
    const names = Object.keys(PRESET_CHOICES[name]);
    const next = current === undefined ? names[0] : stepIn(names, current, delta);
    return PRESET_CHOICES[name][next] ?? {};
}
//# sourceMappingURL=presets.js.map