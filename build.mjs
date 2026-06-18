// Bundle the dual-app entry into a SINGLE self-contained ESM file. OpenCode
// deploys plugins as one file (plugin/<name>.js), so sibling modules must be
// inlined; the version is inlined via define. @opencode-ai/plugin is type-only,
// kept external.
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist/index.js",
  external: ["@opencode-ai/plugin"],
  define: { __WAKATIME_VERSION__: JSON.stringify(pkg.version) },
  logLevel: "info",
});

console.log(`Bundled wakatime-sync v${pkg.version} -> dist/index.js`);
