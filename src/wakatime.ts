import { type ExecFileOptions, execFile } from "node:child_process";
import * as os from "node:os";
import { dependencies } from "./dependencies.js";
import { logger } from "./logger.js";
import { getVersion } from "./version.js";

const VERSION = getVersion();

export interface HeartbeatParams {
  entity: string;
  projectFolder?: string;
  lineChanges?: number;
  category?: string;
  isWrite?: boolean;
  opencodeVersion?: string;
  opencodeClient?: string;
}

export interface SyncActivityParams {
  projectFolder?: string;
  claudeVersion?: string;
}

export function isWindows(): boolean {
  return os.platform() === "win32";
}

export function buildExecOptions(): ExecFileOptions {
  const options: ExecFileOptions = {
    windowsHide: true,
  };

  if (!isWindows() && !process.env.WAKATIME_HOME && !process.env.HOME) {
    options.env = { ...process.env, WAKATIME_HOME: os.homedir() };
  }

  return options;
}

export function formatArgs(args: string[]): string {
  return args
    .map((arg) => {
      if (arg.includes(" ")) {
        return `"${arg.replace(/"/g, '\\"')}"`;
      }
      return arg;
    })
    .join(" ");
}

export async function ensureCliInstalled(): Promise<boolean> {
  try {
    await dependencies.checkAndInstallCli();
    return dependencies.isCliInstalled();
  } catch (err) {
    logger.errorException(err);
    return false;
  }
}

function runCli(args: string[]): Promise<void> {
  return new Promise((resolve) => {
    const cliLocation = dependencies.getCliLocation();

    if (!dependencies.isCliInstalled()) {
      logger.warn("wakatime-cli not installed, skipping heartbeat");
      resolve();
      return;
    }

    logger.debug(`Running: wakatime-cli ${formatArgs(args)}`);

    execFile(cliLocation, args, buildExecOptions(), (error, stdout, stderr) => {
      const output =
        (stdout?.toString().trim() ?? "") + (stderr?.toString().trim() ?? "");
      if (output) {
        logger.debug(`wakatime-cli output: ${output}`);
      }
      if (error) {
        logger.error(`wakatime-cli error: ${error.message}`);
      }
      resolve();
    });
  });
}

/**
 * Send a per-file heartbeat (OpenCode path). Resolves when the CLI exits.
 */
export function sendHeartbeat(params: HeartbeatParams): Promise<void> {
  const client = params.opencodeClient || "cli";
  const opencodeVersion = params.opencodeVersion || "unknown";

  const args: string[] = [
    "--entity",
    params.entity,
    "--entity-type",
    "file",
    "--category",
    params.category ?? "ai coding",
    "--plugin",
    `opencode-${client}/${opencodeVersion} wakatime-sync/${VERSION}`,
  ];

  if (params.projectFolder) {
    args.push("--project-folder", params.projectFolder);
  }

  if (params.lineChanges !== undefined && params.lineChanges !== 0) {
    args.push("--ai-line-changes", params.lineChanges.toString());
  }

  if (params.isWrite) {
    args.push("--write");
  }

  return runCli(args);
}

/**
 * Record AI coding activity for the current project (Claude Code path).
 * Mirrors the official claude-code-wakatime hook, which reports project-level
 * activity per hook event rather than per edited file.
 */
export function syncAiActivity(params: SyncActivityParams): Promise<void> {
  const claudeVersion = params.claudeVersion || "unknown";

  const args: string[] = [
    "--sync-ai-activity",
    "--plugin",
    `claude-code/${claudeVersion} wakatime-sync/${VERSION}`,
  ];

  if (params.projectFolder) {
    args.push("--project-folder", params.projectFolder);
  }

  return runCli(args);
}

export function isCliAvailable(): boolean {
  return (
    dependencies.isCliInstalled() ||
    dependencies.getCliLocationGlobal() !== undefined
  );
}
