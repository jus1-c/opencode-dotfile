#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const HEADROOM_BIN = process.env.HEADROOM_BIN || path.join(os.homedir(), ".local", "bin", "headroom");
const PROXY_URL = process.env.HEADROOM_PROXY_URL || "http://127.0.0.1:8787";
const PORT = new URL(PROXY_URL).port || "8787";

const STATE_DIR = path.join(os.homedir(), ".headroom");
const PID_FILE = path.join(STATE_DIR, "proxy.pid");
const LOG_FILE = path.join(STATE_DIR, "proxy.log");
const LOCK_DIR = path.join(STATE_DIR, "startup-locks");
const LOCK_FILE = path.join(LOCK_DIR, "proxy.lock");
const LEASE_DIR = path.join(STATE_DIR, "leases");
const LEASE_FILE = path.join(LEASE_DIR, String(process.pid));
const MEMORY_DB = path.join(STATE_DIR, "memory.db");

const HEALTH_TIMEOUT_MS = 60000;
const POLL_MS = 250;
const DEBUG = process.env.HEADROOM_CTL_DEBUG === "1";

function log(...args) {
  if (DEBUG) process.stderr.write(`[headroom-ctl-mcp] ${args.join(" ")}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function healthy() {
  return new Promise((resolve) => {
    const req = http.get(`${PROXY_URL}/health`, { timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(file) {
  try {
    const pid = Number(fs.readFileSync(file, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function startProxy() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const out = fs.openSync(LOG_FILE, "a");
  const child = spawn(
    HEADROOM_BIN,
    ["proxy", "--port", PORT, "--memory", "--memory-storage=global", "--memory-db-path", MEMORY_DB, "--no-memory-tools"],
    {
      detached: true,
      stdio: ["ignore", out, out],
      env: { ...process.env, HEADROOM_BEACON: "off" },
    },
  );
  child.on("error", (error) => log("proxy spawn error:", error.message));
  child.unref();
  fs.writeFileSync(PID_FILE, `${child.pid}\n`);
  log("spawned proxy pid", child.pid);

  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await healthy()) return true;
    await sleep(POLL_MS);
  }
  log("proxy health timeout");
  return false;
}

async function withStartupLock() {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await healthy()) return null;
    try {
      fs.writeFileSync(LOCK_FILE, `${process.pid}\n`, { flag: "wx" });
      try {
        if (await healthy()) return null;
        return await startProxy();
      } finally {
        try {
          fs.unlinkSync(LOCK_FILE);
        } catch {}
      }
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const owner = readPid(LOCK_FILE);
      if (!owner || !isAlive(owner)) {
        try {
          fs.unlinkSync(LOCK_FILE);
        } catch {}
      } else {
        await sleep(POLL_MS);
      }
    }
  }
  log("startup lock timed out");
  return null;
}

async function ensureProxy() {
  if (await healthy()) return true;
  const started = await withStartupLock();
  if (started !== null) return started;
  return healthy();
}

function pruneLeases() {
  fs.mkdirSync(LEASE_DIR, { recursive: true });
  for (const name of fs.readdirSync(LEASE_DIR)) {
    const pid = Number(name);
    if (!Number.isInteger(pid) || !isAlive(pid)) {
      try {
        fs.unlinkSync(path.join(LEASE_DIR, name));
      } catch {}
    }
  }
}

function registerLease() {
  pruneLeases();
  fs.writeFileSync(LEASE_FILE, `${process.pid}\n`);
}

function releaseLease() {
  try {
    fs.unlinkSync(LEASE_FILE);
  } catch {}
}

function hasActiveLeases() {
  pruneLeases();
  return fs.readdirSync(LEASE_DIR).length > 0;
}

function looksLikeHeadroomProxy(pid) {
  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
    return cmdline.includes("headroom") && cmdline.includes("proxy");
  } catch {
    return false;
  }
}

async function killProxy() {
  const pid = readPid(PID_FILE);
  if (!pid || !isAlive(pid) || !looksLikeHeadroomProxy(pid)) {
    try {
      fs.unlinkSync(PID_FILE);
    } catch {}
    return;
  }
  log("stopping proxy pid", pid);
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  for (let i = 0; i < 12; i++) {
    if (!isAlive(pid)) break;
    await sleep(POLL_MS);
  }
  if (isAlive(pid)) {
    log("proxy did not exit, SIGKILL");
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
  try {
    fs.unlinkSync(PID_FILE);
  } catch {}
}

let exiting = false;
async function cleanup() {
  if (exiting) return;
  exiting = true;
  releaseLease();
  if (!hasActiveLeases()) {
    await killProxy();
  } else {
    log("other sessions active, leaving proxy running");
  }
  process.exit(0);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const TOOLS = [
  {
    name: "headroom_heartbeat",
    description:
      "Report Headroom proxy health and ensure the local compression/memory proxy is running. Read-only diagnostic.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function handleRequest(message) {
  const { id, method, params } = message;
  if (method === "initialize") {
    return send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: (params && params.protocolVersion) || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "headroom-ctl", version: "0.1.0" },
      },
    });
  }
  if (method === "ping") {
    return send({ jsonrpc: "2.0", id, result: {} });
  }
  if (method === "tools/list") {
    return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  }
  if (method === "tools/call") {
    const name = params && params.name;
    if (name !== "headroom_heartbeat") {
      return send({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true },
      });
    }
    const ok = await ensureProxy();
    const body = JSON.stringify({ proxyUrl: PROXY_URL, healthy: ok, pidFile: PID_FILE });
    return send({
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: body }], isError: !ok },
    });
  }
  if (id !== undefined) {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

let buffer = "";
function onData(chunk) {
  buffer += chunk.toString("utf8");
  let index;
  while ((index = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      log("invalid JSON line");
      continue;
    }
    if (message.method && message.id === undefined) continue;
    handleRequest(message).catch((error) => log("handler error:", error.message));
  }
}

function main() {
  try {
    registerLease();
  } catch (error) {
    log("lease error:", error.message);
  }
  process.stdin.on("data", onData);
  process.stdin.once("end", cleanup);
  process.stdin.once("close", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
  ensureProxy().catch((error) => log("startup ensure error:", error.message));
  log("ready, lease", LEASE_FILE);
}

main();
