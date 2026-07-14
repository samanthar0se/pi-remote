import { build } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { publishBuildOutput } from "./atomic-build-output.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "packages/host/dist");
const temporaryDir = resolve(root, `packages/host/.dist-${process.pid}-${Date.now()}`);
const previousDir = resolve(root, "packages/host/dist.previous");
const revisionResult = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
if (revisionResult.status !== 0) throw new Error("Could not determine the host build revision.");
const sourceRevision = revisionResult.stdout.trim();
const statusResult = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
if (statusResult.status !== 0) throw new Error("Could not determine whether the host source is clean.");
const dirty = Boolean(statusResult.stdout.trim());
const revision = dirty ? `${sourceRevision}-dirty` : sourceRevision;
const protocolSource = await readFile(resolve(root, "packages/protocol/src/index.ts"), "utf8");
const protocolVersion = Number(/PROTOCOL_VERSION\s*=\s*(\d+)/.exec(protocolSource)?.[1]);
if (!Number.isInteger(protocolVersion)) throw new Error("Could not determine the Pi Tin protocol version.");

await rm(temporaryDir, { recursive: true, force: true });
await mkdir(temporaryDir, { recursive: true });
try {
  await build({
    entryPoints: [resolve(root, "packages/host/src/index.ts")],
    outfile: resolve(temporaryDir, "index.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: true,
    define: { __PI_TIN_BUILD_REVISION__: JSON.stringify(revision) },
    external: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-coding-agent/rpc-entry", "ws"],
  });
  await writeFile(resolve(temporaryDir, "release.json"), `${JSON.stringify({ revision, sourceRevision, dirty, protocolVersion, builtAt: new Date().toISOString() }, null, 2)}\n`);
  await publishBuildOutput({ outputDir: outDir, temporaryDir, previousDir });
} catch (error) {
  await rm(temporaryDir, { recursive: true, force: true });
  throw error;
}
console.log(`Built Pi Tin host controller: ${outDir}`);
