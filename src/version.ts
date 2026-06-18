import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let CACHED_VERSION: string | null = null;

export function getVersion(): string {
  if (CACHED_VERSION !== null) return CACHED_VERSION;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(here, "..", "package.json"), "utf-8"),
    );
    CACHED_VERSION = pkg.version ?? "unknown";
  } catch {
    CACHED_VERSION = "unknown";
  }
  return CACHED_VERSION as string;
}
