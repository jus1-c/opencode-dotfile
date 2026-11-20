import type { ColorRole } from "./text.js";
/** What a setting line holds; undefined only for a color that follows the theme, null for unset. */
export type FieldValue = string | number | boolean | null | undefined;
export type PresetName = "layout" | "toast" | "words" | "colors";
/** Every color role, in the order the Colors lines list them. */
export declare const COLOR_ROLES: readonly ColorRole[];
/** Each preset's choices by name, with the values each sets by path. */
export declare const PRESET_CHOICES: Record<PresetName, Record<string, Record<string, FieldValue>>>;
/** The preset choice whose values all match the lines' values; undefined is "your own". */
export declare function presetChoice(name: PresetName, value: (path: string) => unknown): string | undefined;
/** ‹ or ›: the values of the previous or next choice after `current`; from "your own", the first. */
export declare function presetValues(name: PresetName, current: string | undefined, delta: number): Readonly<Record<string, FieldValue>>;
