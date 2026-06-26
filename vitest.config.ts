import { defineConfig } from "vitest/config";

// Only this plugin's own tests (src/ + test/) — never the bundled submodules'
// internal tests (core/, core-auth/, core-loader/), which run in their own repos.
export default defineConfig({
  test: { include: ["src/**/*.test.{ts,js}", "test/**/*.test.{ts,js,mjs}"] },
});
