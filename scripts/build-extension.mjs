import { build } from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publishBuildOutput } from "./atomic-build-output.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(root, "packages/pi-tin");
const outDir = resolve(sourceDir, "dist");
const temporaryDir = resolve(sourceDir, `.dist-${process.pid}-${Date.now()}`);
const previousDir = resolve(sourceDir, "dist.previous");

await rm(temporaryDir, { recursive: true, force: true });
await mkdir(temporaryDir, { recursive: true });

try {
  await build({
    entryPoints: [resolve(sourceDir, "index.ts")],
    outfile: resolve(temporaryDir, "index.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: true,
    legalComments: "linked",
    external: ["@earendil-works/pi-coding-agent"],
  });

  const manifest = {
    name: "@pi-tin/pi-extension",
    version: "0.1.0",
    type: "module",
    private: true,
    description: "Built Pi Tin host extension",
    license: "MIT",
    keywords: ["pi-package"],
    pi: { extensions: ["./index.mjs"] },
  };

  await writeFile(resolve(temporaryDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await cp(resolve(root, "LICENSE"), resolve(temporaryDir, "LICENSE"));
  await publishBuildOutput({ outputDir: outDir, temporaryDir, previousDir });
} catch (error) {
  await rm(temporaryDir, { recursive: true, force: true });
  throw error;
}
console.log(`Built self-contained Pi extension: ${outDir}`);
