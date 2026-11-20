import { use as _$use } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
/** @jsxImportSource @opentui/solid */
/**
 * The quota window's Usage tab: tokens and API cost from OpenCode's own history, laid out by
 * `view/usage.ts`, and the model detail popup. The window puts the range list (`Rail`) left of
 * the scrolling content (`View`), a muted line between them. The content's first line has the
 * chosen range and its dates, and Cost and Tokens at its right; the Breakdown heading has Model
 * and Day at its right.
 *
 * The range list has the keyboard when the tab shows: ↑↓ change the range. → or enter give the
 * keyboard to the model rows: ↑↓ walk them, the current one highlighted, enter opens a model's
 * details and ← goes back to the range list. Anywhere in the tab: c cost, t tokens, b by model
 * or by day, p download new prices, and d types the dates of "Between": the two date boxes show
 * on the first line, enter goes to the next date and then applies them, tab switches dates, esc
 * gives the keyboard back. A click picks a range, Cost or Tokens, Model or Day, or opens a model.
 *
 * The tab keeps Cost or Tokens and Model or Day while the window is open and closed. Switching
 * to the tab, or opening the window on it, shows the default range; `/quota_usage <range>` and
 * the `/tokens_*` commands show theirs. Each show asks the server again. An answer that arrives
 * after a newer question is dropped.
 */
import { RGBA, TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import { createMemo, createSignal, Show } from "solid-js";
import { DEFAULT_USAGE_RANGE, USAGE_RANGES, usageRangeLabel } from "../../core/usage-ranges.js";
import { parseCalendarDate } from "../../lib/calendar-date.js";
import { sanitizeDisplayText } from "../../lib/display-sanitize.js";
import { QuotaRpc } from "../../rpc.js";
import { breakdownModels, modelDetailTitle, modelDetailView, rangeDates, usageView } from "../../view/usage.js";
import { errorToast, quotaCallOptions, rpcErrorMessage } from "../client.js";
import { KEY_LAYERS } from "../key-layers.js";
import { stepSelection } from "./option-line.js";
import { Rail, railRoom } from "./rail.js";

/** OpenCode's theme also has categorical hue scales, for things told apart by color. */

/** OpenCode's "large" dialog width (dialogWidth in its ui/dialog.tsx). */
const DIALOG_WIDTH = 88;
/** Room for " esc" after the model popup's title. */
const CLOSE_LABEL_ROOM = " esc".length;
const KEYS = "Usage";
/** An option's two spaces around its label, inside its raised background. */
const OPTION_PAD = 2;
const TRANSPARENT = RGBA.fromInts(0, 0, 0, 0);
/** The content starts one column after the range list's line. */
const RANGE_LIST_GAP = 1;
/** What the window keeps left of the content: the range list, the line after it and a gap. */
export const USAGE_RAIL_WIDTH = railRoom(RANGE_LIST_GAP);

/** How each "by type" part is shaded, from the muted color (0) to the text color (1). */
const PART_SHADES = {
  "part:cacheRead": 0,
  "part:input": 0.45,
  "part:cacheWrite": 0.75,
  "part:output": 1
};

/** Where the tab's keyboard is: the range list, or the content with its model rows. */

function rangeId(range) {
  return `quota-usage-range-${range}`;
}
const RANGE_ITEMS = USAGE_RANGES.map(item => ({
  key: item.range,
  label: item.label,
  id: rangeId(item.range)
}));

/** A model row's element id, to scroll it into view. */
function modelRowId(index) {
  return `quota-usage-model-${index}`;
}
function mix(from, to, share) {
  const step = (a, b) => a + (b - a) * share;
  return RGBA.fromValues(step(from.r, to.r), step(from.g, to.g), step(from.b, to.b), step(from.a, to.a));
}
/** The first day of this month and today, local dates like "2026-10-01". */
function thisMonth(nowMs) {
  const now = new Date(nowMs);
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return {
    from: `${month}-01`,
    to: `${month}-${String(now.getDate()).padStart(2, "0")}`
  };
}
function roleColor(theme, role) {
  if (role.startsWith("provider:")) {
    const scales = theme.categorical ?? [];
    const scale = scales[Number(role.slice("provider:".length)) % Math.max(1, scales.length)];
    return scale?.[200] ?? theme.hue.accent[500] ?? theme.text.base;
  }
  if (role.startsWith("part:")) return mix(theme.text.muted, theme.text.base, PART_SHADES[role] ?? 1);
  switch (role) {
    case "muted":
      return theme.text.muted;
    case "warning":
      return theme.text.feedback.warning.base;
    case "good":
      return theme.text.feedback.success.base;
    case "bar":
      return theme.hue.accent[500] ?? theme.text.base;
    default:
      return theme.text.base;
  }
}

/**
 * One view line as one text, each span in its role's color on its `back` role's color (a chart
 * cell shared by two providers); title and headings bold.
 */
function UsageLineText(props) {
  const theme = () => props.theme;
  return (() => {
    var _el$ = _$createElement("text");
    _$setProp(_el$, "wrapMode", "none");
    _$setProp(_el$, "flexShrink", 0);
    _$insert(_el$, () => props.line.length === 0 ? " " : null, null);
    _$insert(_el$, () => props.line.map(part => (() => {
      var _el$2 = _$createElement("span");
      _$insert(_el$2, () => sanitizeDisplayText(part.text));
      _$effect(_$p => _$setProp(_el$2, "style", {
        fg: props.selected ? theme().text.action.primary.focused : roleColor(theme(), part.role),
        // A span keeps a background once drawn: set one always, so a line let go clears it.
        bg: props.selected ? theme().background.action.primary.focused : part.back ? roleColor(theme(), part.back) : TRANSPARENT,
        bold: part.role === "title" || part.role === "heading"
      }, _$p));
      return _el$2;
    })()), null);
    _$effect(_p$ => {
      var _v$ = props.id,
        _v$2 = props.onClick;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$, "id", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$, "onMouseUp", _v$2, _p$.t));
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
}

/** A tab of the window's tab bar: bold and underlined when it is the current one. */
export function Choice(props) {
  return (() => {
    var _el$3 = _$createElement("text");
    _$setProp(_el$3, "wrapMode", "none");
    _$setProp(_el$3, "selectable", false);
    _$insert(_el$3, () => props.label);
    _$effect(_p$ => {
      var _v$3 = props.active ? props.theme.text.action.primary.selected : props.theme.text.muted,
        _v$4 = props.active ? TextAttributes.BOLD | TextAttributes.UNDERLINE : TextAttributes.NONE,
        _v$5 = props.run;
      _v$3 !== _p$.e && (_p$.e = _$setProp(_el$3, "fg", _v$3, _p$.e));
      _v$4 !== _p$.t && (_p$.t = _$setProp(_el$3, "attributes", _v$4, _p$.t));
      _v$5 !== _p$.a && (_p$.a = _$setProp(_el$3, "onMouseUp", _v$5, _p$.a));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$3;
  })();
}

/**
 * An option inside the Usage tab (cost or tokens, model or day): the current one bold on
 * a raised background, so a row of options reads apart from the tab bar's underlined tabs. On
 * the highlighted line (`lit`) the other options take its text color.
 */
export function Option(props) {
  const idle = () => props.lit ? props.theme.text.action.primary.focused : props.theme.text.muted;
  return (() => {
    var _el$4 = _$createElement("box"),
      _el$5 = _$createElement("text");
    _$insertNode(_el$4, _el$5);
    _$setProp(_el$4, "paddingLeft", 1);
    _$setProp(_el$4, "paddingRight", 1);
    _$setProp(_el$4, "flexShrink", 0);
    _$setProp(_el$5, "wrapMode", "none");
    _$setProp(_el$5, "selectable", false);
    _$insert(_el$5, () => props.label);
    _$effect(_p$ => {
      var _v$6 = props.active ? props.theme.background.raised.high : TRANSPARENT,
        _v$7 = props.run,
        _v$8 = props.active ? props.theme.text.action.primary.selected : idle(),
        _v$9 = props.active ? TextAttributes.BOLD : TextAttributes.NONE;
      _v$6 !== _p$.e && (_p$.e = _$setProp(_el$4, "backgroundColor", _v$6, _p$.e));
      _v$7 !== _p$.t && (_p$.t = _$setProp(_el$4, "onMouseUp", _v$7, _p$.t));
      _v$8 !== _p$.a && (_p$.a = _$setProp(_el$5, "fg", _v$8, _p$.a));
      _v$9 !== _p$.o && (_p$.o = _$setProp(_el$5, "attributes", _v$9, _p$.o));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined
    });
    return _el$4;
  })();
}

/** The model detail popup, in OpenCode's dialog: scrolls with ↑↓, closes with esc. */
function ModelDetail(props) {
  const theme = () => props.api.theme;
  const dimensions = useTerminalDimensions();
  // The dialog is its size's width, at most the terminal's minus 2, inside this box's paddings
  // (2 + 2). The lines below the title leave a column for the scrollbar; the title leaves room
  // for " esc".
  const innerWidth = () => Math.min(DIALOG_WIDTH, dimensions().width - 2) - 4;
  const width = () => innerWidth() - 1;
  const title = () => modelDetailTitle(props.report, props.model, innerWidth() - CLOSE_LABEL_ROOM);
  // The dialog starts a quarter of the way down; the title row and paddings take 4 rows.
  const maxHeight = () => Math.max(1, Math.floor(dimensions().height * 0.75) - 4);
  const lines = () => modelDetailView(props.report, props.model, {
    mode: props.mode,
    width: width()
  });
  let scroll;
  props.api.keymap.layer(() => ({
    mode: "modal",
    commands: [{
      bind: "up",
      title: "Scroll up",
      group: KEYS,
      run: () => scroll?.scrollBy(-1)
    }, {
      bind: "down",
      title: "Scroll down",
      group: KEYS,
      run: () => scroll?.scrollBy(1)
    }]
  }));
  return (() => {
    var _el$6 = _$createElement("box"),
      _el$7 = _$createElement("box"),
      _el$8 = _$createElement("box"),
      _el$9 = _$createElement("text"),
      _el$1 = _$createElement("scrollbox");
    _$insertNode(_el$6, _el$7);
    _$insertNode(_el$6, _el$1);
    _$setProp(_el$6, "paddingLeft", 2);
    _$setProp(_el$6, "paddingRight", 2);
    _$setProp(_el$6, "paddingBottom", 1);
    _$insertNode(_el$7, _el$8);
    _$insertNode(_el$7, _el$9);
    _$setProp(_el$7, "flexDirection", "row");
    _$insert(_el$7, _$createComponent(UsageLineText, {
      get line() {
        return title();
      },
      get theme() {
        return theme();
      }
    }), _el$8);
    _$setProp(_el$8, "flexGrow", 1);
    _$insertNode(_el$9, _$createTextNode(`esc`));
    _$setProp(_el$9, "flexShrink", 0);
    _$setProp(_el$9, "selectable", false);
    _$setProp(_el$9, "onMouseUp", () => props.api.ui.dialog.clear());
    _$use(element => {
      scroll = element;
    }, _el$1);
    _$insert(_el$1, () => lines().slice(1).map(line => _$createComponent(UsageLineText, {
      line: line,
      get theme() {
        return theme();
      }
    })));
    _$effect(_p$ => {
      var _v$0 = theme().text.muted,
        _v$1 = maxHeight();
      _v$0 !== _p$.e && (_p$.e = _$setProp(_el$9, "fg", _v$0, _p$.e));
      _v$1 !== _p$.t && (_p$.t = _$setProp(_el$1, "maxHeight", _v$1, _p$.t));
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$6;
  })();
}

/** A range to show, with its dates for "between". */

/** `scroll`: the window's scrollbox, which keeps the current model row in view. */
export function createUsageTab(api, scroll) {
  const [range, setRange] = createSignal(DEFAULT_USAGE_RANGE);
  const [mode, setMode] = createSignal("cost");
  const [breakdown, setBreakdown] = createSignal("model");
  /** The Between dates typed or named by a command; until then, this month so far. */
  const [chosenDates, setDates] = createSignal();
  const dates = () => chosenDates() ?? thisMonth(Date.now());
  const [area, setArea] = createSignal("ranges");
  /** The model row the content highlights while it has the keyboard (see `litModel`). */
  const [modelFocus, setModelFocus] = createSignal(0);
  const [result, setResult] = createSignal({
    state: "loading"
  });
  const [downloading, setDownloading] = createSignal(false);
  /** The two date boxes show on the first line in place of the dates. */
  const [editingDates, setEditingDates] = createSignal(false);
  let sessionID = "";
  let latestQuestion = 0;
  let fromInput;
  let toInput;
  let windowBox = () => undefined;
  const [dateFocus, setDateFocus] = createSignal();
  function dateInput(field) {
    return field === "from" ? fromInput : toInput;
  }
  async function load() {
    const question = ++latestQuestion;
    const query = {
      range: range(),
      sessionID
    };
    if (range() === "between") Object.assign(query, dates());
    setResult({
      state: "loading"
    });
    try {
      const {
        report
      } = await api.client.rpc(QuotaRpc).usage(query, quotaCallOptions(api));
      if (question === latestQuestion) setResult({
        state: "ready",
        report
      });
    } catch (error) {
      if (question !== latestQuestion) return;
      setResult({
        state: "failed",
        message: sanitizeDisplayText(rpcErrorMessage(error))
      });
    }
  }

  /** Shows the date boxes and gives the first one the keyboard once it is drawn. */
  function typeDates() {
    setEditingDates(true);
    setTimeout(() => fromInput?.focus(), 50);
  }

  /** The range list keeps the keyboard; a click on "Between" (`typing`) types its dates. */
  function chooseRange(next, typing) {
    setRange(next);
    setArea("ranges");
    void load();
    if (next === "between" && typing) typeDates();
  }

  /** Enter in a date: From goes on to To; To applies both when they are dates in order. */
  function submitDate(field) {
    if (field === "from") {
      toInput?.focus();
      return;
    }
    const from = fromInput?.value.trim() ?? dates().from;
    const to = toInput?.value.trim() ?? dates().to;
    if (!parseCalendarDate(from) || !parseCalendarDate(to) || to < from) {
      api.ui.toast.show({
        variant: "warning",
        title: "Usage",
        message: "Type two dates like 2026-09-01, the first one not after the second."
      });
      return;
    }
    setDates({
      from,
      to
    });
    backToWindow();
    void load();
  }

  /** The keyboard back to the window; the dates show again in place of the boxes. */
  function backToWindow() {
    setDateFocus(undefined);
    setEditingDates(false);
    windowBox()?.focus();
  }
  async function downloadPrices() {
    if (downloading()) return;
    setDownloading(true);
    try {
      const answer = await api.client.rpc(QuotaRpc).downloadPrices({}, quotaCallOptions(api));
      api.ui.toast.show({
        variant: answer.ok ? "success" : "error",
        title: "Prices",
        message: sanitizeDisplayText(answer.message),
        duration: 6_000
      });
      if (answer.ok) void load();
    } catch (error) {
      api.ui.toast.show(errorToast(error, "Prices"));
    } finally {
      setDownloading(false);
    }
  }
  function readyReport() {
    const current = result();
    return current.state === "ready" ? current.report : undefined;
  }
  function failure() {
    const current = result();
    return current.state === "failed" ? current.message : undefined;
  }

  /** The models the breakdown shows as rows: none by day, without usage or without a report. */
  function modelRows() {
    const report = readyReport();
    return report && breakdown() === "model" ? breakdownModels(report, mode()) : [];
  }

  /**
   * The highlighted model row: while the content has the keyboard, the chosen row, or the last
   * one when a new report has fewer rows. Undefined without rows.
   */
  function litModel() {
    const count = modelRows().length;
    if (area() !== "content" || count === 0) return undefined;
    return Math.min(modelFocus(), count - 1);
  }
  function openModel(index) {
    const report = readyReport();
    const model = modelRows()[index];
    if (!report || !model) return;
    setArea("content");
    setModelFocus(index);
    const shownMode = mode();
    api.ui.dialog.show(() => _$createComponent(ModelDetail, {
      api: api,
      report: report,
      model: model,
      mode: shownMode
    }));
    api.ui.dialog.set({
      size: "large"
    });
  }

  /** The breakdown's order follows the mode, so the first model row is the chosen one again. */
  function chooseMode(next) {
    setMode(next);
    setModelFocus(0);
  }
  function chooseBreakdown(next) {
    setBreakdown(next);
    setModelFocus(0);
  }

  /** → or enter in the range list: the model rows get the keyboard, the first one in view. */
  function toModels() {
    if (modelRows().length === 0) return false;
    setArea("content");
    setModelFocus(0);
    scroll()?.scrollChildIntoView(modelRowId(0));
  }

  /** ← in the content: the range list gets the keyboard back, the content its top line. */
  function toRanges() {
    setArea("ranges");
    scroll()?.scrollTo(0);
  }

  /**
   * ↑↓: the next range in the range list (applied at once); in the content the next model row,
   * scrolled into view. Past the first or last row, or without rows, the window scrolls.
   */
  function move(delta) {
    if (area() === "ranges") {
      const index = USAGE_RANGES.findIndex(item => item.range === range());
      const next = USAGE_RANGES[index + delta];
      if (next) chooseRange(next.range, false);
      return;
    }
    const current = litModel();
    if (current === undefined) return false;
    const next = stepSelection(modelRows().length, current, delta);
    if (next === undefined) return false;
    setModelFocus(next);
    scroll()?.scrollChildIntoView(modelRowId(next));
  }

  /** Enter: in the range list the model rows get the keyboard; in the content it opens the model. */
  function enter() {
    if (area() === "ranges") return toModels();
    const model = litModel();
    if (model !== undefined) openModel(model);
  }
  function hints() {
    const field = dateFocus();
    if (field) {
      return [{
        key: "enter",
        label: field === "from" ? "next date" : "apply"
      }, {
        key: "tab",
        label: "other date"
      }, {
        key: "esc",
        label: "back"
      }];
    }
    const hasRows = modelRows().length > 0;
    let moves;
    if (area() === "ranges") {
      moves = [{
        key: "↑↓",
        label: "range"
      }, ...(hasRows ? [{
        key: "→",
        label: "models"
      }] : [])];
    } else if (hasRows) {
      moves = [{
        key: "↑↓",
        label: "models"
      }, {
        key: "enter",
        label: "details"
      }, {
        key: "←",
        label: "ranges"
      }];
    } else {
      moves = [{
        key: "↑↓",
        label: "scroll"
      }, {
        key: "←",
        label: "ranges"
      }];
    }
    return [...moves, ...(range() === "between" ? [{
      key: "d",
      label: "type dates"
    }] : []), {
      key: "c",
      label: "cost"
    }, {
      key: "t",
      label: "tokens"
    }, {
      key: "b",
      label: "by model/day"
    }, downloading() ? {
      label: "updating prices…"
    } : {
      key: "p",
      label: "update prices"
    }, {
      key: "tab",
      label: "next tab"
    }, {
      key: "esc",
      label: "close"
    }];
  }

  /** The ranges (`rail.tsx`); a click picks one, and on "Between" types its dates. */
  function RangeList() {
    return _$createComponent(Rail, {
      items: RANGE_ITEMS,
      get chosen() {
        return range();
      },
      get theme() {
        return api.theme;
      },
      gap: RANGE_LIST_GAP,
      pick: next => chooseRange(next, true)
    });
  }
  function View(props) {
    const theme = () => api.theme;
    windowBox = props.keyTarget;
    // A key's `window` action runs while the window has the keyboard, its `date` action while a
    // date input inside the window has it. A key without the action, or an action that returns
    // false, goes on to the window's own keys; letters and digits a date has no key for reach
    // the input.
    const keys = [{
      bind: "up",
      title: "Previous range or model",
      window: () => move(-1)
    }, {
      bind: "down",
      title: "Next range or model",
      window: () => move(1)
    }, {
      bind: "right",
      title: "To the models",
      window: () => area() === "ranges" ? toModels() : false,
      date: field => dateInput(field)?.moveCursorRight()
    }, {
      bind: "left",
      title: "Back to the ranges",
      window: () => area() === "content" ? toRanges() : false,
      date: field => dateInput(field)?.moveCursorLeft()
    }, {
      bind: "return",
      title: "To the models, open a model, or the next date",
      window: enter,
      date: field => submitDate(field)
    }, {
      bind: "tab",
      title: "Other date",
      date: field => dateInput(field === "from" ? "to" : "from")?.focus()
    }, {
      bind: "escape",
      title: "Back to the window",
      date: backToWindow
    }, {
      bind: "c",
      title: "Show cost",
      window: () => chooseMode("cost")
    }, {
      bind: "t",
      title: "Show tokens",
      window: () => chooseMode("tokens")
    }, {
      bind: "b",
      title: "Breakdown by model or by day",
      window: () => chooseBreakdown(breakdown() === "model" ? "day" : "model")
    }, {
      bind: "p",
      title: "Update prices",
      window: () => void downloadPrices()
    }, {
      bind: "d",
      title: "Type the dates",
      window: () => {
        if (range() === "between") typeDates();
      }
    }];
    // Above the window's own keys; the window's target also covers the inputs inside it.
    api.keymap.layer(() => ({
      target: props.keyTarget,
      priority: KEY_LAYERS.tab,
      commands: keys.map(key => ({
        bind: key.bind,
        title: key.title,
        group: KEYS,
        run: () => {
          const field = dateFocus();
          if (field) return key.date ? key.date(field) : false;
          return key.window ? key.window() : false;
        }
      }))
    }));
    const view = createMemo(() => {
      const report = readyReport();
      return report ? usageView(report, {
        mode: mode(),
        breakdown: breakdown(),
        width: props.width
      }) : {
        lines: [],
        modelLines: []
      };
    });
    const dateBox = field => (() => {
      var _el$10 = _$createElement("input");
      _$use(element => {
        if (field === "from") fromInput = element;else toInput = element;
        element.on("focused", () => setDateFocus(field));
        element.on("blurred", () => {
          setDateFocus(now => now === field ? undefined : now);
          // The keyboard went elsewhere (a click in the window): the dates show again.
          queueMicrotask(() => {
            if (dateFocus() === undefined) setEditingDates(false);
          });
        });
      }, _el$10);
      _$setProp(_el$10, "width", 13);
      _$setProp(_el$10, "flexShrink", 0);
      _$setProp(_el$10, "maxLength", 10);
      _$setProp(_el$10, "placeholder", "YYYY-MM-DD");
      _$setProp(_el$10, "onMouseDown", event => {
        // The window under the box would take the keyboard back and end the typing.
        event.stopPropagation();
        dateInput(field)?.focus();
      });
      _$effect(_p$ => {
        var _v$10 = dates()[field],
          _v$11 = theme().background.raised.high,
          _v$12 = theme().text.base;
        _v$10 !== _p$.e && (_p$.e = _$setProp(_el$10, "value", _v$10, _p$.e));
        _v$11 !== _p$.t && (_p$.t = _$setProp(_el$10, "backgroundColor", _v$11, _p$.t));
        _v$12 !== _p$.a && (_p$.a = _$setProp(_el$10, "textColor", _v$12, _p$.a));
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined
      });
      return _el$10;
    })();
    /** The report's dates after the range's name; a click on Between's types them. */
    const datesText = () => {
      const report = readyReport();
      const text = report ? rangeDates(report) : undefined;
      if (!text) return null;
      return (() => {
        var _el$11 = _$createElement("text");
        _$setProp(_el$11, "wrapMode", "none");
        _$setProp(_el$11, "flexShrink", 0);
        _$setProp(_el$11, "selectable", false);
        _$insert(_el$11, `  ${text}`);
        _$effect(_p$ => {
          var _v$13 = theme().text.muted,
            _v$14 = range() === "between" ? typeDates : undefined;
          _v$13 !== _p$.e && (_p$.e = _$setProp(_el$11, "fg", _v$13, _p$.e));
          _v$14 !== _p$.t && (_p$.t = _$setProp(_el$11, "onMouseUp", _v$14, _p$.t));
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$11;
      })();
    };
    return (() => {
      var _el$12 = _$createElement("box"),
        _el$13 = _$createElement("box"),
        _el$14 = _$createElement("text"),
        _el$18 = _$createElement("box"),
        _el$19 = _$createElement("box");
      _$insertNode(_el$12, _el$13);
      _$insertNode(_el$12, _el$19);
      _$setProp(_el$12, "flexDirection", "column");
      _$setProp(_el$12, "flexShrink", 0);
      _$insertNode(_el$13, _el$14);
      _$insertNode(_el$13, _el$18);
      _$setProp(_el$13, "flexDirection", "row");
      _$setProp(_el$13, "flexShrink", 0);
      _$setProp(_el$14, "wrapMode", "none");
      _$setProp(_el$14, "flexShrink", 0);
      _$setProp(_el$14, "selectable", false);
      _$insert(_el$14, () => usageRangeLabel(range()));
      _$insert(_el$13, _$createComponent(Show, {
        get when() {
          return _$memo(() => !!editingDates())() && range() === "between";
        },
        get fallback() {
          return datesText();
        },
        get children() {
          var _el$15 = _$createElement("box"),
            _el$16 = _$createElement("text");
          _$insertNode(_el$15, _el$16);
          _$setProp(_el$15, "flexDirection", "row");
          _$setProp(_el$15, "columnGap", 1);
          _$setProp(_el$15, "marginLeft", 2);
          _$setProp(_el$15, "flexShrink", 0);
          _$insert(_el$15, () => dateBox("from"), _el$16);
          _$insertNode(_el$16, _$createTextNode(`to`));
          _$setProp(_el$16, "wrapMode", "none");
          _$setProp(_el$16, "flexShrink", 0);
          _$setProp(_el$16, "selectable", false);
          _$insert(_el$15, () => dateBox("to"), null);
          _$effect(_$p => _$setProp(_el$16, "fg", theme().text.muted, _$p));
          return _el$15;
        }
      }), _el$18);
      _$setProp(_el$18, "flexGrow", 1);
      _$insert(_el$13, _$createComponent(Option, {
        label: "Cost",
        get active() {
          return mode() === "cost";
        },
        get theme() {
          return theme();
        },
        run: () => chooseMode("cost")
      }), null);
      _$insert(_el$13, _$createComponent(Option, {
        label: "Tokens",
        get active() {
          return mode() === "tokens";
        },
        get theme() {
          return theme();
        },
        run: () => chooseMode("tokens")
      }), null);
      _$setProp(_el$19, "flexDirection", "column");
      _$setProp(_el$19, "marginTop", 1);
      _$insert(_el$19, _$createComponent(Show, {
        get when() {
          return result().state === "loading";
        },
        get children() {
          var _el$20 = _$createElement("text");
          _$insertNode(_el$20, _$createTextNode(`Loading usage…`));
          _$effect(_$p => _$setProp(_el$20, "fg", theme().text.muted, _$p));
          return _el$20;
        }
      }), null);
      _$insert(_el$19, _$createComponent(Show, {
        get when() {
          return failure();
        },
        get children() {
          var _el$22 = _$createElement("text");
          _$setProp(_el$22, "wrapMode", "word");
          _$insert(_el$22, () => `Couldn't load the usage: ${failure()}`);
          _$effect(_$p => _$setProp(_el$22, "fg", theme().text.feedback.error.base, _$p));
          return _el$22;
        }
      }), null);
      _$insert(_el$19, () => view().lines.map((line, index) => {
        if (index === view().breakdownAt) {
          return (() => {
            var _el$23 = _$createElement("box"),
              _el$24 = _$createElement("box"),
              _el$25 = _$createElement("box");
            _$insertNode(_el$23, _el$24);
            _$insertNode(_el$23, _el$25);
            _$setProp(_el$23, "flexDirection", "row");
            _$insert(_el$23, _$createComponent(UsageLineText, {
              line: line,
              get theme() {
                return theme();
              }
            }), _el$24);
            _$setProp(_el$24, "flexGrow", 1);
            _$setProp(_el$25, "flexDirection", "row");
            _$setProp(_el$25, "flexShrink", 0);
            _$insert(_el$25, _$createComponent(Option, {
              label: "Model",
              get active() {
                return breakdown() === "model";
              },
              get theme() {
                return theme();
              },
              run: () => chooseBreakdown("model")
            }), null);
            _$insert(_el$25, _$createComponent(Option, {
              label: "Day",
              get active() {
                return breakdown() === "day";
              },
              get theme() {
                return theme();
              },
              run: () => chooseBreakdown("day")
            }), null);
            return _el$23;
          })();
        }
        const model = view().modelLines.indexOf(index);
        if (model < 0) {
          return _$createComponent(UsageLineText, {
            line: line,
            get theme() {
              return theme();
            }
          });
        }
        return _$createComponent(UsageLineText, {
          line: line,
          get theme() {
            return theme();
          },
          get id() {
            return modelRowId(model);
          },
          get selected() {
            return litModel() === model;
          },
          onClick: () => openModel(model)
        });
      }), null);
      _$effect(_p$ => {
        var _v$15 = props.width,
          _v$16 = theme().text.base,
          _v$17 = TextAttributes.BOLD;
        _v$15 !== _p$.e && (_p$.e = _$setProp(_el$12, "width", _v$15, _p$.e));
        _v$16 !== _p$.t && (_p$.t = _$setProp(_el$14, "fg", _v$16, _p$.t));
        _v$17 !== _p$.a && (_p$.a = _$setProp(_el$14, "attributes", _v$17, _p$.a));
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined
      });
      return _el$12;
    })();
  }
  return {
    choose(choice) {
      setRange(choice.range);
      if (choice.from && choice.to) setDates({
        from: choice.from,
        to: choice.to
      });
      setArea("ranges");
    },
    typingDate: () => dateFocus() !== undefined,
    show(nextSessionID) {
      sessionID = nextSessionID;
      setArea("ranges");
      void load();
    },
    hints,
    Rail: RangeList,
    View
  };
}
