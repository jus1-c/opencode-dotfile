/**
 * The priorities of the TUI's keymap layers. OpenCode asks the highest enabled layer first, so
 * a layer here wins over every lower one that binds the same key.
 */
export declare const KEY_LAYERS: {
    /** Enter on a typed quota command; above OpenCode's textarea layer. */
    readonly typedCommand: 1;
    readonly window: 10;
    /** The open tab's keys: Settings lines or the Usage tab. */
    readonly tab: 11;
    /** ctrl+s on the Settings tabs. */
    readonly save: 12;
    /** The bottom bar's "Keep your changes?" question. */
    readonly confirmClose: 15;
    /** A Settings line taking typed text. */
    readonly typing: 20;
};
export type KeyLayerName = keyof typeof KEY_LAYERS;
