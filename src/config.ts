// wakatime-sync config + logging — delegated to the shared core-log library so
// every plugin uses one logging system. Public API kept stable for logger.ts.
import {
  getAppConfigDir,
  isLoggingEnabled as coreIsLoggingEnabled,
  loadConfig,
  makeWriteLog,
} from "../core-log/src/index.js";

const PACKAGE_NAME = "wakatime-sync";

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
