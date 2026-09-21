import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkCheatEngine, checkNpmRelease, replaceMirror, statusFor, writeCheckResult, writeManifest } from "../src/adapter/actions.js";
import { installedPackageVersion, requirementCommit, requirementPin, treeFingerprint } from "../src/adapter/inspect.js";
import { compareSemver, resolveNpmRelease } from "../src/adapter/resolve.js";
import { AdapterError, isCommit, isIntegrity, verifyIntegrity } from "../src/adapter/util.js";

const COMMIT = "af67df96af442bee7278cbdc9034966c883d6bab";

async function scratch(t) {
  const root = await mkdtemp(join(tmpdir(), "component-adapter-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("rejects values that are not exact commits", () => {
  assert.equal(isCommit(COMMIT), true);
  assert.equal(isCommit("main"), false);
  assert.equal(isCommit(COMMIT.slice(0, 12)), false);
});

test("verifies artifact integrity and rejects a mismatch", async () => {
  const { createHash } = await import("node:crypto");
  const payload = Buffer.from("release-artifact");
  const good = `sha512-${createHash("sha512").update(payload).digest("base64")}`;
  assert.equal(isIntegrity(good), true);
  verifyIntegrity(payload, good);
  assert.throws(() => verifyIntegrity(Buffer.from("tampered"), good), AdapterError);
});

test("npm release identity is the published version, commit is provenance only", async () => {
  const metadata = {
    "dist-tags": { latest: "0.9.28" },
    versions: {
      "0.9.28": {
        gitHead: "08f742c13b1813f04ef9ddf38a55b881c5e35792",
        dist: {
          tarball: "https://registry.npmjs.org/@agentmemory/agentmemory/-/agentmemory-0.9.28.tgz",
          integrity: "sha512-DOiqZR7GKBedUCLAV2xW0rzaU2GUztvxLxesLNcjdzF1sFPxhMk8nrnKd79X9J9cOt2qvQIhGSJ/BcegnVo0Hw==",
        },
      },
    },
  };
  const release = await resolveNpmRelease("@agentmemory/agentmemory", { fetchImpl: async () => metadata });
  assert.equal(release.version, "0.9.28");
  assert.equal(release.artifact.integrity, metadata.versions["0.9.28"].dist.integrity);
  assert.equal(release.sourceCommit, "08f742c13b1813f04ef9ddf38a55b881c5e35792");
});

test("npm release without a usable integrity digest fails closed", async () => {
  const metadata = { "dist-tags": { latest: "1.0.0" }, versions: { "1.0.0": { dist: { tarball: "https://example.com/a.tgz" } } } };
  await assert.rejects(() => resolveNpmRelease("example", { fetchImpl: async () => metadata }), AdapterError);
});

test("reads installed npm version from a dependency manifest", async (t) => {
  const root = await scratch(t);
  await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { "@dietrichgebert/ponytail": "4.8.4" } }));
  assert.equal(await installedPackageVersion(join(root, "package.json"), "@dietrichgebert/ponytail"), "4.8.4");
});

test("reads exact pins from requirements.in", async (t) => {
  const root = await scratch(t);
  await writeFile(join(root, "requirements.in"), [
    "codesdevs-log-analyzer==0.5.0",
    `disk-forensics-mcp-server @ git+https://example.invalid/x.git@${COMMIT}`,
  ].join("\n"));
  assert.equal(await requirementPin(join(root, "requirements.in"), "codesdevs-log-analyzer"), "0.5.0");
  assert.equal(await requirementCommit(join(root, "requirements.in"), "disk-forensics-mcp-server"), COMMIT);
});

test("tree fingerprint detects content drift", async (t) => {
  const root = await scratch(t);
  const left = join(root, "left");
  const right = join(root, "right");
  for (const directory of [left, right]) {
    await mkdir(join(directory, "nested"), { recursive: true });
    await writeFile(join(directory, "nested", "a.py"), "print(1)\n");
  }
  assert.equal((await treeFingerprint(left)).digest, (await treeFingerprint(right)).digest);
  await writeFile(join(right, "nested", "a.py"), "print(2)\n");
  assert.notEqual((await treeFingerprint(left)).digest, (await treeFingerprint(right)).digest);
});

test("mirror replacement copies the source and removes the temporary backup", async (t) => {
  const root = await scratch(t);
  const source = join(root, "stage", "source", "MCP_Server");
  const mirror = join(root, "CheatEngine", "MCP_Server");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "mcp_cheatengine.py"), "new\n");
  await mkdir(mirror, { recursive: true });
  await writeFile(join(mirror, "mcp_cheatengine.py"), "old\n");

  await replaceMirror({ sourceDir: source, mirror, runId: "test" });

  assert.equal(await readFile(join(mirror, "mcp_cheatengine.py"), "utf8"), "new\n");
  const parent = await import("node:fs/promises").then((fs) => fs.readdir(join(root, "CheatEngine")));
  assert.deepEqual(parent, ["MCP_Server"]);
});

test("mirror replacement refuses to publish a tree containing .git", async (t) => {
  const root = await scratch(t);
  const source = join(root, "source", "MCP_Server");
  const mirror = join(root, "CheatEngine", "MCP_Server");
  await mkdir(join(source, ".git"), { recursive: true });
  await writeFile(join(source, ".git", "HEAD"), "ref: refs/heads/main\n");
  await mkdir(mirror, { recursive: true });
  await writeFile(join(mirror, "keep.py"), "keep\n");

  await assert.rejects(() => replaceMirror({ sourceDir: source, mirror, runId: "test" }), AdapterError);
  assert.equal(await readFile(join(mirror, "keep.py"), "utf8"), "keep\n");
});

test("cheat engine check reports a resync when only the mirror drifted", async (t) => {
  const root = await scratch(t);
  const canonical = join(root, "component", "source", "MCP_Server");
  const mirror = join(root, "CheatEngine", "MCP_Server");
  await mkdir(canonical, { recursive: true });
  await mkdir(mirror, { recursive: true });
  await writeFile(join(canonical, "server.py"), "canonical\n");
  await writeFile(join(mirror, "server.py"), "stale\n");

  const { execFile } = await import("node:child_process");
  const exec = (args, cwd) => new Promise((resolvePromise, reject) => {
    execFile("git", args, { cwd }, (error, stdout) => (error ? reject(error) : resolvePromise(stdout)));
  });
  const source = join(root, "component", "source");
  await exec(["init", "--quiet", "--initial-branch=main", "."], source);
  await exec(["config", "user.email", "test@example.invalid"], source);
  await exec(["config", "user.name", "test"], source);
  await exec(["add", "."], source);
  await exec(["commit", "--quiet", "-m", "canonical"], source);
  const head = (await exec(["rev-parse", "HEAD"], source)).trim();

  const result = await checkCheatEngine({
    target: join(root, "component"),
    remote: source,
    mirror,
  });
  assert.equal(result.status, "update-available");
  assert.equal(result.current, head);
  assert.equal(result.latest, head);
  assert.match(result.summary, /mirror resync/);
});

test("manifest binds staged paths to the plan digest", async (t) => {
  const root = await scratch(t);
  const manifestPath = join(root, "manifest.json");
  await writeManifest({ manifestPath, planSha256: "sha256:abc", paths: ["source"] });
  assert.deepEqual(JSON.parse(await readFile(manifestPath, "utf8")), {
    schemaVersion: 2,
    planSha256: "sha256:abc",
    paths: ["source"],
  });
  await assert.rejects(() => writeManifest({ manifestPath, planSha256: "sha256:abc", paths: [] }), AdapterError);
});

test("check result is written in the schema the updater reads", async (t) => {
  const root = await scratch(t);
  const path = join(root, "result.json");
  await writeCheckResult(path, { status: "current", summary: "1.0.0", current: "1.0.0", latest: "1.0.0" });
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
    schemaVersion: 1,
    status: "current",
    summary: "1.0.0",
    current: "1.0.0",
    latest: "1.0.0",
  });
});

test("status and semver helpers behave", () => {
  assert.equal(statusFor("1.0.0", "1.0.0"), "current");
  assert.equal(statusFor("1.0.0", "1.0.1"), "update-available");
  assert.ok(compareSemver("0.1.29", "0.1.24") > 0);
  assert.ok(compareSemver("v0.1.5", "v0.1.10") < 0);
});

test("npm check fails closed when the manifest has no exact version", async (t) => {
  const root = await scratch(t);
  await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { example: "*" } }));
  await assert.rejects(() => checkNpmRelease({ target: root, packageName: "example" }), AdapterError);
});
