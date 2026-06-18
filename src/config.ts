import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PACKAGE_NAME = "wakatime-sync";
const START_TIME = new Date().toISOString().replace(/:/g, "-").split(".")[0];

let PLUGIN_CONFIG: Record<string, unknown> | null = null;

/**
 * Resolve the active app's config directory. Claude Code is detected via argv
 * (the launched hook path contains ".claude"); everything else is OpenCode.
 * Prefers `~/.<app>` when present, falling back to the XDG `~/.config/<app>`.
 */
export function getAppConfigDir(): string {
  const home = homedir();
  const isClaude = process.argv.join(" ").includes("claude");
  const appName = isClaude ? "claude" : "opencode";
  const direct = join(home, `.${appName}`);
  const xdg = join(home, ".config", appName);
  return existsSync(direct) ? direct : xdg;
}

/**
 * Load plugin config, preferring `<configDir>/config/wakatime-sync.json`
 * over the top-level `<configDir>/wakatime-sync.json`. Cached on first read.
 */
export function getPluginConfig(
  configDir: string = getAppConfigDir(),
): Record<string, unknown> {
  if (PLUGIN_CONFIG !== null) return PLUGIN_CONFIG;
  try {
    const preferred = join(configDir, "config", `${PACKAGE_NAME}.json`);
    const fallback = join(configDir, `${PACKAGE_NAME}.json`);
    const file = existsSync(preferred)
      ? preferred
      : existsSync(fallback)
        ? fallback
        : null;
    PLUGIN_CONFIG = file ? JSON.parse(readFileSync(file, "utf-8")) : {};
  } catch {
    PLUGIN_CONFIG = {};
  }
  return PLUGIN_CONFIG ?? {};
}

export function isLoggingEnabled(): boolean {
  return getPluginConfig().logging !== false;
}

/**
 * Append a line to `<configDir>/logs/YYYY-MM-DD/wakatime-sync-HH-MM-SS.log`.
 * Never throws. Honors `config.logging` (default on); errors always print.
 */
export function writeLog(message: string, isError = false): void {
  const loggingEnabled = isLoggingEnabled();
  try {
    if (loggingEnabled) {
      const date = new Date();
      const logsDir = join(
        getAppConfigDir(),
        "logs",
        date.toISOString().split("T")[0],
      );
      if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
      const logFile = join(logsDir, `${PACKAGE_NAME}-${START_TIME}.log`);
      const prefix = isError ? "[ERROR]" : "[INFO]";
      appendFileSync(logFile, `[${date.toISOString()}] ${prefix} ${message}\n`);
    }
  } catch {
    /* never crash on log failure */
  }
}
