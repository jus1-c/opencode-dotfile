import { use as _$use } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
/** @jsxImportSource @opentui/solid */
/**
 * The quota window. `/quota`, `/quota_usage`, `/quota_status` and `/quota_settings` open it
 * above the message box of a session, where it covers the chat
 * with the same size on every tab: Usage, Limits, Plugin and the Settings tabs Layout, Colors
 * and Providers (`settings.tsx`); Layout has pages, All places and one per place. The tab bar is
 * one line: the window's title and the plugin's version, the tabs, and "esc" at its right end to
 * close the window. When its tabs don't fit, it drops the "Settings" label, then shows the tabs
 * around the current one between ‹ and ›. Usage keeps its range list and Layout its page list
 * left of the scrolling tab body (`rail.tsx`); a Settings tab's switch and warning sit above
 * that body. The bottom line lists the tab's keys (Usage's as key and label pairs); the Settings
 * tabs have Save and Discard above it. While the window is focused (it is after opening; click
 * it to give it the keyboard again) its keys work: ↑↓ select or scroll,
 * space/enter use a line, ←/→ change it, c on Limits copies its limits as text, tab switches
 * tabs, esc closes (the line rules are `option-line.ts`'s). Closing gives the keyboard back to
 * whatever had it before. Plugin shows the maintainer notices, the switches for other tools and
 * the status report (`plugin-tab.tsx`).
 */

import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { DEFAULT_USAGE_RANGE } from "../../core/usage-ranges.js";
import { quotaLimitsText } from "../../lib/quota-report-message.js";
import { getPackageVersion } from "../../lib/version.js";
import { columnsOf } from "../../view/columns.js";
import { KEY_LAYERS } from "../key-layers.js";
import { createPluginTab } from "./plugin-tab.js";
import { isSettingsTab, pagesRoom, SETTINGS_GROUPS } from "./settings.js";
import { Choice, createUsageTab, USAGE_RAIL_WIDTH } from "./usage.js";
import { LimitsView } from "./views.js";

/** Columns inside the window until it knows its real width. */
const DEFAULT_WIDTH = 120;

/** A tab whose lines the window's own keys use (`option-line.ts` rules). */

/** A tab of the tab bar and the window tabs it shows: Layout shows one of its pages. */

/** The view tabs; the Settings tabs (`SETTINGS_GROUPS`) follow them under their own label. */
const TABS = [{
  title: "Usage",
  pages: ["usage"]
}, {
  title: "Limits",
  pages: ["limits"]
}, {
  title: "Plugin",
  pages: ["system"]
}];
/** Every tab in the order the tab bar shows them and tab and shift+tab go through them. */
const BAR_TABS = [...TABS, ...SETTINGS_GROUPS];
const WINDOW_TITLE = "OpenCode Quota";
const SETTINGS_LABEL = "Settings";
const TAB_GAP = 2;
/** "‹" or "›" and its gap. */
const ARROW_WIDTH = 1 + TAB_GAP;
/** The "esc" that closes the window, at the right end of the tab bar, and the gap before it. */
const CLOSE_WIDTH = "esc".length + TAB_GAP;
const HINT_SEPARATOR = " · ";

/** The keyboard hint of Limits and the other tabs without their own; Limits names the ┃ mark with `evenUse`. */
export function windowHint(tab, evenUse) {
  const end = "tab next tab · esc close";
  if (tab === "limits") {
    const mark = evenUse ? "┃ where even use would be · " : "";
    return `${mark}c copy · ↑↓ scroll · ${end}`;
  }
  return `↑↓ select · space/enter or click to use · ‹ › (or ←/→) change · ${end}`;
}

/** The keyboard hint in `width` columns, its lines broken between " · " items, never inside one. */
export function hintLines(hint, width) {
  const lines = [];
  for (const item of hint.split(HINT_SEPARATOR)) {
    const last = lines.length - 1;
    if (last >= 0 && columnsOf(lines[last] + HINT_SEPARATOR + item) <= width) {
      lines[last] += HINT_SEPARATOR + item;
    } else {
      lines.push(item);
    }
  }
  return lines.join("\n");
}

/** A key and what it does, for a tab's bottom line; without a key, a note such as "updating…". */

const KEY_HINT_GAP = "  ";
function keyHintText(hint) {
  return hint.key ? `${hint.key} ${hint.label}` : hint.label;
}

/** The key hints in `width` columns, two spaces apart, lines broken between hints, never inside one. */
export function keyHintLines(hints, width) {
  const lines = [];
  let lineWidth = 0;
  for (const hint of hints) {
    const hintWidth = columnsOf(keyHintText(hint));
    const last = lines.at(-1);
    if (last && lineWidth + KEY_HINT_GAP.length + hintWidth <= width) {
      last.push(hint);
      lineWidth += KEY_HINT_GAP.length + hintWidth;
    } else {
      lines.push([hint]);
      lineWidth = hintWidth;
    }
  }
  return lines;
}
/**
 * What fits in `room` columns after the window's title: every tab under both labels; every tab
 * with a │ before the Settings tabs; or the tabs around `active` between ‹ and ›.
 */
export function tabStrip(titles, settingsFrom, active, room) {
  const runWidth = (first, last, label) => {
    let width = 0;
    for (let index = first; index <= last; index += 1) {
      width += titles[index].length + (index > first ? TAB_GAP : 0);
    }
    if (first < settingsFrom && last >= settingsFrom) {
      width += (label ? SETTINGS_LABEL.length : 1) + TAB_GAP;
    }
    return width;
  };
  const end = titles.length - 1;
  if (runWidth(0, end, true) <= room) return {
    first: 0,
    last: end,
    settingsLabel: true
  };
  if (runWidth(0, end, false) <= room) return {
    first: 0,
    last: end,
    settingsLabel: false
  };
  const fits = (first, last) => runWidth(first, last, false) + (first > 0 ? ARROW_WIDTH : 0) + (last < end ? ARROW_WIDTH : 0) <= room;
  let first = active;
  let last = active;
  for (let grew = true; grew;) {
    grew = false;
    if (last < end && fits(first, last + 1)) {
      last += 1;
      grew = true;
    }
    if (first > 0 && fits(first - 1, last)) {
      first -= 1;
      grew = true;
    }
  }
  return {
    first,
    last,
    settingsLabel: false
  };
}

/** The theme tokens the window reads, besides the surfaces' ones (OpenCode's `ResolvedTheme`). */

/** Returning false lets the key continue to the next layer. */

/** What the window needs from OpenCode's TUI context (its theme and client types aren't installed). */

/** The session on screen; undefined on Home. */
export function routeSessionID(api) {
  const route = api.ui.router.current();
  return route.type === "session" ? route.sessionID : undefined;
}
const KEYS = "Quota window";
export function createQuotaWindow(api, host, settings) {
  const [tab, setTab] = createSignal();
  /** The page each tab of the tab bar showed last, by its title: Layout goes back to it. */
  const lastPages = new Map();
  let windowBox;
  let scroll;
  /** What had the keyboard before the window opened (the message box), so closing gives it back. */
  let focusBefore = null;
  /**
   * The window had the keyboard and nothing took it on purpose. A resize across the sidebar's
   * breakpoint makes OpenCode give the keyboard to its message box, and OpenCode can draw the
   * window again (a new box); the window then takes the keyboard back.
   */
  let keyboardWanted = false;
  /** The terminal was resized in this turn of the event loop. */
  let resizedThisTurn = false;
  const onResize = () => {
    resizedThisTurn = true;
    setTimeout(() => {
      resizedThisTurn = false;
    }, 0);
  };
  const usage = createUsageTab(api, () => scroll);
  const plugin = createPluginTab(api, settings, copyWithToast);
  /** The installed plugin's version from its package.json, like "v5.0.2", after the title. */
  const [version, setVersion] = createSignal("");
  void getPackageVersion().then(found => {
    if (found) setVersion(`v${found}`);
  });
  function barTabOf(shown) {
    return BAR_TABS.find(item => shown !== undefined && item.pages.includes(shown));
  }

  /** The page a tab of the tab bar opens on: the one it showed last, else its first. */
  function pageOf(item) {
    return lastPages.get(item.title) ?? item.pages[0];
  }

  /**
   * Each tab asks the server again when it shows: Limits a refresh, the others their data. Usage
   * shows `choice`: the default range, unless a command named one.
   */
  function showTab(next, choice = {
    range: DEFAULT_USAGE_RANGE
  }) {
    const item = barTabOf(next);
    if (item) lastPages.set(item.title, next);
    settings.setTab(next);
    setTab(next);
    // A Settings line may have had the keyboard; it is gone with its tab.
    windowBox?.focus();
    const sessionID = routeSessionID(api);
    if (next === "limits") void host.quota.refresh("manual", sessionID);
    if (next === "system") plugin.show(sessionID);
    if (next === "usage") usage.choose(choice);
    if (next === "usage" && sessionID) usage.show(sessionID);
    scroll?.scrollTo(0);
  }

  /** Copies `text` and says in a toast titled `title` whether the terminal let it. */
  function copyWithToast(...[text, title, messages]) {
    const copied = api.renderer.copyToClipboardOSC52(text);
    api.ui.toast.show({
      variant: copied ? "success" : "warning",
      title,
      message: copied ? messages.copied : messages.failed,
      duration: 4_000
    });
  }

  /** c on Limits: every provider's limits as Web and Desktop /quota write them. */
  function copyLimits(sessionID) {
    const snapshot = host.quota.snapshot(sessionID);
    if (!snapshot) {
      api.ui.toast.show({
        variant: "info",
        title: "Limits",
        message: "Quota is still loading.",
        duration: 4_000
      });
      return;
    }
    const words = host.display().words;
    copyWithToast(quotaLimitsText({
      ...snapshot,
      words
    }, Date.now()), "Limits", {
      copied: "Copied the limits report",
      failed: "This terminal doesn't allow copying."
    });
  }

  /** Opens the window on `next`; on Usage, on `choice` (else the default range). */
  function open(next, choice) {
    if (!routeSessionID(api)) {
      api.ui.toast.show({
        variant: "info",
        title: "OpenCode Quota",
        message: "Open a session first: the quota window opens above its message box."
      });
      return;
    }
    if (tab() === undefined) focusBefore = api.renderer.currentFocusedRenderable;
    showTab(next === "settings" ? pageOf(BAR_TABS[TABS.length]) : next, choice);
    // The command leaves the message box focused; take the keyboard once it has settled.
    setTimeout(() => windowBox?.focus(), 50);
  }

  /** Esc or Close. With unsaved settings the bottom bar asks first. */
  function close() {
    if (settings.askBeforeClose()) return;
    settings.setTab(undefined);
    setTab(undefined);
    keyboardWanted = false;
    if (focusBefore && !focusBefore.isDestroyed) focusBefore.focus();
    focusBefore = null;
  }
  function switchTab(delta) {
    const index = Math.max(0, BAR_TABS.indexOf(barTabOf(tab()) ?? BAR_TABS[0]));
    showTab(pageOf(BAR_TABS[(index + delta + BAR_TABS.length) % BAR_TABS.length]));
  }

  /**
   * The lines the window's own ↑↓, space, enter and ←/→ use: Plugin's. Usage and the Settings
   * tabs take those keys in their own layer; Limits has no lines.
   */
  const tabLines = () => tab() === "system" ? plugin : undefined;

  /** ↑↓ select the tab's next line; past the first or last one (or without lines) they scroll. */
  function select(delta) {
    if (!tabLines()?.select(delta)) scroll?.scrollBy(delta);
  }
  function Window(props) {
    const theme = () => api.theme;
    const [hasKeyboard, setHasKeyboard] = createSignal(false);
    const [width, setWidth] = createSignal(DEFAULT_WIDTH);
    const [nowMs, setNowMs] = createSignal(Date.now());
    // Reset times and the pace count on between snapshots.
    const clock = setInterval(() => setNowMs(Date.now()), 60_000);
    onCleanup(() => clearInterval(clock));
    const stopWatch = host.quota.watch(props.sessionID);
    onCleanup(stopWatch);

    // The window covers the whole chat, so it has the same size on every tab. OpenCode's
    // session column holds the messages box (its first child holds the messages scrollbox),
    // a one-line "Jump to latest" row, then the box with this slot and the message box. Room =
    // the column minus its 1-line bottom padding, the other rows, and whatever else sits in
    // that last box (the message box, queued prompts).
    const [roomHeight, setRoomHeight] = createSignal();
    function measureRoom() {
      const box = windowBox;
      if (!box || box.isDestroyed) return;
      let child = box;
      for (let parent = box.parent; parent; child = parent, parent = parent.parent) {
        const siblings = parent.getChildren();
        const messages = siblings[0];
        if (messages === child || !messages?.getChildren().some(item => "scrollChildIntoView" in item)) {
          continue;
        }
        const otherRows = siblings.filter(item => item !== child && item !== messages).reduce((total, item) => total + item.height, 0);
        const room = Math.max(12, parent.height - 1 - otherRows - (child.height - box.height));
        if (room !== roomHeight()) queueMicrotask(() => setRoomHeight(room));
        return;
      }
    }
    onMount(() => {
      api.renderer.root.on("layout-changed", measureRoom);
      onCleanup(() => api.renderer.root.off("layout-changed", measureRoom));
    });
    api.renderer.on("resize", onResize);
    onCleanup(() => api.renderer.off("resize", onResize));
    // This window's own boxes: when OpenCode draws the window again, the new one may already
    // have set them before this one is cleaned up.
    let ownBox;
    let ownScroll;
    onCleanup(() => {
      if (windowBox === ownBox) windowBox = undefined;
      if (scroll === ownScroll) scroll = undefined;
    });

    // Keys work only while this box has the keyboard; the message box keeps its own keys.
    api.keymap.layer(() => ({
      target: () => windowBox,
      priority: KEY_LAYERS.window,
      // While a Settings line takes typed text, the keys go to its input.
      enabled: () => !settings.typing(),
      commands: [{
        bind: "up",
        title: "Previous line",
        group: KEYS,
        run: () => select(-1)
      }, {
        bind: "down",
        title: "Next line",
        group: KEYS,
        run: () => select(1)
      }, {
        bind: "pageup",
        title: "Scroll up one page",
        group: KEYS,
        run: () => scroll?.scrollBy(-(scroll.height || 1))
      }, {
        bind: "pagedown",
        title: "Scroll down one page",
        group: KEYS,
        run: () => scroll?.scrollBy(scroll.height || 1)
      }, {
        bind: "space",
        title: "Use the line",
        group: KEYS,
        run: () => tabLines()?.activate()
      }, {
        bind: "return",
        title: "Use the line",
        group: KEYS,
        run: () => tabLines()?.activate()
      }, {
        bind: "left",
        title: "Change the line",
        group: KEYS,
        run: () => tabLines()?.step(-1)
      }, {
        bind: "right",
        title: "Change the line",
        group: KEYS,
        run: () => tabLines()?.step(1)
      }, {
        bind: "c",
        title: "Copy the limits report",
        group: KEYS,
        run: () => tab() === "limits" ? copyLimits(props.sessionID) : false
      }, {
        bind: "tab",
        title: "Next tab",
        group: KEYS,
        run: () => switchTab(1)
      }, {
        bind: "shift+tab",
        title: "Previous tab",
        group: KEYS,
        run: () => switchTab(-1)
      }, {
        bind: "escape",
        title: "Close",
        group: KEYS,
        run: close
      }]
    }));
    const settingsTab = () => {
      const shown = tab();
      return isSettingsTab(shown) ? shown : undefined;
    };
    const viewHint = () => windowHint(tab(), host.display().layout.evenUse);
    const hint = () => settings.hint(tab() ?? "", hasKeyboard()) ?? (hasKeyboard() ? viewHint() : "The keyboard is somewhere else (the message box, a dialog). Click this box to use ↑↓ space tab esc here.");
    /**
     * Usage's own key hints while the tab or one of its dates has the keyboard, unless the
     * bottom bar asks about unsaved settings.
     */
    const usageHints = () => {
      if (tab() !== "usage") return undefined;
      if (usage.typingDate()) return usage.hints();
      if (!hasKeyboard() || settings.hint(tab() ?? "", true) !== undefined) return undefined;
      return usage.hints();
    };
    /** Usage's key hints: each key bold in the text color, its label muted, two spaces apart. */
    const KeyHints = hintProps => (() => {
      var _el$ = _$createElement("box");
      _$setProp(_el$, "flexDirection", "column");
      _$setProp(_el$, "flexShrink", 0);
      _$insert(_el$, () => keyHintLines(hintProps.hints, width()).map(line => (() => {
        var _el$2 = _$createElement("text");
        _$setProp(_el$2, "wrapMode", "none");
        _$setProp(_el$2, "selectable", false);
        _$insert(_el$2, () => line.flatMap((item, index) => [...(index > 0 ? [(() => {
          var _el$3 = _$createElement("span");
          _$insertNode(_el$3, _$createTextNode(`  `));
          _$effect(_$p => _$setProp(_el$3, "style", {
            fg: theme().text.muted
          }, _$p));
          return _el$3;
        })()] : []), ...(item.key ? [(() => {
          var _el$5 = _$createElement("b");
          _$insert(_el$5, () => item.key);
          _$effect(_$p => _$setProp(_el$5, "style", {
            fg: theme().text.base
          }, _$p));
          return _el$5;
        })()] : []), (() => {
          var _el$6 = _$createElement("span");
          _$insert(_el$6, (() => {
            var _c$ = _$memo(() => !!item.key);
            return () => _c$() ? ` ${item.label}` : item.label;
          })());
          _$effect(_$p => _$setProp(_el$6, "style", {
            fg: theme().text.muted
          }, _$p));
          return _el$6;
        })()]));
        return _el$2;
      })()));
      return _el$;
    })();
    const titleText = () => version() ? `${WINDOW_TITLE} ${version()}` : WINDOW_TITLE;
    /** The drawn tab bodies' width: the scrollbar's column and a gap before it stay free. */
    const bodyWidth = () => width() - 2;
    const strip = () => tabStrip(BAR_TABS.map(item => item.title), TABS.length, Math.max(0, BAR_TABS.indexOf(barTabOf(tab()) ?? BAR_TABS[0])), width() - columnsOf(titleText()) - TAB_GAP - CLOSE_WIDTH);
    const label = text => (() => {
      var _el$7 = _$createElement("text"),
        _el$8 = _$createElement("b");
      _$insertNode(_el$7, _el$8);
      _$setProp(_el$7, "wrapMode", "none");
      _$setProp(_el$7, "selectable", false);
      _$insert(_el$8, text);
      _$effect(_$p => _$setProp(_el$7, "fg", theme().text.base, _$p));
      return _el$7;
    })();
    const arrow = (text, delta) => (() => {
      var _el$9 = _$createElement("text");
      _$setProp(_el$9, "wrapMode", "none");
      _$setProp(_el$9, "selectable", false);
      _$insert(_el$9, text);
      _$effect(_p$ => {
        var _v$ = theme().text.action.primary.selected,
          _v$2 = settings.click(() => switchTab(delta));
        _v$ !== _p$.e && (_p$.e = _$setProp(_el$9, "fg", _v$, _p$.e));
        _v$2 !== _p$.t && (_p$.t = _$setProp(_el$9, "onMouseUp", _v$2, _p$.t));
        return _p$;
      }, {
        e: undefined,
        t: undefined
      });
      return _el$9;
    })();
    /** The tab bar after the title: the shown tabs, with "Settings" or │ before the Settings tabs. */
    const stripItems = () => {
      const {
        first,
        last,
        settingsLabel
      } = strip();
      const items = [];
      for (let index = first; index <= last; index += 1) {
        const item = BAR_TABS[index];
        if (index === TABS.length && index > first) {
          items.push(settingsLabel ? label(SETTINGS_LABEL) : (() => {
            var _el$0 = _$createElement("text");
            _$insertNode(_el$0, _$createTextNode(`│`));
            _$setProp(_el$0, "wrapMode", "none");
            _$setProp(_el$0, "selectable", false);
            _$effect(_$p => _$setProp(_el$0, "fg", theme().text.muted, _$p));
            return _el$0;
          })());
        }
        items.push(_$createComponent(Choice, {
          get label() {
            return item.title;
          },
          get active() {
            return barTabOf(tab()) === item;
          },
          get theme() {
            return theme();
          },
          get run() {
            return settings.click(() => showTab(pageOf(item)));
          }
        }));
      }
      return items;
    };
    return (() => {
      var _el$10 = _$createElement("box"),
        _el$11 = _$createElement("box"),
        _el$12 = _$createElement("box"),
        _el$13 = _$createElement("text"),
        _el$14 = _$createElement("b"),
        _el$16 = _$createElement("span"),
        _el$17 = _$createElement("text"),
        _el$19 = _$createElement("box"),
        _el$20 = _$createElement("box"),
        _el$21 = _$createElement("scrollbox"),
        _el$22 = _$createElement("box"),
        _el$23 = _$createElement("box");
      _$insertNode(_el$10, _el$11);
      _$insertNode(_el$10, _el$19);
      _$insertNode(_el$10, _el$22);
      _$use(element => {
        windowBox = element;
        ownBox = element;
        element.on("focused", () => {
          keyboardWanted = true;
          setHasKeyboard(true);
        });
        element.on("blurred", () => {
          setHasKeyboard(false);
          // Decided once the event that took the keyboard is over: a resize took it (take it
          // back), or a click elsewhere or a dialog did (leave it). A box drawn again loses it
          // to its replacement, which takes it back.
          queueMicrotask(() => {
            if (windowBox !== element || element.isDestroyed) return;
            if (resizedThisTurn && keyboardWanted) element.focus();else keyboardWanted = false;
          });
        });
        // Drawn again while it had the keyboard: take it back once the new box is in place.
        if (keyboardWanted) {
          setTimeout(() => {
            if (keyboardWanted && windowBox === element) element.focus();
          }, 0);
        }
      }, _el$10);
      _$setProp(_el$10, "focusable", true);
      _$setProp(_el$10, "border", true);
      _$setProp(_el$10, "borderStyle", "rounded");
      _$setProp(_el$10, "paddingLeft", 1);
      _$setProp(_el$10, "paddingRight", 1);
      _$setProp(_el$10, "onMouseDown", () => {
        settings.pressed();
        if (!settings.typing()) windowBox?.focus();
      });
      _$setProp(_el$10, "onSizeChange", function () {
        // Inside the border and the padding.
        const measured = this.width - 4;
        if (measured > 0 && measured !== width()) queueMicrotask(() => setWidth(measured));
      });
      _$insertNode(_el$11, _el$12);
      _$insertNode(_el$11, _el$17);
      _$setProp(_el$11, "flexDirection", "row");
      _$setProp(_el$11, "flexShrink", 0);
      _$insertNode(_el$12, _el$13);
      _$setProp(_el$12, "flexDirection", "row");
      _$setProp(_el$12, "columnGap", 2);
      _$setProp(_el$12, "flexGrow", 1);
      _$insertNode(_el$13, _el$14);
      _$insertNode(_el$13, _el$16);
      _$setProp(_el$13, "wrapMode", "none");
      _$setProp(_el$13, "selectable", false);
      _$insertNode(_el$14, _$createTextNode(`OpenCode Quota`));
      _$insert(_el$16, (() => {
        var _c$2 = _$memo(() => !!version());
        return () => _c$2() ? ` ${version()}` : "";
      })());
      _$insert(_el$12, _$createComponent(Show, {
        get when() {
          return strip().first > 0;
        },
        get children() {
          return arrow("‹", -1);
        }
      }), null);
      _$insert(_el$12, stripItems, null);
      _$insert(_el$12, _$createComponent(Show, {
        get when() {
          return strip().last < BAR_TABS.length - 1;
        },
        get children() {
          return arrow("›", 1);
        }
      }), null);
      _$insertNode(_el$17, _$createTextNode(`esc`));
      _$setProp(_el$17, "selectable", false);
      _$insertNode(_el$19, _el$20);
      _$setProp(_el$19, "flexDirection", "row");
      _$setProp(_el$19, "flexGrow", 1);
      _$setProp(_el$19, "flexBasis", 0);
      _$setProp(_el$19, "minHeight", 0);
      _$setProp(_el$19, "marginTop", 1);
      _$insert(_el$19, _$createComponent(Show, {
        get when() {
          return tab() === "usage";
        },
        get children() {
          return _$createComponent(usage.Rail, {});
        }
      }), _el$20);
      _$insert(_el$19, _$createComponent(Show, {
        get when() {
          return settingsTab();
        },
        children: shown => _$createComponent(settings.Pages, {
          get tab() {
            return shown();
          },
          showPage: showTab
        })
      }), _el$20);
      _$insertNode(_el$20, _el$21);
      _$setProp(_el$20, "flexDirection", "column");
      _$setProp(_el$20, "flexGrow", 1);
      _$setProp(_el$20, "overflow", "hidden");
      _$insert(_el$20, _$createComponent(Show, {
        get when() {
          return settingsTab();
        },
        children: shown => _$createComponent(settings.Header, {
          get tab() {
            return shown();
          },
          refocus: () => windowBox?.focus()
        })
      }), _el$21);
      _$use(element => {
        scroll = element;
        ownScroll = element;
      }, _el$21);
      _$setProp(_el$21, "flexGrow", 1);
      _$setProp(_el$21, "flexBasis", 0);
      _$setProp(_el$21, "minHeight", 0);
      _$insert(_el$21, _$createComponent(Show, {
        get when() {
          return tab() === "system";
        },
        get children() {
          return _$createComponent(plugin.View, {
            get width() {
              return bodyWidth();
            }
          });
        }
      }), null);
      _$insert(_el$21, _$createComponent(Show, {
        get when() {
          return tab() === "limits";
        },
        get children() {
          return _$createComponent(LimitsView, {
            host: host,
            get sessionID() {
              return props.sessionID;
            },
            get nowMs() {
              return nowMs();
            },
            get width() {
              return bodyWidth();
            }
          });
        }
      }), null);
      _$insert(_el$21, _$createComponent(Show, {
        get when() {
          return tab() === "usage";
        },
        get children() {
          return _$createComponent(usage.View, {
            get width() {
              return bodyWidth() - USAGE_RAIL_WIDTH;
            },
            keyTarget: () => windowBox
          });
        }
      }), null);
      _$insert(_el$21, _$createComponent(Show, {
        get when() {
          return settingsTab();
        },
        children: shown => _$createComponent(settings.Body, {
          get tab() {
            return shown();
          },
          showPage: showTab,
          host: host,
          get sessionID() {
            return props.sessionID;
          },
          box: () => windowBox,
          scroll: () => scroll,
          get width() {
            return bodyWidth() - pagesRoom(shown());
          },
          get nowMs() {
            return nowMs();
          }
        })
      }), null);
      _$insertNode(_el$22, _el$23);
      _$setProp(_el$22, "flexDirection", "column");
      _$setProp(_el$22, "marginTop", 1);
      _$setProp(_el$22, "flexShrink", 0);
      _$setProp(_el$23, "flexDirection", "row");
      _$setProp(_el$23, "gap", 2);
      _$insert(_el$23, _$createComponent(settings.Buttons, {
        get tab() {
          return tab() ?? "";
        },
        host: host,
        get sessionID() {
          return props.sessionID;
        },
        box: () => windowBox,
        close: close
      }));
      _$insert(_el$22, _$createComponent(Show, {
        get when() {
          return usageHints();
        },
        get fallback() {
          return (() => {
            var _el$24 = _$createElement("text");
            _$setProp(_el$24, "wrapMode", "word");
            _$setProp(_el$24, "selectable", false);
            _$insert(_el$24, () => hintLines(hint(), width()));
            _$effect(_$p => _$setProp(_el$24, "fg", theme().text.muted, _$p));
            return _el$24;
          })();
        },
        children: hints => _$createComponent(KeyHints, {
          get hints() {
            return hints();
          }
        })
      }), null);
      _$effect(_p$ => {
        var _v$3 = roomHeight(),
          _v$4 = hasKeyboard() ? theme().text.action.primary.selected : theme().border.base,
          _v$5 = theme().text.base,
          _v$6 = {
            fg: theme().text.muted
          },
          _v$7 = theme().text.muted,
          _v$8 = settings.click(close);
        _v$3 !== _p$.e && (_p$.e = _$setProp(_el$10, "height", _v$3, _p$.e));
        _v$4 !== _p$.t && (_p$.t = _$setProp(_el$10, "borderColor", _v$4, _p$.t));
        _v$5 !== _p$.a && (_p$.a = _$setProp(_el$13, "fg", _v$5, _p$.a));
        _v$6 !== _p$.o && (_p$.o = _$setProp(_el$16, "style", _v$6, _p$.o));
        _v$7 !== _p$.i && (_p$.i = _$setProp(_el$17, "fg", _v$7, _p$.i));
        _v$8 !== _p$.n && (_p$.n = _$setProp(_el$17, "onMouseUp", _v$8, _p$.n));
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined,
        o: undefined,
        i: undefined,
        n: undefined
      });
      return _el$10;
    })();
  }
  return {
    open,
    openUsage: choice => open("usage", choice),
    Slot: props => _$createComponent(Show, {
      get when() {
        return tab() !== undefined;
      },
      get children() {
        return _$createComponent(Window, {
          get sessionID() {
            return props.sessionID;
          }
        });
      }
    })
  };
}
