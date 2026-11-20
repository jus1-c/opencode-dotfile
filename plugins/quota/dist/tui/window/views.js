import { memo as _$memo } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
/** @jsxImportSource @opentui/solid */
/**
 * The bodies of the quota window's Limits and Plugin tabs. Their text comes from pure
 * builders: `limits.ts`, and `noticeItems` and `statusLines` here; the views only color it.
 */
import { TextAttributes } from "@opentui/core";
import { Show } from "solid-js";
import { sanitizeDisplayText } from "../../lib/display-sanitize.js";
import { columnsOf } from "../../view/columns.js";
import { LineText } from "../sidebar.js";
import { limitsLines } from "./limits.js";

/** The active maintainer notices. */

/** The notices, or the one line that says there is none. */
export function noticeItems(board) {
  return board.notices.length === 0 ? {
    items: [],
    empty: "No notices right now."
  } : {
    items: board.notices
  };
}
/** The status report's lead: it starts 3 columns into the window body. */
const STATUS_LEAD = 3;

/**
 * The status report on Plugin: the /quota_status report's lines, its title ("# ") and its
 * section titles (an unindented line that ends with ":") marked so they can be bold. A list
 * joined with " | " that is wider than `width` goes on under itself between items, lined up
 * after its "key: ", so an id like `google-gemini-cli` never breaks at its "-".
 */
export function statusLines(text, width = Number.POSITIVE_INFINITY) {
  return text.split("\n").flatMap(line => {
    const heading = line.startsWith("# ") || /^[^\s-]/u.test(line) && line.endsWith(":");
    return listRows(line, width).map(row => ({
      text: row,
      heading
    }));
  });
}

/** A " | " list in rows no wider than `width` (when each item fits), broken between items. */
function listRows(line, width) {
  const items = line.split(" | ");
  if (items.length < 2 || columnsOf(line) <= width) return [line];
  const keyEnd = items[0].indexOf(": ");
  const lead = " ".repeat(keyEnd === -1 ? 0 : keyEnd + 2);
  const rows = [];
  let row = items[0];
  items.slice(1).forEach((item, index) => {
    const last = index === items.length - 2;
    const next = `${row} | ${item}`;
    if (columnsOf(next) + (last ? 0 : 2) <= width) {
      row = next;
      return;
    }
    rows.push(`${row} |`);
    row = `${lead}${item}`;
  });
  return [...rows, row];
}
export function LimitsView(props) {
  const snapshot = () => props.host.quota.snapshot(props.sessionID);
  const lines = () => {
    const current = snapshot();
    if (!current) return [];
    const display = props.host.display();
    return limitsLines({
      snapshot: current,
      display,
      nowMs: props.nowMs,
      width: props.width
    });
  };
  return _$createComponent(Show, {
    get when() {
      return snapshot();
    },
    get fallback() {
      return (() => {
        var _el$ = _$createElement("text");
        _$insertNode(_el$, _$createTextNode(`   Loading quota…`));
        _$effect(_$p => _$setProp(_el$, "fg", props.host.theme().text.muted, _$p));
        return _el$;
      })();
    },
    get children() {
      return lines().map(line => _$createComponent(LineText, {
        line: line,
        get host() {
          return props.host;
        }
      }));
    }
  });
}

/** Plugin's notices under their title: a bullet, the message, and its link under it. */
export function NoticesView(props) {
  const theme = () => props.theme;
  const body = () => {
    const report = props.report;
    if (report.state === "loading") return {
      items: [],
      empty: "Loading…"
    };
    if (report.state === "failed") {
      return {
        items: [],
        empty: `Couldn't load the notices: ${report.message}`
      };
    }
    return noticeItems(report.board);
  };
  return (() => {
    var _el$3 = _$createElement("box"),
      _el$4 = _$createElement("text");
    _$insertNode(_el$3, _el$4);
    _$setProp(_el$3, "flexDirection", "column");
    _$insertNode(_el$4, _$createTextNode(` Notices`));
    _$setProp(_el$4, "wrapMode", "none");
    _$setProp(_el$4, "selectable", false);
    _$insert(_el$3, _$createComponent(Show, {
      get when() {
        return body().empty;
      },
      get children() {
        var _el$6 = _$createElement("text");
        _$setProp(_el$6, "wrapMode", "word");
        _$setProp(_el$6, "selectable", false);
        _$insert(_el$6, () => `   ${body().empty}`);
        _$effect(_$p => _$setProp(_el$6, "fg", theme().text.muted, _$p));
        return _el$6;
      }
    }), null);
    _$insert(_el$3, () => body().items.map(item => (() => {
      var _el$7 = _$createElement("box"),
        _el$8 = _$createElement("text"),
        _el$0 = _$createElement("box"),
        _el$1 = _$createElement("text");
      _$insertNode(_el$7, _el$8);
      _$insertNode(_el$7, _el$0);
      _$setProp(_el$7, "flexDirection", "row");
      _$insertNode(_el$8, _$createTextNode(`   • `));
      _$setProp(_el$8, "wrapMode", "none");
      _$setProp(_el$8, "selectable", false);
      _$insertNode(_el$0, _el$1);
      _$setProp(_el$0, "flexDirection", "column");
      _$setProp(_el$0, "flexShrink", 1);
      _$setProp(_el$1, "wrapMode", "word");
      _$insert(_el$1, () => sanitizeDisplayText(item.message));
      _$insert(_el$0, _$createComponent(Show, {
        get when() {
          return item.url;
        },
        get children() {
          var _el$10 = _$createElement("text");
          _$setProp(_el$10, "wrapMode", "none");
          _$insert(_el$10, () => sanitizeDisplayText(item.url ?? ""));
          _$effect(_$p => _$setProp(_el$10, "fg", theme().text.muted, _$p));
          return _el$10;
        }
      }), null);
      _$effect(_p$ => {
        var _v$3 = theme().hue.accent[500],
          _v$4 = theme().text.base;
        _v$3 !== _p$.e && (_p$.e = _$setProp(_el$8, "fg", _v$3, _p$.e));
        _v$4 !== _p$.t && (_p$.t = _$setProp(_el$1, "fg", _v$4, _p$.t));
        return _p$;
      }, {
        e: undefined,
        t: undefined
      });
      return _el$7;
    })()), null);
    _$effect(_p$ => {
      var _v$ = theme().text.action.primary.selected,
        _v$2 = TextAttributes.BOLD;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$4, "fg", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$4, "attributes", _v$2, _p$.t));
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$3;
  })();
}

/**
 * The /quota_status report as text you can select, all in the muted color (its section titles
 * bold): it is for pasting into an issue, and reads apart from the tab's own lines.
 */
export function StatusView(props) {
  const theme = () => props.theme;
  const lines = () => {
    const report = props.report;
    if (report.state === "loading") return [{
      text: "Loading the report…",
      heading: false
    }];
    if (report.state === "failed") {
      return [{
        text: `Couldn't load the report: ${report.message}`,
        heading: false
      }];
    }
    return statusLines(report.text, props.width - STATUS_LEAD);
  };
  return (() => {
    var _el$11 = _$createElement("box");
    _$setProp(_el$11, "flexDirection", "column");
    _$setProp(_el$11, "marginTop", 1);
    _$setProp(_el$11, "paddingLeft", 3);
    _$insert(_el$11, () => lines().map(line => (() => {
      var _el$12 = _$createElement("text");
      _$setProp(_el$12, "wrapMode", "word");
      _$insert(_el$12, () => line.text || " ");
      _$effect(_p$ => {
        var _v$5 = theme().text.muted,
          _v$6 = line.heading ? TextAttributes.BOLD : TextAttributes.NONE;
        _v$5 !== _p$.e && (_p$.e = _$setProp(_el$12, "fg", _v$5, _p$.e));
        _v$6 !== _p$.t && (_p$.t = _$setProp(_el$12, "attributes", _v$6, _p$.t));
        return _p$;
      }, {
        e: undefined,
        t: undefined
      });
      return _el$12;
    })()));
    return _el$11;
  })();
}
