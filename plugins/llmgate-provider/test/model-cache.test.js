import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadModelsWithFallback } from "../index.js";

const apiKey = "gateway-key-used-only-for-tests";
const catalog = {
  "gpt-5.6-terra": {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    reasoning: true,
    limit: { context: 420_000, output: 128_000 },
  },
};

async function withCacheDirectory(t, callback) {
  const directory = await mkdtemp(join(tmpdir(), "opencode-llmgate-cache-"));
  const previous = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = previous;
    await rm(directory, { recursive: true, force: true });
  });
  await callback(directory);
}

test("retries a catalog fetch and caches only model configs", { concurrency: false }, async (t) => {
  await withCacheDirectory(t, async (directory) => {
    let attempts = 0;
    const models = await loadModelsWithFallback(apiKey, async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("temporary gateway failure");
      return catalog;
    }, 0);

    assert.equal(attempts, 3);
    assert.deepEqual(models, catalog);

    const cacheFiles = await readdir(join(directory, "opencode"));
    assert.equal(cacheFiles.length, 1);
    const cache = await readFile(join(directory, "opencode", cacheFiles[0]), "utf8");
    assert.equal(cache.includes(apiKey), false);
    assert.match(cache, /gpt-5\.6-terra/u);
  });
});

test("uses only matching valid cached models after retries fail", { concurrency: false }, async (t) => {
  await withCacheDirectory(t, async (directory) => {
    await loadModelsWithFallback(apiKey, async () => catalog, 0);

    let attempts = 0;
    const fallback = await loadModelsWithFallback(apiKey, async () => {
      attempts += 1;
      throw new Error("gateway unavailable");
    }, 0);
    assert.equal(attempts, 3);
    assert.deepEqual(fallback, catalog);

    const wrongKeyFallback = await loadModelsWithFallback("different-test-key", async () => {
      throw new Error("gateway unavailable");
    }, 0);
    assert.deepEqual(wrongKeyFallback, {});

    const cacheFile = (await readdir(join(directory, "opencode")))[0];
    await writeFile(join(directory, "opencode", cacheFile), "not json", "utf8");
    const malformedFallback = await loadModelsWithFallback(apiKey, async () => {
      throw new Error("gateway unavailable");
    }, 0);
    assert.deepEqual(malformedFallback, {});
  });
});
