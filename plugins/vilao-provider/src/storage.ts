import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

import { OVERRIDES_FILE, parseOverrides, type OverridesFile } from "./catalog.js";

const AUTH_FILE = "auth.json";

export function overridesPath(): string {
  const root = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(root, "opencode", OVERRIDES_FILE);
}

export async function readOverrides(): Promise<OverridesFile> {
  try {
    return parseOverrides(JSON.parse(await readFile(overridesPath(), "utf8")));
  } catch {
    return { version: 1, models: {} };
  }
}

export async function readAuth(): Promise<{ key?: string; metadata?: Record<string, string> }> {
  const root = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  try {
    const auth = JSON.parse(await readFile(join(root, "opencode", AUTH_FILE), "utf8"));
    const vilao = auth?.vilao;
    return vilao?.type === "api" ? { key: vilao.key, metadata: vilao.metadata } : {};
  } catch {
    return {};
  }
}

export async function writeOverrides(overrides: OverridesFile): Promise<void> {
  const path = overridesPath();
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(temporary, `${JSON.stringify(overrides, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
