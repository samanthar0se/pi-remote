import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { publishBuildOutput } from "./atomic-build-output.mjs";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("atomic build publishing", () => {
  it("publishes the candidate and preserves the prior release", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-tin-build-"));
    temporaryRoots.push(root);
    const outputDir = join(root, "dist");
    const temporaryDir = join(root, "candidate");
    const previousDir = join(root, "previous");
    await mkdir(outputDir);
    await mkdir(temporaryDir);
    await writeFile(join(outputDir, "revision"), "old");
    await writeFile(join(temporaryDir, "revision"), "new");

    await publishBuildOutput({ outputDir, temporaryDir, previousDir });

    expect(await readFile(join(outputDir, "revision"), "utf8")).toBe("new");
    expect(await readFile(join(previousDir, "revision"), "utf8")).toBe("old");
  });

  it("restores the prior release when candidate publication fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-tin-build-"));
    temporaryRoots.push(root);
    const outputDir = join(root, "dist");
    const temporaryDir = join(root, "missing-candidate");
    const previousDir = join(root, "previous");
    await mkdir(outputDir);
    await writeFile(join(outputDir, "revision"), "old");

    await expect(publishBuildOutput({ outputDir, temporaryDir, previousDir })).rejects.toThrow();
    expect(await readFile(join(outputDir, "revision"), "utf8")).toBe("old");
  });
});
