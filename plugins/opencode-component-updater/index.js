import { Plugin } from "@opencode/plugin";

// Server-side entrypoint. All updater behavior lives in the CLI plugin
// (./tui), which owns the terminal keymap and dialogs. This entrypoint exists
// so the package can be listed as a plugin without registering server hooks.
export default Plugin.define({
  id: "opencode-component-updater",
  setup() {},
});
