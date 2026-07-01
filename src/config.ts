// wakatime-sync config + logging — delegated to the shared core library so
// every plugin uses one config + logging system. Public API kept stable for logger.ts.
import {
  getAppConfigDir,
  isLoggingEnabled as coreIsLoggingEnabled,
  loadConfig,
  defineConfig,
  makeWriteLog,
} from "../core/src/index.js";

const PACKAGE_NAME = "wakatime-sync";

// register defaults so the loader can discover + edit them (writes no file on load)
defineConfig(PACKAGE_NAME, {
  logging: true,
  // How many seconds must elapse between heartbeats (per-project rate limit).
  heartbeat_interval_seconds: 60,
  // How many hours between checks for a newer wakatime-cli binary.
  cli_update_interval_hours: 4,
  // When non-empty, written into ~/.wakatime.cfg [settings] api_key on activation.
  api_key: "",
  // WakaTime's own default API endpoint. Shown as the default so it's documented;
  // only written into ~/.wakatime.cfg when the user explicitly sets it (the merge
  // reads the on-disk config, not this default), so it never clobbers an existing cfg.
  api_url: "https://api.wakatime.com/api/v1",
  // When true, sets hidefilenames = true in ~/.wakatime.cfg [settings] on activation.
  hide_filenames: false,
  // When non-empty, written into ~/.wakatime.cfg [settings] proxy on activation.
  proxy: "",
  // When non-empty, written into ~/.wakatime.cfg [settings] hostname on activation.
  hostname: "",
  // When true, sets hide_project_names = true in ~/.wakatime.cfg [settings] on activation.
  hide_project_names: false,
});

export { getAppConfigDir };

export function getPluginConfig(
  configDir: string = getAppConfigDir(),
): Record<string, unknown> {
  return loadConfig(PACKAGE_NAME, configDir) as Record<string, unknown>;
}

export function isLoggingEnabled(): boolean {
  return coreIsLoggingEnabled(PACKAGE_NAME);
}

export const writeLog = makeWriteLog(PACKAGE_NAME);
