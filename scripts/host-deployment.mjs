import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? undefined : "inherit",
    shell: process.platform === "win32",
    env: options.env || process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? String(result.stderr || result.stdout || "").trim() : "";
    throw new Error(detail || `${command} ${args.join(" ")} failed with exit code ${result.status}.`);
  }
  return options.capture ? String(result.stdout).trim() : "";
}

export function readRelease(root, directory = "dist") {
  const path = resolve(root, "packages/host", directory, "release.json");
  if (!existsSync(path)) return null;
  const release = JSON.parse(readFileSync(path, "utf8"));
  if (typeof release.revision !== "string" || !Number.isInteger(release.protocolVersion)) {
    throw new Error(`${path} is not a valid host release manifest.`);
  }
  return release;
}

export function readHostToken() {
  const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
  const path = join(agentDir, "pi-tin.json");
  let parsed;
  try { parsed = JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(`Could not read the Pi Tin host token at ${path}.`); }
  if (typeof parsed.token !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(parsed.token)) {
    throw new Error(`The Pi Tin host token at ${path} is invalid.`);
  }
  return parsed.token;
}

export async function waitForHostToken(waitMs) {
  const deadline = Date.now() + waitMs;
  let lastError;
  do {
    try { return readHostToken(); }
    catch (error) { lastError = error; }
    if (Date.now() < deadline) await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  } while (Date.now() < deadline);
  throw lastError;
}

function localHealthHost(host) {
  return ["0.0.0.0", "::", "[::]"].includes(host) ? "127.0.0.1" : host;
}

export async function probeHost({ host, port, token, requestTimeoutMs = 2_000 }) {
  const healthHost = localHealthHost(host);
  const hostname = healthHost.includes(":") && !healthHost.startsWith("[") ? `[${healthHost}]` : healthHost;
  const response = await fetch(`http://${hostname}:${port}/health`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (response.status === 401) throw new Error("Host health verification was rejected. Check the local Pi Tin token.");
  if (!response.ok) throw new Error(`Host health verification returned HTTP ${response.status}.`);
  return response.json();
}

export async function waitForHost({ host, port, token, expectedRevision, expectedProtocolVersion, waitMs }) {
  const deadline = Date.now() + waitMs;
  let lastError = new Error("The host did not answer its health check.");
  do {
    try {
      const health = await probeHost({ host, port, token, requestTimeoutMs: Math.min(2_000, Math.max(250, deadline - Date.now())) });
      if (health.ok !== true) throw new Error("Host health response did not report ok=true.");
      if (expectedRevision && health.revision !== expectedRevision) {
        throw new Error(`Host is running revision ${health.revision || "unknown"}; expected ${expectedRevision}.`);
      }
      if (expectedProtocolVersion && health.version !== expectedProtocolVersion) {
        throw new Error(`Host is running protocol v${health.version || "unknown"}; expected v${expectedProtocolVersion}.`);
      }
      return health;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (Date.now() >= deadline) break;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    }
  } while (Date.now() < deadline);
  throw lastError;
}
