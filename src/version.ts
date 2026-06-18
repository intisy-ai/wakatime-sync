// Version is inlined at build time by esbuild (define __WAKATIME_VERSION__).
// The plugin ships as a single bundled file, so there is no package.json to read
// next to it at runtime.
declare const __WAKATIME_VERSION__: string | undefined;

export function getVersion(): string {
  try {
    if (typeof __WAKATIME_VERSION__ !== "undefined") return __WAKATIME_VERSION__;
  } catch {
    /* not defined in this context */
  }
  return "unknown";
}
