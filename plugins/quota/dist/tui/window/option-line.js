/**
 * Space, enter or a click on the value: run the line's button, else its next value. "type" when
 * it has neither and takes typing instead.
 */
export function activateLine(line) {
    if (line.run)
        line.run();
    else if (line.cycle)
        line.cycle(1);
    else
        return "type";
    return undefined;
}
/** ←/→ or ‹ ›: the line's previous (-1) or next (+1) value; nothing on a button. */
export function stepLine(line, delta) {
    line.cycle?.(delta);
}
/**
 * ↑↓ from line `index` of `count` (-1 for none selected): the line to select, or undefined past
 * the first or last line (or without lines), where the window scrolls instead.
 */
export function stepSelection(count, index, delta) {
    const next = index + delta;
    return count > 0 && next >= 0 && next < count ? next : undefined;
}
//# sourceMappingURL=option-line.js.map