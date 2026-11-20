import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
/** @jsxImportSource @opentui/solid */
/**
 * A list down the left of the quota window's tab body: Usage's ranges and Layout's pages. The
 * chosen item has "›" before it and is bold, on the raised background across the list; a muted
 * line runs down the list's right side. The "›" starts in the window title's column and the
 * labels 2 columns in. Both lists have one width, the longest label of either and a space, so
 * the line and the body stay put between Usage and Layout. A click picks an item. On a short
 * window the list ends at the window's bottom line instead of drawing over it.
 */
import { RGBA, TextAttributes } from "@opentui/core";
const TRANSPARENT = RGBA.fromInts(0, 0, 0, 0);
/** Each label starts this far in; the chosen one has "› " there. */
const RAIL_INDENT = 2;
/** The longest label of either list: Usage's "This session". */
export const RAIL_LABEL_WIDTH = 12;
/** The list's width: a label's indent, the longest label and a space before the line. */
const RAIL_WIDTH = RAIL_INDENT + RAIL_LABEL_WIDTH + 1;
/** The muted line at the list's right. */
const LINE_WIDTH = 1;
/** What the list takes left of the content: the list, the line after it and `gap` columns. */
export function railRoom(gap) {
  return RAIL_WIDTH + LINE_WIDTH + gap;
}
export function Rail(props) {
  return (() => {
    var _el$ = _$createElement("box");
    _$setProp(_el$, "flexDirection", "column");
    _$setProp(_el$, "flexShrink", 0);
    _$setProp(_el$, "width", 16);
    _$setProp(_el$, "overflow", "hidden");
    _$setProp(_el$, "border", ["right"]);
    _$setProp(_el$, "borderStyle", "single");
    _$insert(_el$, () => props.items.map(item => {
      const chosen = item.key === props.chosen;
      const marker = chosen ? "› " : " ".repeat(RAIL_INDENT);
      return (() => {
        var _el$2 = _$createElement("text");
        _$setProp(_el$2, "wrapMode", "none");
        _$setProp(_el$2, "flexShrink", 0);
        _$setProp(_el$2, "selectable", false);
        _$setProp(_el$2, "onMouseUp", () => props.pick(item.key));
        _$insert(_el$2, () => `${marker}${item.label}`.padEnd(RAIL_WIDTH));
        _$effect(_p$ => {
          var _v$3 = item.id,
            _v$4 = chosen ? props.theme.text.action.primary.selected : props.theme.text.muted,
            _v$5 = chosen ? props.theme.background.raised.high : TRANSPARENT,
            _v$6 = chosen ? TextAttributes.BOLD : TextAttributes.NONE;
          _v$3 !== _p$.e && (_p$.e = _$setProp(_el$2, "id", _v$3, _p$.e));
          _v$4 !== _p$.t && (_p$.t = _$setProp(_el$2, "fg", _v$4, _p$.t));
          _v$5 !== _p$.a && (_p$.a = _$setProp(_el$2, "bg", _v$5, _p$.a));
          _v$6 !== _p$.o && (_p$.o = _$setProp(_el$2, "attributes", _v$6, _p$.o));
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined,
          o: undefined
        });
        return _el$2;
      })();
    }));
    _$effect(_p$ => {
      var _v$ = props.gap,
        _v$2 = props.theme.text.muted;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$, "marginRight", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$, "borderColor", _v$2, _p$.t));
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
}
