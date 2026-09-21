#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const profile = process.env.PLAYWRIGHT_MCP_USER_DATA_DIR;

if (profile) {
  const lock = path.join(profile, ".cloakbrowser-mcp-profile.lock");
  try {
    const { pid } = JSON.parse(fs.readFileSync(lock, "utf8"));
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
      } catch (error) {
        if (error.code === "ESRCH") fs.unlinkSync(lock);
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") console.error(`[cloakbrowser-launcher] Could not inspect profile lock: ${error.message}`);
  }
}

const entry = path.join(__dirname, "..", "runtime", "node_modules", "cloakbrowser-mcp", "dist", "cli.js");
const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], { stdio: "inherit", env: process.env });

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => console.error(`[cloakbrowser-launcher] ${error.message}`));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
