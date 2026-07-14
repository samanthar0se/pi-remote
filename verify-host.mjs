#!/usr/bin/env node
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readRelease, waitForHost, waitForHostToken } from "./scripts/host-deployment.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const values = process.argv.slice(2);
if (values.includes("--help")) {
  console.log("Usage: node ./verify-host.mjs [--host 127.0.0.1] [--port 31415] [--revision REV] [--wait SECONDS]");
  process.exit(0);
}

function option(name, fallback) {
  const index = values.indexOf(name);
  if (index < 0) return fallback;
  const value = values[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}
const knownArguments = new Set(["--host", "--port", "--revision", "--wait"]);
for (let index = 0; index < values.length; index += 2) {
  if (!knownArguments.has(values[index])) throw new Error(`Unknown argument: ${values[index]}`);
}

const release = readRelease(root);
if (!release) throw new Error("No staged host release manifest exists. Run node ./deploy-host.mjs first.");
const host = option("--host", process.env.PI_TIN_VERIFY_HOST || "127.0.0.1");
const port = Number(option("--port", process.env.PI_TIN_PORT || process.env.PI_REMOTE_PORT || "31415"));
const expectedRevision = option("--revision", release.revision);
const waitSeconds = Number(option("--wait", "5"));
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("--port must be a valid TCP port.");
if (!Number.isFinite(waitSeconds) || waitSeconds <= 0 || waitSeconds > 300) throw new Error("--wait must be between 1 and 300 seconds.");

const health = await waitForHost({
  host,
  port,
  token: await waitForHostToken(waitSeconds * 1_000),
  expectedRevision,
  expectedProtocolVersion: release.protocolVersion,
  waitMs: waitSeconds * 1_000,
});
console.log(`Pi Tin host verified at ${host}:${port}`);
console.log(`Revision: ${health.revision}`);
console.log(`Protocol: v${health.version}`);
