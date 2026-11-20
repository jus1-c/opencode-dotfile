/**
 * What a place shows of one quota row: its name, its percent or value, its reset time, its pace
 * words and where even use would be; and the words for a provider's last error. Places only lay
 * these facts out (widths, bars, colors). Where places differ on purpose, the difference is an
 * option of `Place`, never a rule of their own. Pure.
 */
import { describeError } from "../core/errors.js";
import { paceOf } from "../core/pace.js";
import { WINDOWS } from "../core/windows.js";
import { amountPairText, amountText, formatDuration, largestUnit, paceLevel, percentText, rowValueText, } from "./format.js";
function nameOf(item, group, place) {
    const { window } = item.row;
    if (place.names === "label" || !window)
        return item.label;
    const short = WINDOWS[window].short;
    if (place.words.rowNames === "full" || item.named)
        return item.label;
    const shared = group.rows.some((other) => other !== item && other.row.window && WINDOWS[other.row.window].short === short);
    return shared ? item.label : short;
}
/** The time share starts a reset text in the "percent" style: "/91% 4d". */
const SHARE_MARK = "/";
/** Whether `reset` starts with the time share, so it goes right after the percent. */
export function joinsPercent(reset) {
    return reset.startsWith(SHARE_MARK);
}
/**
 * `reset` after a percent with `gap` between them; with no gap before the time share, which
 * reads as one with the percent ("58%/91% 4d"). "" without a reset.
 */
export function afterPercent(reset, gap) {
    if (!reset)
        return "";
    return joinsPercent(reset) ? reset : `${gap}${reset}`;
}
/** `reset` where no percent comes right before it: the time share without its "/" ("91% 4d"). */
export function resetAlone(reset) {
    return joinsPercent(reset) ? reset.slice(SHARE_MARK.length) : reset;
}
/** The time style of a reset style for pace words: "percent" writes them in the short style. */
function durationStyle(times) {
    return times === "percent" ? "short" : times;
}
/** The share of the window's time left, or used when `words.percent` is "used": "/91%". */
function timeShare(pace, words) {
    const share = words.percent === "used" ? 100 - pace.evenLeft : pace.evenLeft;
    return `${SHARE_MARK}${Math.round(share)}%`;
}
/** "plenty to spare", "on track", "faster than it refills", or "runs out in 2h 10m". */
function paceWords(pace, times, words) {
    if (pace.kind === "spare")
        return "plenty to spare";
    if (pace.kind === "on_track")
        return "on track";
    if (pace.runsOutInMs === undefined)
        return "faster than it refills";
    return `runs out in ${formatDuration(pace.runsOutInMs, times, words.resetDecimals)}`;
}
function showsPace(pace, shown) {
    if (shown === "all")
        return true;
    if (shown === "fast")
        return pace.kind === "fast";
    return shown === "runsOut" && pace.runsOutInMs !== undefined;
}
/** `item`, one of `group`'s rows, as `place` shows it. */
export function rowFacts(item, group, place) {
    const { row } = item;
    const { words, nowMs } = place;
    const name = nameOf(item, group, place);
    const percent = row.percentRemaining;
    if (percent === undefined) {
        const compact = place.codexCredits === "compact" &&
            row.id === "openai.codex_credits" &&
            row.type === "balance" &&
            row.text === undefined &&
            row.amount?.unit.kind === "count" &&
            row.amount.unit.unit === "credit"
            ? amountText({ ...row.amount, unit: { kind: "count", unit: "unit" } })
            : undefined;
        return { id: row.id, name, value: compact ?? rowValueText(row), reset: "", shortReset: "" };
    }
    const withWord = place.percent === "words" || (place.percent === "usedWord" && words.percent === "used");
    const times = place.times ?? words.reset;
    const resetMs = Date.parse(row.resetsAt ?? "");
    const resetIn = (style) => Number.isFinite(resetMs) ? formatDuration(resetMs - nowMs, style, words.resetDecimals) : "";
    const pace = paceOf(row, nowMs);
    // Without a pace (the window's start unknown) the "percent" style shows the time alone.
    const percentStyleTime = Number.isFinite(resetMs) ? largestUnit(resetMs - nowMs) : "";
    const reset = times !== "percent"
        ? resetIn(times)
        : pace
            ? `${timeShare(pace, words)} ${percentStyleTime}`
            : percentStyleTime;
    // A row with no reset time that reports a balance and the limit it is measured against shows
    // the pair after its percent. It is not a reset time, so it does not widen the reset column.
    const amountPair = reset === "" && row.amount && row.limit ? amountPairText(row.amount, row.limit) : undefined;
    const level = pace && paceLevel(pace, percent);
    return {
        id: row.id,
        name,
        percent,
        ...(level ? { paceLevel: level } : {}),
        value: percentText(words, percent, withWord),
        reset,
        shortReset: resetIn("short"),
        ...(amountPair ? { amountPair } : {}),
        ...(place.evenUse && pace ? { evenLeft: pace.evenLeft } : {}),
        ...(pace && showsPace(pace, place.pace)
            ? {
                pace: { words: paceWords(pace, durationStyle(times), words), fast: pace.kind === "fast" },
            }
            : {}),
    };
}
/** The words for a group's last error ("Sign in again"); undefined when its last check worked. */
export function errorWords(group, nowMs) {
    if (group.name === "Claude API" && group.error?.code === "not_configured") {
        return "Set ANTHROPIC_CONSOLE_ORGANIZATION";
    }
    return group.error ? describeError(group.error, group.name, nowMs) : undefined;
}
/** Retained credit balances stay visible alongside a failed refresh warning. */
export function retainedStatusBalance(row, error) {
    return row && ["openai.codex_credits", "anthropic-api.balance"].includes(row.id) && error
        ? `${row.value} (${error})`
        : undefined;
}
//# sourceMappingURL=row-facts.js.map