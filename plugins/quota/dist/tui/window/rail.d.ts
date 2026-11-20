import type { JSX } from "@opentui/solid";
import type { WindowTheme } from "./shell.js";
/** The longest label of either list: Usage's "This session". */
export declare const RAIL_LABEL_WIDTH = 12;
export type RailItem<Key extends string> = {
    key: Key;
    label: string;
    id: string;
};
/** What the list takes left of the content: the list, the line after it and `gap` columns. */
export declare function railRoom(gap: number): number;
export declare function Rail<Key extends string>(props: {
    items: ReadonlyArray<RailItem<Key>>;
    chosen: Key;
    theme: WindowTheme;
    /** Columns between the line and the content. */
    gap: number;
    pick: (key: Key) => void;
}): JSX.Element;
