import type { Plugin } from "@opencode-ai/plugin";
import { spawn } from "node:child_process";
import { mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

const HEADROOM_BIN = process.env.HEADROOM_BIN || join(homedir(), ".local", "bin", "headroom");
const PROXY_URL = process.env.HEADROOM_PROXY_URL || "http://127.0.0.1:8787";
const PORT = new URL(PROXY_URL).port || "8787";

const STATE_DIR = join(homedir(), ".headroom");
const PID_FILE = join(STATE_DIR, "proxy.pid");
const LOG_FILE = join(STATE_DIR, "proxy.log");
const LOCK_DIR = join(STATE_DIR, "startup-locks");
const LOCK_FILE = join(LOCK_DIR, "proxy.lock");
const MEMORY_DB = join(STATE_DIR, "memory.db");

const HEALTH_TIMEOUT_MS = 60_000;
const POLL_MS = 250;
const DEBUG = process.env.HEADROOM_CTL_DEBUG === "1";
const DASH_URL = "http://127.0.0.1:8788";
const DASH_SCRIPT = join(homedir(), ".config", "opencode", "mcps", "headroom-ctl", "dashboard.py");

function log(...args: unknown[]): void {
  if (DEBUG) console.error("[headroom-ctl]", ...args);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function healthy(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = get(`${PROXY_URL}/health`, { timeout: 2000 }, (res) => {
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

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPidFrom(file: string): number | null {
  try {
    const pid = Number(readFileSync(file, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function startProxy(): Promise<boolean> {
  mkdirSync(STATE_DIR, { recursive: true });
  const out = openSync(LOG_FILE, "a");
  const child = spawn(
    HEADROOM_BIN,
    [
      "proxy",
      "--port",
      PORT,
      "--memory",
      "--memory-storage=global",
      "--memory-db-path",
      MEMORY_DB,
      "--no-memory-tools",
    ],
    {
      detached: true,
      stdio: ["ignore", out, out],
      env: { ...process.env, HEADROOM_BEACON: "off" },
    },
  );
  child.on("error", (error) => log("proxy spawn error:", error.message));
  child.unref();
  writeFileSync(PID_FILE, `${child.pid}\n`);
  log("spawned proxy pid", child.pid);

  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await healthy()) return true;
    await sleep(POLL_MS);
  }
  log("proxy health timeout");
  return false;
}

async function withStartupLock(): Promise<boolean | null> {
  mkdirSync(LOCK_DIR, { recursive: true });
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await healthy()) return null;
    try {
      writeFileSync(LOCK_FILE, `${process.pid}\n`, { flag: "wx" });
      try {
        if (await healthy()) return null;
        return await startProxy();
      } finally {
        try {
          rmSync(LOCK_FILE);
        } catch {}
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const owner = readPidFrom(LOCK_FILE);
      if (!owner || !isAlive(owner)) {
        try {
          rmSync(LOCK_FILE);
        } catch {}
      } else {
        await sleep(POLL_MS);
      }
    }
  }
  log("startup lock timed out");
  return null;
}

async function ensureProxy(): Promise<boolean> {
  if (await healthy()) return true;
  const started = await withStartupLock();
  if (started !== null) return started;
  return healthy();
}

function dashboardUp(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = get(`${DASH_URL}/api/status`, { timeout: 1000 }, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function spawnDashboard(): void {
  void dashboardUp()
    .then((up) => {
      if (up) return;
      const child = spawn("python3", [DASH_SCRIPT], { detached: true, stdio: "ignore" });
      child.on("error", (error) => log("dashboard spawn error:", error.message));
      child.unref();
      log("spawned dashboard pid", child.pid);
    })
    .catch(() => {});
}

export const HeadroomCtlPlugin: Plugin = async () => {
  await ensureProxy().catch((error) => log("ensure failed:", error));
  spawnDashboard();

  return {
    "chat.params": async () => {
      await ensureProxy().catch((error) => log("re-ensure failed:", error));
    },
  };
};
