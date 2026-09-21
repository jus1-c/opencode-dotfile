import { readFile, rm, writeFile } from "node:fs/promises";
import babel from "@babel/core";
import typescriptPreset from "@babel/preset-typescript";
import solidPreset from "babel-preset-solid";

const sourcePath = new URL("../src/tui.tsx", import.meta.url);
const outputPath = new URL("../dist/tui.js", import.meta.url);
const transformed = await babel.transformAsync(await readFile(sourcePath, "utf8"), {
  filename: sourcePath.pathname,
  configFile: false,
  babelrc: false,
  presets: [
    [solidPreset, { moduleName: "@opentui/solid", generate: "universal" }],
    [typescriptPreset],
  ],
});

if (!transformed?.code) throw new Error("Babel transform returned empty output");
await writeFile(outputPath, `${transformed.code}\n`);
await rm(new URL("../dist/tui.jsx", import.meta.url), { force: true });
