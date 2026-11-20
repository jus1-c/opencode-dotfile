// OpenCode V2 entry for opencode-pty, with a local patch.
//
// Two upstream 0.4.0 gaps, both in the V2 path:
//
//   1. `dist/src/v2/index.js` `setup` registers slash commands but never calls
//      `ctx.tool.transform`, so none of the five `pty_*` tools reach the model
//      (upstream issue #86).
//   2. `initManager()` is never called on V2, so the NotificationManager has no
//      client and `notifyOnExit` silently does nothing (the notifier returns
//      early when `client` is null).
//
// The tools themselves are already exported as V1-shaped definitions whose
// `args` is a Zod 4 schema — V2 accepts that directly as a Standard Schema.
//
// Remove this file (and restore the one-line re-export) once upstream fixes
// both issues.
import { Plugin } from "./node_modules/opencode-pty/dist/src/v2/index.js";
import { ptyTools } from "./node_modules/opencode-pty/dist/src/v2/tools.js";
import { initManager } from "./node_modules/opencode-pty/dist/src/plugin/pty/manager.js";

const patched = {
  id: Plugin.id,

  async setup(ctx) {
    const cleanup = await Plugin.setup(ctx);

    // Wire the manager to V2's session API so exit notifications can be sent.
    // The upstream notifier calls `client.session.promptAsync({ path, body })`;
    // V2 exposes `ctx.session.prompt({ sessionID, text })` instead.
    initManager({
      session: {
        get: (input) => ctx.session.get({ sessionID: input.path.id }),
        promptAsync: (input) =>
          ctx.session.prompt({
            sessionID: input.path.id,
            text: (input.body.parts ?? [])
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n"),
            ...(input.body.agent ? { agent: input.body.agent } : {}),
            ...(input.body.model ? { model: input.body.model } : {}),
          }),
      },
    });

    await ctx.tool.transform((editor) => {
      for (const [name, definition] of Object.entries(ptyTools)) {
        editor.add({
          name,
          description: definition.description,
          input: definition.args,
          execute: async (input, context) => ({
            content: await definition.execute(input, context),
          }),
        });
      }
    });

    return cleanup;
  },
};

export default patched;
