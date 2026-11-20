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
 * The Quota panel in the session sidebar (§4.1) and its collapsed form (§4.2). Click the
 * title to collapse or expand it; OpenCode's plugin storage remembers the choice. The lines
 * come from `view/text.ts`; this file only colors them, and marks the line the quota window's
 * Settings tabs have selected.
 */

import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import { sidebarPanel } from "../view/text.js";
import { roleColor, segmentColor } from "./theme.js";

/** What the quota window's Settings tabs tell the surfaces while you edit them. */

/** What every always-on surface reads. */

/** Columns the panel uses until it knows its real width. */
const DEFAULT_SIDEBAR_WIDTH = 36;

/** The names of a marked line take the accent color; bars and numbers keep theirs. */
const MARKED_ROLES = new Set(["provider", "label", "statusName"]);

/** One line of a surface, each segment in its color. A marked line has a soft background. */
export function LineText(props) {
  const theme = () => props.host.theme();
  const color = segment => props.marked && MARKED_ROLES.has(segment.role) ? theme().text.action.primary.selected : segmentColor(theme(), props.host.display(), segment);
  return (() => {
    var _el$ = _$createElement("text");
    _$setProp(_el$, "wrapMode", "none");
    _$setProp(_el$, "selectable", false);
    _$setProp(_el$, "flexShrink", 0);
    _$insert(_el$, () => props.line.segments.length === 0 ? " " : null, null);
    _$insert(_el$, () => props.line.segments.map(segment => (() => {
      var _el$2 = _$createElement("span");
      _$insert(_el$2, () => segment.text);
      _$effect(_$p => _$setProp(_el$2, "style", {
        fg: color(segment),
        bold: segment.bold === true
      }, _$p));
      return _el$2;
    })()), null);
    _$effect(_$p => _$setProp(_el$, "bg", props.marked ? theme().background.raised.high : undefined, _$p));
    return _el$;
  })();
}
export function SidebarPanel(props) {
  const host = props.host;
  const stop = host.quota.watch(props.sessionID);
  onCleanup(stop);
  onCleanup(host.editing.sidebarShown());
  const open = () => host.editing.panelOpen() ?? props.open();
  const [width, setWidth] = createSignal(DEFAULT_SIDEBAR_WIDTH);
  const [nowMs, setNowMs] = createSignal(Date.now());
  // Reset times count down between snapshots.
  const clock = setInterval(() => setNowMs(Date.now()), 60_000);
  onCleanup(() => clearInterval(clock));
  const display = () => host.display();
  const snapshot = () => host.quota.snapshot(props.sessionID);
  const panel = createMemo(() => sidebarPanel(snapshot(), display(), {
    nowMs: nowMs(),
    width: width(),
    open: open()
  }));
  const marked = () => host.editing.marked(open() ? "sidebar" : "collapsed");
  return _$createComponent(Show, {
    get when() {
      return display().sidebar.show;
    },
    get children() {
      var _el$3 = _$createElement("box"),
        _el$4 = _$createElement("text"),
        _el$5 = _$createElement("b");
      _$insertNode(_el$3, _el$4);
      _$setProp(_el$3, "flexDirection", "column");
      _$setProp(_el$3, "onSizeChange", function () {
        const measured = this.width;
        if (measured > 0) queueMicrotask(() => setWidth(measured));
      });
      _$insertNode(_el$4, _el$5);
      _$setProp(_el$4, "wrapMode", "none");
      _$setProp(_el$4, "selectable", false);
      _$setProp(_el$4, "onMouseDown", () => props.setOpen(!open()));
      _$insert(_el$5, () => panel().title);
      _$insert(_el$3, _$createComponent(Show, {
        get when() {
          return snapshot();
        },
        get fallback() {
          return (() => {
            var _el$6 = _$createElement("text");
            _$insertNode(_el$6, _$createTextNode(`Loading quota…`));
            _$effect(_$p => _$setProp(_el$6, "fg", host.theme().text.muted, _$p));
            return _el$6;
          })();
        },
        get children() {
          return panel().lines.map(line => _$createComponent(LineText, {
            line: line,
            host: host,
            get marked() {
              return _$memo(() => line.id !== "")() && line.id === marked();
            }
          }));
        }
      }), null);
      _$effect(_$p => _$setProp(_el$4, "fg", roleColor(host.theme(), display(), "title"), _$p));
      return _el$3;
    }
  });
}
