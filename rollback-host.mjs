#!/usr/bin/env node
import { existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { probeHost, readHostToken, readRelease, run } from "./scripts/host-deployment.mjs";

const root = dirname(fileURLToPath(import.meta.url));
if (process.argv.includes("--help")) {
  console.log("Usage: node ./rollback-host.mjs");
  console.log("Run only after stopping the foreground host. Swaps the current and previous complete host artifacts.");
  process.exit(0);
}
if (process.argv.length > 2) throw new Error(`Unknown argument: ${process.argv[2]}`);

const healthPort = Number(process.env.PI_TIN_PORT || process.env.PI_REMOTE_PORT || "31415");
try {
  const health = await probeHost({ host: "127.0.0.1", port: healthPort, token: readHostToken(), requestTimeoutMs: 1_000 });
  throw new Error(`Pi Tin host ${health.revision || "unknown"} is still running on port ${healthPort}. Stop it before rollback.`);
} catch (error) {
  const causeCode = error instanceof Error && "cause" in error ? error.cause?.code : undefined;
  if (causeCode !== "ECONNREFUSED") throw error;
}

const pairs = [
  [resolve(root, "packages/host/dist"), resolve(root, "packages/host/dist.previous")],
  [resolve(root, "packages/pi-tin/dist"), resolve(root, "packages/pi-tin/dist.previous")],
];
for (const [currentDir, previousDir] of pairs) {
  if (!existsSync(currentDir) || !existsSync(previousDir)) {
    throw new Error(`Rollback artifacts are incomplete. Expected both ${currentDir} and ${previousDir}.`);
  }
}

const swapped = [];
async function swap(currentDir, previousDir, suffix) {
  const temporaryDir = `${currentDir}.${suffix}-${process.pid}`;
  let previousMoved = false;
  await rename(currentDir, temporaryDir);
  try {
    await rename(previousDir, currentDir);
    previousMoved = true;
    await rename(temporaryDir, previousDir);
  } catch (error) {
    if (previousMoved && existsSync(currentDir) && !existsSync(previousDir)) await rename(currentDir, previousDir);
    if (existsSync(temporaryDir) && !existsSync(currentDir)) await rename(temporaryDir, currentDir);
    throw error;
  }
}

try {
  for (const [currentDir, previousDir] of pairs) {
    await swap(currentDir, previousDir, "rollback");
    swapped.push([currentDir, previousDir]);
  }
} catch (error) {
  for (const [currentDir, previousDir] of swapped.reverse()) await swap(currentDir, previousDir, "restore");
  throw error;
}

run("pi", ["install", resolve(root, "packages/pi-tin/dist")], { cwd: root });
const release = readRelease(root);
if (release) {
  console.log(`\nRolled back host artifacts to revision ${release.revision} (protocol v${release.protocolVersion}).`);
  console.log("Start the foreground host: node ./start-host.mjs");
  console.log(`Then verify it: node ./verify-host.mjs --revision ${release.revision} --wait 30`);
} else {
  console.log("\nRolled back to a legacy host bundle created before release manifests were introduced.");
  console.log("Start it with node ./start-host.mjs and confirm client connection/session restoration manually.");
}
