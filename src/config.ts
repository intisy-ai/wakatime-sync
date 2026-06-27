// wakatime-sync config + logging — delegated to the shared core library so
// every plugin uses one config + logging system. Public API kept stable for logger.ts.
import {
  getAppConfigDir,
  isLoggingEnabled as coreIsLoggingEnabled,
  loadConfig,
  ensureConfig,
  makeWriteLog,
} from "../core/src/index.js";

const PACKAGE_NAME = "wakatime-sync";

// materialize config/wakatime-sync.json with defaults on load, so it's discoverable
ensureConfig(PACKAGE_NAME, { logging: true });

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
