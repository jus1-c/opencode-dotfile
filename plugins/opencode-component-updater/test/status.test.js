import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readStatus } from "../src/status.js";

test("shows persisted updater self-update metadata", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "opencode-component-updater-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configPath = join(root, "config", "components.json");
  const statePath = join(root, "state", "state.json");
  await mkdir(join(root, "config"), { recursive: true });
  await mkdir(join(root, "state"), { recursive: true });
  await writeFile(configPath, JSON.stringify({
    defaults: { checkIntervalHours: 24 },
    components: {
      "plugin.duplicate": { target: "/updater/plugin/src" },
      "plugin.other": { target: "/elsewhere" },
    },
  }));
  await writeFile(statePath, JSON.stringify({
    components: {},
    selfUpdate: {
      lastGood: {
        status: "update-available",
        summary: "aaaaaaa -> bbbbbbb",
        current: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        latest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        source: { type: "git", root: "/updater/plugin" },
      },
    },
  }));

  const snapshot = await readStatus({ paths: { configPath, statePath, pluginRoot: "/updater/plugin" } });
  assert.equal(snapshot.components.length, 2);
  assert.equal(snapshot.components[0].id, "plugin.opencode-component-updater");
  assert.equal(snapshot.components[0].status, "update-available");
  assert.equal(snapshot.components[0].component.target, "/updater/plugin");
  assert.equal(snapshot.components[1].id, "plugin.other");
});
