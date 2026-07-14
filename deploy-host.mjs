#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readRelease, run } from "./scripts/host-deployment.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
if (args.has("--help")) {
  console.log("Usage: node ./deploy-host.mjs [--skip-plannotator] [--rebuild]");
  console.log("Fetches the tracked upstream branch, fast-forwards, validates, and stages a host release without stopping the running host.");
  process.exit(0);
}
for (const argument of args) {
  if (!["--skip-plannotator", "--rebuild"].includes(argument)) throw new Error(`Unknown argument: ${argument}`);
}

console.log("Pi Tin guarded host deployment");
console.log(`Repository: ${root}`);

if (run("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, capture: true }) !== "true") {
  throw new Error(`${root} is not a Git working tree.`);
}
const upstream = run("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], { cwd: root, capture: true });
const trackedChanges = run("git", ["status", "--short", "--untracked-files=no"], { cwd: root, capture: true });
if (trackedChanges) throw new Error(`Refusing to deploy over local tracked changes:\n${trackedChanges}`);

const previousSourceRevision = run("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root, capture: true });
console.log(`\n==> Fetching ${upstream}`);
run("git", ["fetch", "--prune"], { cwd: root });
const [aheadCount, behindCount] = run("git", ["rev-list", "--left-right", "--count", `HEAD...${upstream}`], { cwd: root, capture: true })
  .split(/\s+/).map(Number);
if (!Number.isInteger(aheadCount) || !Number.isInteger(behindCount)) throw new Error(`Could not compare HEAD with ${upstream}.`);
if (aheadCount > 0) throw new Error(`The local branch is ${aheadCount} commit(s) ahead of ${upstream}. Push or remove them before deployment.`);

if (behindCount > 0) {
  console.log(`\n==> Fast-forwarding ${behindCount} commit(s)`);
  run("git", ["merge", "--ff-only", upstream], { cwd: root });
} else {
  console.log("Repository is already current.");
}

const targetRevision = run("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root, capture: true });
if (behindCount > 0 && process.env.PI_TIN_DEPLOY_REEXEC_REVISION !== targetRevision) {
  console.log("\n==> Restarting deployment with the fetched updater");
  run(process.execPath, [resolve(root, "deploy-host.mjs"), ...args], {
    cwd: root,
    env: { ...process.env, PI_TIN_DEPLOY_REEXEC_REVISION: targetRevision, PI_TIN_DEPLOY_FROM_REVISION: previousSourceRevision },
  });
  process.exit(0);
}
const currentRelease = readRelease(root);
if (currentRelease?.revision === targetRevision && !args.has("--rebuild")) {
  console.log(`\nHost revision ${targetRevision} is already staged; preserving the rollback artifacts.`);
} else {
  console.log(`\n==> Building and validating host revision ${targetRevision}`);
  const buildArgs = [resolve(root, "build-host.mjs")];
  if (args.has("--skip-plannotator")) buildArgs.push("--skip-plannotator");
  try {
    run(process.execPath, buildArgs, { cwd: root });
  } catch (error) {
    console.error("\nDEPLOYMENT NOT STAGED. Do not restart the running host.");
    console.error(`Source moved from ${process.env.PI_TIN_DEPLOY_FROM_REVISION || previousSourceRevision} to ${targetRevision}, but the validated build did not complete.`);
    console.error("The atomic builders retained the last complete artifacts. Fix the error and rerun this command.");
    throw error;
  }
}

const stagedRelease = readRelease(root);
if (!stagedRelease || stagedRelease.dirty === true || stagedRelease.revision !== targetRevision) {
  throw new Error(`Staged host manifest does not match target revision ${targetRevision}. Do not restart the host.`);
}

console.log("\nHOST RELEASE STAGED SUCCESSFULLY");
console.log(`Revision: ${stagedRelease.revision}`);
console.log(`Protocol: v${stagedRelease.protocolVersion}`);
console.log("The running foreground host was not stopped and continues serving its loaded version.");
console.log("\nActivate the release:");
console.log("  1. In the host terminal, press Ctrl+C and wait for a clean exit.");
console.log("  2. Start it again: node ./start-host.mjs");
console.log(`  3. In another terminal: node ./verify-host.mjs --revision ${stagedRelease.revision} --wait 30`);
console.log("\nIf activation fails, follow the rollback procedure in README.md.");
