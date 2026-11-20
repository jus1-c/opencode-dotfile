import type { Settings } from "../settings/schema.js";
/**
 * A copy of the settings with `value` at `keys` (a key may hold a dot, like a row id);
 * undefined removes the key, which puts a color back to the theme's or a row name back.
 */
export declare function setIn(settings: Settings, keys: readonly string[], value: unknown): Settings;
/** The value `delta` steps from `current` in `values`, wrapping; an unknown one counts as the first. */
export declare function stepIn<T>(values: readonly T[], current: T, delta: number): T;
/**
 * Your name for a row; nothing typed puts its own name back. A name equal to its own label
 * stays, so it shows where `words.rowNames` "short" would show the window's short name.
 */
export declare function renameRow(settings: Settings, surface: "sidebar" | "toast", rowId: string, text: string): Settings;
