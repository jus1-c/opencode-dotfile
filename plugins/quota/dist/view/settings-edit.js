/**
 * Small edits of the display settings that the TUI's Settings tabs and the GUI's Settings page
 * share: a value put at a path, a step through a list, a row's own name. Pure.
 */
import { isRecord } from "../lib/json-guards.js";
/** Puts `value` at `keys` in `target` itself; undefined removes the key. */
function putAt(target, keys, value) {
    let parent = target;
    for (const key of keys.slice(0, -1)) {
        if (!isRecord(parent[key]))
            parent[key] = {};
        parent = parent[key];
    }
    const last = keys[keys.length - 1];
    if (value === undefined)
        delete parent[last];
    else
        parent[last] = value;
}
/**
 * A copy of the settings with `value` at `keys` (a key may hold a dot, like a row id);
 * undefined removes the key, which puts a color back to the theme's or a row name back.
 */
export function setIn(settings, keys, value) {
    const next = JSON.parse(JSON.stringify(settings));
    putAt(next, keys, value);
    return next;
}
/** The value `delta` steps from `current` in `values`, wrapping; an unknown one counts as the first. */
export function stepIn(values, current, delta) {
    const index = Math.max(0, values.indexOf(current));
    return values[(index + delta + values.length) % values.length];
}
/**
 * Your name for a row; nothing typed puts its own name back. A name equal to its own label
 * stays, so it shows where `words.rowNames` "short" would show the window's short name.
 */
export function renameRow(settings, surface, rowId, text) {
    const label = text.trim();
    return setIn(settings, [surface, "names", rowId], label || undefined);
}
//# sourceMappingURL=settings-edit.js.map