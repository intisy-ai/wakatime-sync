import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { logger } from "../logger.js";
import { getPluginConfig } from "../config.js";
import type { Input, State, TranscriptLog } from "./types.js";

export function parseInput(): Input | undefined {
  try {
    const stdinData = fs.readFileSync(0, "utf-8");
    if (stdinData.trim()) {
      return JSON.parse(stdinData) as Input;
    }
  } catch (err) {
    logger.warnException(err);
  }
  return undefined;
}

function timestamp(): number {
  return Date.now() / 1000;
}

export function isWindows(): boolean {
  return os.platform() === "win32";
}

export function getHomeDirectory(): string {
  const home = process.env.WAKATIME_HOME;
  if (home && home.trim() && fs.existsSync(home.trim())) return home.trim();
  return process.env[isWindows() ? "USERPROFILE" : "HOME"] || process.cwd();
}

function getStateFile(inp: Input): string {
  const transcriptPath = getStateTranscriptPath(inp);
  if (transcriptPath) return `${transcriptPath}.wakatime`;

  return path.join(
    getHomeDirectory(),
    ".claude",
    "config",
    "wakatime",
    "claude-code",
    `${sanitizeFileName(getFallbackStateId(inp))}.wakatime`,
  );
}

/**
 * Per-transcript heartbeat rate limit (heartbeat_interval_seconds, default 60s).
 * Returns true when no recent heartbeat exists.
 */
export function shouldSendHeartbeat(inp?: Input): boolean {
  if (!inp) return false;

  try {
    const last =
      (JSON.parse(fs.readFileSync(getStateFile(inp), "utf-8")) as State)
        .lastHeartbeatAt ?? timestamp();
    const intervalSeconds = Number(getPluginConfig().heartbeat_interval_seconds ?? 60);
    return timestamp() - last >= intervalSeconds;
  } catch {
    return true;
  }
}

export async function updateState(inp?: Input): Promise<void> {
  if (!inp) return;
  const file = getStateFile(inp);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(
    file,
    JSON.stringify({ lastHeartbeatAt: timestamp() } as State, null, 2),
  );
}

export async function getClaudeVersion(inp: Input | undefined): Promise<string> {
  const transcriptPath = inp?.transcript_path?.trim();
  if (!transcriptPath) {
    return "";
  }

  let content: string;
  try {
    content = fs.readFileSync(transcriptPath, "utf-8");
  } catch {
    return "";
  }

  for (const logLine of content.split("\n")) {
    if (!logLine.trim()) continue;
    try {
      const log = JSON.parse(logLine) as TranscriptLog;
      if (log.version) return log.version;
    } catch (err) {
      logger.warnException(err);
    }
  }

  return "";
}

function getStateTranscriptPath(inp: Input): string | undefined {
  const transcriptPath = inp.transcript_path?.trim();
  const parentTranscriptPath = getParentStateTranscriptPath(inp);
  if (parentTranscriptPath) return parentTranscriptPath;

  if (transcriptPath && directoryExists(path.dirname(transcriptPath)))
    return transcriptPath;

  return undefined;
}

function getParentStateTranscriptPath(inp: Input): string | undefined {
  const transcriptPath = inp.transcript_path?.trim();
  if (
    inp.hook_event_name === "SubagentStop" &&
    inp.agent_transcript_path &&
    transcriptPath &&
    directoryExists(path.dirname(transcriptPath))
  ) {
    return transcriptPath;
  }

  const parentSessionId = getInputParentSessionId(inp);
  if (parentSessionId && transcriptPath) {
    const projectDir =
      getClaudeProjectDirectoryFromTranscriptPath(transcriptPath);
    if (projectDir && directoryExists(projectDir))
      return path.join(projectDir, `${parentSessionId}.jsonl`);
  }

  const parentFromPath = getParentTranscriptPathFromSubagentPath(transcriptPath);
  if (parentFromPath && directoryExists(path.dirname(parentFromPath)))
    return parentFromPath;

  return undefined;
}

function getParentTranscriptPathFromSubagentPath(
  transcriptPath?: string,
): string | undefined {
  if (!transcriptPath) return undefined;

  const normalized = path.resolve(transcriptPath);
  const parts = normalized.split(path.sep);
  const subagentsIndex = parts.lastIndexOf("subagents");
  if (subagentsIndex < 2) return undefined;

  const parentSessionId = parts[subagentsIndex - 1];
  const projectDir = joinPathParts(parts.slice(0, subagentsIndex - 1));
  return path.join(projectDir, `${parentSessionId}.jsonl`);
}

function getClaudeProjectDirectoryFromTranscriptPath(
  transcriptPath?: string,
): string | undefined {
  if (!transcriptPath) return undefined;

  const normalized = path.resolve(transcriptPath);
  const marker = `${path.sep}.claude${path.sep}projects${path.sep}`;
  const index = normalized.indexOf(marker);
  if (index === -1) return undefined;

  const afterProjects = normalized.substring(index + marker.length);
  const projectDir = afterProjects.split(path.sep)[0];
  if (!projectDir) return undefined;

  return path.join(
    normalized.substring(0, index + marker.length - 1),
    projectDir,
  );
}

function getSidechainParentUuid(inp: Input): string | undefined {
  const inputParentUuid = inp.parentUuid || inp.parent_uuid;
  if (inputParentUuid) return inputParentUuid;

  const transcriptPath = inp.transcript_path?.trim();
  if (!isSidechainInput(inp) || !transcriptPath || !fs.existsSync(transcriptPath))
    return undefined;

  let content: string;
  try {
    content = fs.readFileSync(transcriptPath, "utf-8");
  } catch {
    return undefined;
  }

  for (const logLine of content.split("\n")) {
    if (!logLine.trim()) continue;
    try {
      const log = JSON.parse(logLine) as TranscriptLog;
      if (log.isSidechain && log.parentUuid) return log.parentUuid;
    } catch (err) {
      logger.warnException(err);
    }
  }

  return undefined;
}

function directoryExists(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function getFallbackStateId(inp: Input): string {
  const parentUuid = getSidechainParentUuid(inp);
  if (parentUuid) return `parent-${parentUuid}`;
  return inp.session_id || "unknown";
}

function getInputParentSessionId(inp: Input): string | undefined {
  return inp.parentSessionId || inp.parent_session_id;
}

function isSidechainInput(inp: Input): boolean {
  return (
    inp.isSidechain === true ||
    inp.isSideChain === true ||
    inp.hook_event_name === "SubagentStop"
  );
}

function joinPathParts(parts: string[]): string {
  if (parts.length && parts[0] === "")
    return path.join(path.sep, ...parts.slice(1));
  return path.join(...parts);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").substring(0, 255);
}
