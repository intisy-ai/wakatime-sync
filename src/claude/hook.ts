import * as fs from "node:fs";
import { ensureCliInstalled, syncAiActivity } from "../wakatime.js";
import { getWakatimeConfigFilePath } from "../wakatime-paths.js";
import { LogLevel, logger } from "../logger.js";
import {
  getClaudeVersion,
  parseInput,
  shouldSendHeartbeat,
  updateState,
} from "./utils.js";

function applyDebugSetting(): void {
  try {
    const cfg = fs.readFileSync(getWakatimeConfigFilePath(), "utf-8");
    if (/^\s*debug\s*=\s*true\s*$/m.test(cfg)) {
      logger.setLevel(LogLevel.DEBUG);
    }
  } catch {
    /* no cfg yet — keep default level */
  }
}

/**
 * Claude Code hook entry. Reads the hook payload from stdin, rate-limits per
 * transcript, and records AI coding activity for the project via wakatime-cli.
 */
export async function runClaudeHook(): Promise<void> {
  applyDebugSetting();

  const input = parseInput();
  try {
    if (input) logger.debug(JSON.stringify(input));

    await ensureCliInstalled();

    if (shouldSendHeartbeat(input)) {
      await syncAiActivity({
        projectFolder: input?.cwd,
        claudeVersion: await getClaudeVersion(input),
      });
      await updateState(input);
    }
  } catch (err) {
    logger.errorException(err);
  }
}
