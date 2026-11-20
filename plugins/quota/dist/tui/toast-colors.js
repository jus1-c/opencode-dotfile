import { setProp as _$setProp } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
/** @jsxImportSource @opentui/solid */
/**
 * Quota toasts in the sidebar's colors, through a trick OpenCode does not promise to keep.
 * OpenCode's plugin API types a toast's message as a string and draws a string in one color.
 * OpenCode's toast (checked on 2.0.26 to 2.0.28) passes the message on unchanged and puts it
 * inside its <text>, and plugins share OpenCode's @opentui/solid and solid-js, so a message of
 * <span>s draws each span in its own color.
 *
 * Quota sends the spans on every OpenCode version, once the TUI has drawn (the spans are made
 * under its renderer). Any error while making or showing the spans shows the plain message: the
 * same characters.
 *
 * The spans also tell whether their toast is still the one on screen: while it is, they hang
 * under the renderer's root through OpenCode's <text> and the toast's boxes. The plugin API has
 * no way to ask that or to close a toast; the Toast page's preview needs both (`toasts.ts`).
 */

import { catchError, createRoot, runWithOwner } from "solid-js";
import { segmentColor } from "./theme.js";

/** A toast shown with its spans. */

/** What the on-screen check reads of an OpenTUI node: a span, a root text node, a renderable. */

/** More levels than a TUI has: a loop in the parents answers false instead of hanging. */
const MAX_DEPTH = 1000;

/**
 * The children of OpenCode's toast <text>: each segment a <span> in its color, "\n" between
 * lines. A span reads bold from its style's `bold` key; it ignores an `attributes` key there.
 */
export function coloredMessage(lines, theme, display) {
  return lines.flatMap((line, index) => [...(index > 0 ? ["\n"] : []), ...line.segments.map(segment => (() => {
    var _el$ = _$createElement("span");
    _$insert(_el$, () => segment.text);
    _$effect(_$p => _$setProp(_el$, "style", {
      fg: segmentColor(theme, display, segment),
      bold: segment.bold === true
    }, _$p));
    return _el$;
  })())]);
}

/**
 * The spans of `lines`, made under `owner`; undefined when making them failed. Errors go to
 * this function, never to OpenCode's error screen. The root is gone once the spans have their
 * colors: nothing in them changes later.
 */
function spansOf(owner, lines, host) {
  let failed = false;
  const spans = runWithOwner(owner, () => createRoot(dispose => {
    const made = catchError(() => coloredMessage(lines, host.theme(), host.display()), () => {
      failed = true;
    });
    dispose();
    return made;
  }));
  return failed ? undefined : spans;
}

/**
 * Whether `spans`' first span hangs under `root`, with nothing on the way destroyed. When a toast
 * goes, OpenTUI unlinks its box (or, for a new message, the spans) at once and destroys the box
 * a moment later. Destroying a <text> empties its span list but leaves each span's parent, so a
 * parent alone does not tell. Any error answers false.
 */
function spansOnScreen(spans, root) {
  try {
    let node = spans.find(child => child !== null && typeof child === "object");
    for (let depth = 0; node != null && depth < MAX_DEPTH; depth += 1) {
      if (node === root) return true;
      if (node.isDestroyed === true) return false;
      node = node.parent ?? node.textParent;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Shows a toast. A quota toast's `lines` show in their colors once the TUI has drawn (see
 * above); before that, and when that fails, the toast's plain message shows. Returns the toast
 * when it went with its spans, else undefined: a plain message can't tell whether it is on screen.
 */
export function createToastShow(host) {
  return (toast, lines) => {
    if (lines !== undefined) {
      try {
        const owner = host.owner();
        const spans = owner === undefined ? undefined : spansOf(owner, lines, host);
        if (spans !== undefined) {
          // The API types the message as a string; OpenCode's toast draws the spans as they are.
          host.show({
            ...toast,
            message: spans
          });
          return {
            onScreen: () => spansOnScreen(spans, host.root())
          };
        }
      } catch {
        // The plain message below.
      }
    }
    host.show(toast);
    return undefined;
  };
}
