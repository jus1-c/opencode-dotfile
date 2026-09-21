import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { createTuiPlugin } from "./src/tui.js";

const pluginRoot = dirname(fileURLToPath(import.meta.url));

export default {
  id: "opencode-component-updater",
  tui: createTuiPlugin({ pluginRoot }),
};
