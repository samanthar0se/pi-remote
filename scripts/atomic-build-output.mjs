import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";

export async function publishBuildOutput({ outputDir, temporaryDir, previousDir }) {
  await rm(previousDir, { recursive: true, force: true });
  let preservedCurrent = false;
  try {
    if (existsSync(outputDir)) {
      await rename(outputDir, previousDir);
      preservedCurrent = true;
    }
    await rename(temporaryDir, outputDir);
  } catch (error) {
    await rm(outputDir, { recursive: true, force: true });
    if (preservedCurrent && existsSync(previousDir)) await rename(previousDir, outputDir);
    throw error;
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
}
