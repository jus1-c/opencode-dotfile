import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJsonAtomic(path, value, { mode = 0o600 } = {}) {
  const directory = dirname(path);
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  const text = `${JSON.stringify(value, null, 2)}\n`;

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, text, { encoding: "utf8", mode });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
