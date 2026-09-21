import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { formatStatusDetail, readStatus } from "../src/status.js";

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

test("falls back to the last attempt when no check has ever succeeded", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "opencode-component-updater-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configPath = join(root, "config", "components.json");
  const statePath = join(root, "state", "state.json");
  await mkdir(join(root, "config"), { recursive: true });
  await mkdir(join(root, "state"), { recursive: true });
  await writeFile(configPath, JSON.stringify({
    components: { "plugin.failing": { target: "/elsewhere", enabled: true } },
  }));
  await writeFile(statePath, JSON.stringify({
    components: {
      "global:plugin.failing:/elsewhere": {
        lastAttempt: { status: "check-error", summary: "registry unreachable", checkedAt: 1700000000000 },
      },
    },
  }));

  const snapshot = await readStatus({ paths: { configPath, statePath, pluginRoot: "/updater/plugin" } });
  const failing = snapshot.components.find((item) => item.id === "plugin.failing");
  assert.equal(failing.status, "check-error");
  assert.equal(failing.summary, "registry unreachable");
  assert.match(formatStatusDetail(failing), /Last good check: never/);
  assert.match(formatStatusDetail(failing), /Last attempt result: registry unreachable/);
});

test("keeps the last good result visible when a later check fails", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "opencode-component-updater-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configPath = join(root, "config", "components.json");
  const statePath = join(root, "state", "state.json");
  await mkdir(join(root, "config"), { recursive: true });
  await mkdir(join(root, "state"), { recursive: true });
  await writeFile(configPath, JSON.stringify({
    components: { "mcp.example": { target: "/mcp/example", enabled: true } },
  }));
  await writeFile(statePath, JSON.stringify({
    components: {
      "global:mcp.example:/mcp/example": {
        lastGood: { status: "current", summary: "1.2.3", current: "1.2.3", latest: "1.2.3", checkedAt: 1700000000000 },
        lastAttempt: { status: "check-error", summary: "timeout", checkedAt: 1700000900000 },
      },
    },
  }));

  const snapshot = await readStatus({ paths: { configPath, statePath, pluginRoot: "/updater/plugin" } });
  const item = snapshot.components.find((entry) => entry.id === "mcp.example");
  assert.equal(item.status, "current");
  assert.match(formatStatusDetail(item), /Last attempt result: timeout/);
});
