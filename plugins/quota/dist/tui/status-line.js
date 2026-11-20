import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
/** @jsxImportSource @opentui/solid */
/**
 * The quota status line under the message box (§4.3) and at the bottom of Home. It asks for
 * the room its narrowest form needs, up to a third of the footer row (`statusLineBasis`), and
 * takes all the room OpenCode's footer leaves free. It shows the most detail that fits every
 * provider, and scrolls when even "% only" does not fit: mouse wheel, or click "‹" / "+N ›".
 */

import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { columnsOf } from "../view/columns.js";
import { bigStatusLine, lineText, statusLayout, statusLineInput, statusLineWidth, statusMarkers } from "../view/text.js";
import { LineText } from "./sidebar.js";
import { roleColor } from "./theme.js";

/**
 * The status line shows under a session's message box: it is on, and its Settings tab is open,
 * it shows next to the sidebar, or no sidebar panel with quota is on screen.
 */
export function statusLineShows(host) {
  const settings = host.display();
  if (!settings.statusLine.show) return false;
  const sidebarQuota = host.editing.sidebarOnScreen() && settings.sidebar.show;
  return host.editing.tabOpen("statusLine") || settings.statusLine.withSidebar || !sidebarQuota;
}

/**
 * The flex basis of the status line's box: the width it asks for before the free room is
 * shared. OpenCode's session footer cuts its folder name to the room that name had at the last
 * layout, so at start a long folder name keeps all the free room, and a box with basis 0 stays
 * empty. With this basis the folder name gives room back: `wanted` columns (the line's
 * narrowest form), but never more than a third of the footer row, nor more than the
 * `statusLine.width` setting (0: no limit). The box still shrinks with the folder name when the
 * row is too narrow for both.
 */
export function statusLineBasis(wanted, rowWidth, maxWidth) {
  const third = Math.floor(rowWidth / 3);
  const limit = maxWidth > 0 ? Math.min(third, maxWidth) : third;
  return Math.max(0, Math.min(wanted, limit));
}
export function StatusLine(props) {
  const host = props.host;
  onCleanup(host.quota.watch(props.sessionID));
  const [room, setRoom] = createSignal(0);
  // The width of the row the box sits in, read when the box is measured.
  const [rowWidth, setRowWidth] = createSignal(0);
  const [start, setStart] = createSignal(0);
  const [nowMs, setNowMs] = createSignal(Date.now());
  const clock = setInterval(() => setNowMs(Date.now()), 60_000);
  onCleanup(() => clearInterval(clock));
  const display = () => host.display();
  const input = () => {
    const snapshot = host.quota.snapshot(props.sessionID);
    return snapshot && statusLineInput(snapshot, display(), nowMs());
  };
  const big = () => display().statusLine.detail === "one";
  const layout = () => {
    const current = input();
    // The room is 0 until OpenCode measures the box: no markers on their own before that.
    if (!current || big() || room() === 0) return undefined;
    const detail = display().statusLine.detail;
    return statusLayout(current, room(), start(), detail === "one" ? "auto" : detail);
  };
  const count = () => input()?.groups.length ?? 0;
  const step = delta => setStart(Math.max(0, Math.min(count() - 1, start() + delta)));
  const color = role => roleColor(host.theme(), display(), role);
  // The narrowest whole line: every provider at "% only", or the big bar's one provider.
  const narrowest = current => {
    if (!big()) return statusLineWidth(current, "numbers");
    const line = bigStatusLine(current);
    return line ? columnsOf(lineText(line)) : 0;
  };
  const basis = () => {
    const current = input();
    if (!current || current.groups.length === 0) return 0;
    // One spare column, like `room` below.
    const wanted = narrowest(current) + 1;
    return statusLineBasis(wanted, rowWidth() || (props.terminalWidth?.() ?? 0), display().statusLine.width);
  };
  const marked = () => host.editing.marked("statusLine");
  // The provider selected on the Settings tab scrolls into view.
  createEffect(() => {
    const index = input()?.groups.findIndex(group => group.providerId === marked()) ?? -1;
    const current = layout();
    if (index < 0 || !current || room() === 0) return;
    if (index < current.start || index >= current.start + current.shown.length) setStart(index);
  });

  // Optional: page through by itself every few seconds.
  createEffect(() => {
    const seconds = display().statusLine.autoScrollSeconds;
    if (!seconds) return;
    const timer = setInterval(() => {
      const current = layout();
      if (!current) return;
      setStart(current.hiddenAfter > 0 ? current.start + current.shown.length : 0);
    }, seconds * 1000);
    onCleanup(() => clearInterval(timer));
  });
  return (() => {
    var _el$ = _$createElement("box");
    _$setProp(_el$, "flexDirection", "row");
    _$setProp(_el$, "justifyContent", "flex-end");
    _$setProp(_el$, "flexGrow", 1000);
    _$setProp(_el$, "flexShrink", 1);
    _$setProp(_el$, "minWidth", 0);
    _$setProp(_el$, "overflow", "hidden");
    _$setProp(_el$, "onSizeChange", function () {
      // In OpenCode's footer the box can end up one column narrower than measured here
      // (seen at 200 columns), which cut the first letter; one spare column avoids it.
      const width = Math.max(0, this.width - 1);
      const row = this.parent?.width ?? 0;
      queueMicrotask(() => {
        setRoom(width);
        setRowWidth(row);
      });
    });
    _$setProp(_el$, "onMouseScroll", event => {
      const direction = event.scroll?.direction;
      if (direction === "down" || direction === "right") step(1);
      if (direction === "up" || direction === "left") step(-1);
    });
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return _$memo(() => !!big())() ? input() : undefined;
      },
      children: current => // The room is 0 until OpenCode measures the box; until then the line is drawn whole.
      _$createComponent(Show, {
        get when() {
          return bigStatusLine(current(), room() || undefined);
        },
        children: line => _$createComponent(LineText, {
          get line() {
            return line();
          },
          host: host,
          get marked() {
            return line().id === marked();
          }
        })
      })
    }), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return layout();
      },
      children: current => [_$createComponent(Show, {
        get when() {
          return statusMarkers(current()).before;
        },
        children: marker => (() => {
          var _el$2 = _$createElement("text");
          _$setProp(_el$2, "wrapMode", "none");
          _$setProp(_el$2, "flexShrink", 0);
          _$setProp(_el$2, "selectable", false);
          _$setProp(_el$2, "onMouseUp", () => step(-1));
          _$insert(_el$2, marker);
          _$effect(_$p => _$setProp(_el$2, "fg", color("arrows"), _$p));
          return _el$2;
        })()
      }), _$memo(() => current().shown.map((line, index) => [_$createComponent(Show, {
        when: index > 0,
        get children() {
          var _el$3 = _$createElement("text");
          _$setProp(_el$3, "wrapMode", "none");
          _$setProp(_el$3, "flexShrink", 0);
          _$setProp(_el$3, "selectable", false);
          _$insert(_el$3, () => display().layout.separator);
          _$effect(_$p => _$setProp(_el$3, "fg", color("separator"), _$p));
          return _el$3;
        }
      }), _$createComponent(LineText, {
        line: line,
        host: host,
        get marked() {
          return line.id === marked();
        }
      })])), _$createComponent(Show, {
        get when() {
          return statusMarkers(current()).after;
        },
        children: marker => (() => {
          var _el$4 = _$createElement("text");
          _$setProp(_el$4, "wrapMode", "none");
          _$setProp(_el$4, "flexShrink", 0);
          _$setProp(_el$4, "selectable", false);
          _$setProp(_el$4, "onMouseUp", () => step(1));
          _$insert(_el$4, marker);
          _$effect(_$p => _$setProp(_el$4, "fg", color("arrows"), _$p));
          return _el$4;
        })()
      })]
    }), null);
    _$effect(_p$ => {
      var _v$ = basis(),
        _v$2 = display().statusLine.width || undefined;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$, "flexBasis", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$, "maxWidth", _v$2, _p$.t));
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
}

/**
 * The bottom of Home: the maintainer notice line, then the status line when it is on for Home.
 * Home has its own switch (`statusLine.home`); the one for sessions does not hide it.
 */
export function HomeFooter(props) {
  const host = props.host;
  onCleanup(host.quota.watchHome());
  const showStatus = () => host.display().statusLine.home;
  return _$createComponent(Show, {
    get when() {
      return host.quota.homeLine() || showStatus();
    },
    get children() {
      var _el$5 = _$createElement("box");
      _$setProp(_el$5, "flexDirection", "row");
      _$setProp(_el$5, "gap", 2);
      _$setProp(_el$5, "flexShrink", 1);
      _$setProp(_el$5, "minWidth", 0);
      _$insert(_el$5, _$createComponent(Show, {
        get when() {
          return host.quota.homeLine();
        },
        get children() {
          var _el$6 = _$createElement("text");
          _$setProp(_el$6, "wrapMode", "none");
          _$setProp(_el$6, "flexShrink", 0);
          _$insert(_el$6, () => host.quota.homeLine());
          _$effect(_$p => _$setProp(_el$6, "fg", host.theme().text.muted, _$p));
          return _el$6;
        }
      }), null);
      _$insert(_el$5, _$createComponent(Show, {
        get when() {
          return showStatus();
        },
        get children() {
          return _$createComponent(StatusLine, {
            host: host
          });
        }
      }), null);
      _$effect(_p$ => {
        var _v$3 = showStatus() ? 1000 : 0,
          _v$4 = showStatus() ? 0 : "auto";
        _v$3 !== _p$.e && (_p$.e = _$setProp(_el$5, "flexGrow", _v$3, _p$.e));
        _v$4 !== _p$.t && (_p$.t = _$setProp(_el$5, "flexBasis", _v$4, _p$.t));
        return _p$;
      }, {
        e: undefined,
        t: undefined
      });
      return _el$5;
    }
  });
}
