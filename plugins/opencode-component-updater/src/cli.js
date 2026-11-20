import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { Plugin } from "@opencode/plugin/tui";
import { createTuiPlugin } from "./tui.js";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export default Plugin.define({
  id: "opencode-component-updater.cli",
  setup: createTuiPlugin({ pluginRoot }),
});
