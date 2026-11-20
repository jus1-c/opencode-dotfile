import { memo as _$memo } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
/** @jsxImportSource @opentui/solid */
/**
 * The quota window's Plugin tab: the maintainer notices, the switches for other tools (each
 * saves straight away), and the status report with Copy, each under its own title. Each show
 * asks the server again; an answer that arrives after a newer question is dropped.
 */

import { createSignal } from "solid-js";
import { sanitizeDisplayText } from "../../lib/display-sanitize.js";
import { QuotaRpc } from "../../rpc.js";
import { errorToast, quotaCallOptions, rpcErrorMessage } from "../client.js";
import { activateLine, stepLine, stepSelection } from "./option-line.js";
import { OptionRow } from "./settings.js";
import { NoticesView, StatusView } from "./views.js";
/** Plugin's switches (`system`), under their group's title; each saves straight away. */
const SYSTEM_SWITCHES = [{
  key: "system.oldCommands",
  group: "Commands",
  title: "Old command names",
  note: "the 4.x and 5.x /tokens_* names; the / list changes after a restart"
}, {
  key: "system.exportFile",
  group: "For other tools",
  title: "Quota file (JSON)",
  note: "for status bars and scripts; the opencode-quota CLI works either way"
}, {
  key: "system.telemetry",
  group: "For other tools",
  title: "OpenTelemetry metrics"
}];

/** Copies `text` and says in a toast titled `title` whether the terminal let it. */

export function createPluginTab(api, settings, copy) {
  const [selected, setSelected] = createSignal("");
  const [notices, setNotices] = createSignal({
    state: "loading"
  });
  const [status, setStatus] = createSignal({
    state: "loading"
  });
  /** Numbers the notice and status requests; only the newest one's answer shows. */
  let noticeRequest = 0;
  let statusRequest = 0;
  /** Plugin switches whose save is not back yet; another flip of the same one is ignored. */
  const savingSwitches = new Set();
  // The RPC client is made per call, so nothing reaches OpenCode during plugin setup.
  const rpc = () => api.client.rpc(QuotaRpc);
  const options = () => quotaCallOptions(api);
  async function loadNotices() {
    const request = ++noticeRequest;
    setNotices({
      state: "loading"
    });
    try {
      const board = await rpc().noticeList({}, options());
      if (request === noticeRequest) setNotices({
        state: "ready",
        board
      });
    } catch (error) {
      if (request !== noticeRequest) return;
      setNotices({
        state: "failed",
        message: sanitizeDisplayText(rpcErrorMessage(error))
      });
    }
  }
  async function loadStatus(sessionID) {
    const request = ++statusRequest;
    setStatus({
      state: "loading"
    });
    try {
      const output = await rpc().status(sessionID ? {
        sessionID
      } : {}, options());
      if (request === statusRequest) setStatus({
        state: "ready",
        text: output.text
      });
    } catch (error) {
      if (request !== statusRequest) return;
      setStatus({
        state: "failed",
        message: sanitizeDisplayText(rpcErrorMessage(error))
      });
    }
  }
  async function flipSwitch(key, on) {
    if (savingSwitches.has(key)) return;
    savingSwitches.add(key);
    try {
      await settings.saveSwitch(key, on);
    } catch (error) {
      api.ui.toast.show(errorToast(error));
    } finally {
      savingSwitches.delete(key);
    }
  }
  function copyReport() {
    const report = status();
    if (report.state !== "ready") return;
    copy(report.text, "Status report", {
      copied: "Copied. Paste it into a GitHub issue.",
      failed: "This terminal doesn't allow copying; select the text instead."
    });
  }

  /**
   * The lines that ↑↓ can select, under the notices: the switches (‹ on ›) once the saved
   * settings arrived, then Copy (▸) above the status report.
   */
  function lines() {
    const copyLine = {
      id: "copy",
      group: "Status report",
      title: "Copy the report",
      value: () => "copy",
      run: copyReport,
      note: () => "then paste it into a GitHub issue"
    };
    const switches = SYSTEM_SWITCHES.flatMap(({
      key,
      group,
      title,
      note
    }, index) => {
      const on = settings.savedSwitch(key);
      if (on === undefined) return [];
      return [{
        id: key,
        ...(group !== SYSTEM_SWITCHES[index - 1]?.group ? {
          group
        } : {}),
        title,
        value: () => on ? "on" : "off",
        cycle: () => void flipSwitch(key, !on),
        ...(note ? {
          note: () => note
        } : {})
      }];
    });
    return [...switches, copyLine];
  }
  const selectedLine = () => lines().find(line => line.id === selected());
  return {
    /**
     * The tab shows: the notices and the status report are asked again, and the saved settings
     * read, so the switches show even if a snapshot is late. Copy is selected, so enter copies.
     */
    show(sessionID) {
      void loadNotices();
      void loadStatus(sessionID);
      settings.loadSaved().catch(() => {});
      setSelected("copy");
    },
    /** ↑↓: the next line; false past the first or last one, where the window scrolls. */
    select(delta) {
      const ids = lines().map(line => line.id);
      const next = stepSelection(ids.length, ids.indexOf(selected()), delta);
      if (next === undefined) return false;
      setSelected(ids[next]);
      return true;
    },
    /** Space or enter. */
    activate() {
      const line = selectedLine();
      if (line) activateLine(line);
    },
    /** ←/→. */
    step(delta) {
      const line = selectedLine();
      if (line) stepLine(line, delta);
    },
    View(props) {
      return [_$createComponent(NoticesView, {
        get theme() {
          return api.theme;
        },
        get report() {
          return notices();
        }
      }), _$memo(() => lines().map(line => _$createComponent(OptionRow, {
        line: line,
        get theme() {
          return api.theme;
        },
        get active() {
          return selected() === line.id;
        },
        get click() {
          return settings.click;
        },
        press: () => setSelected(line.id),
        use: () => activateLine(line),
        get valueWidth() {
          return line.cycle ? 3 : 9;
        },
        get width() {
          return props.width;
        }
      }))), _$createComponent(StatusView, {
        get theme() {
          return api.theme;
        },
        get report() {
          return status();
        },
        get width() {
          return props.width;
        }
      })];
    }
  };
}
