import * as fs from "node:fs";
import * as path from "node:path";
import type { Hooks, Plugin } from "@opencode-ai/plugin";
import { LogLevel, logger } from "./logger.js";
import {
  initState,
  shouldSendHeartbeat,
  updateLastHeartbeat,
} from "./state.js";
import { ensureCliInstalled, sendHeartbeat } from "./wakatime.js";
import {
  getWakatimeConfigFilePath,
  getWakatimeResourcesDir,
} from "./wakatime-paths.js";

/**
 * Type definitions for OpenCode SDK event parts
 */
interface ToolStateCompleted {
  status: "completed";
  input: Record<string, unknown>;
  output: string;
  title: string;
  metadata: Record<string, unknown>;
  time: { start: number; end: number };
}

interface ToolPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "tool";
  callID: string;
  tool: string;
  state: { status: string } & Partial<ToolStateCompleted>;
}

interface MessagePartUpdatedEvent {
  type: "message.part.updated";
  properties: {
    part: ToolPart | { type: string };
  };
}

/**
 * Type guard to check if an event is a MessagePartUpdatedEvent
 */
function isMessagePartUpdatedEvent(event: {
  type: string;
}): event is MessagePartUpdatedEvent {
  return event.type === "message.part.updated";
}


const processedCallIds = new Set<string>();

/**
 * Represents tracked changes for a single file
 */
export interface FileChangeInfo {
  additions: number;
  deletions: number;
  lastModified: number;
  isWrite: boolean; // true if file was created/overwritten
}


const fileChanges = new Map<string, FileChangeInfo>();


const OPENCODE_VERSION_CACHE = path.join(
  getWakatimeResourcesDir(),
  "opencode-version-cache.json",
);

/**
 * FileDiff structure from opencode's edit tool
 */
interface FileDiff {
  file: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
}

/**
 * Extract file change information from tool metadata
 * Handles various tool types: edit, write, patch, multiedit, read
 */
export function extractFileChanges(
  tool: string,
  metadata: Record<string, unknown> | undefined,
  output: string,
  title?: string,
): Array<{ file: string; info: Partial<FileChangeInfo> }> {
  const changes: Array<{ file: string; info: Partial<FileChangeInfo> }> = [];

  if (!metadata) return changes;

  switch (tool) {
    case "edit": {

      const filediff = metadata.filediff as FileDiff | undefined;
      if (filediff?.file) {
        changes.push({
          file: filediff.file,
          info: {
            additions: filediff.additions ?? 0,
            deletions: filediff.deletions ?? 0,
            isWrite: false,
          },
        });
      } else {

        const filePath = metadata.filePath as string | undefined;
        if (filePath) {
          changes.push({
            file: filePath,
            info: { additions: 0, deletions: 0, isWrite: false },
          });
        }
      }
      break;
    }

    case "write": {

      const filepath = metadata.filepath as string | undefined;
      const exists = metadata.exists as boolean | undefined;
      if (filepath) {
        changes.push({
          file: filepath,
          info: {
            additions: 0,
            deletions: 0,
            isWrite: !exists,
          },
        });
      }
      break;
    }

    case "patch": {

      const diff = metadata.diff as number | undefined;
      const lines = output.split("\n");
      const files: string[] = [];

      for (const line of lines) {

        if (line.startsWith("  ") && !line.startsWith("   ")) {
          const file = line.trim();
          if (file && !file.includes(" ")) {
            files.push(file);
          }
        }
      }


      const perFileDiff =
        files.length > 0 ? Math.round((diff ?? 0) / files.length) : 0;
      for (const file of files) {
        changes.push({
          file,
          info: {
            additions: perFileDiff > 0 ? perFileDiff : 0,
            deletions: perFileDiff < 0 ? Math.abs(perFileDiff) : 0,
            isWrite: false,
          },
        });
      }
      break;
    }

    case "multiedit": {

      const results = metadata.results as
        | Array<{ filediff?: FileDiff }>
        | undefined;
      if (results) {
        for (const result of results) {
          if (result.filediff?.file) {
            changes.push({
              file: result.filediff.file,
              info: {
                additions: result.filediff.additions ?? 0,
                deletions: result.filediff.deletions ?? 0,
                isWrite: false,
              },
            });
          }
        }
      }
      break;
    }

    case "read": {

      if (title) {
        changes.push({
          file: title,
          info: { additions: 0, deletions: 0, isWrite: false },
        });
      }
      break;
    }

    case "glob":
    case "grep":
    case "codesearch": {

      break;
    }

    case "bash": {

      break;
    }
  }

  return changes;
}

/**
 * Process and send heartbeats for tracked file changes.
 * When force is true, awaits all heartbeats to ensure they complete before shutdown.
 */
async function processHeartbeat(
  projectFolder: string,
  opencodeVersion: string,
  opencodeClient: string,
  force: boolean = false,
): Promise<void> {
  if (!shouldSendHeartbeat(force) && !force) {
    logger.debug("Skipping heartbeat (rate limited)");
    return;
  }

  if (fileChanges.size === 0) {
    logger.debug("No file changes to report");
    return;
  }


  const heartbeatPromises: Promise<void>[] = [];


  for (const [file, info] of fileChanges.entries()) {
    const lineChanges = info.additions - info.deletions;
    const promise = sendHeartbeat({
      entity: file,
      projectFolder,
      lineChanges,
      category: "ai coding",
      isWrite: info.isWrite,
      opencodeVersion,
      opencodeClient,
    });

    if (force) {

      heartbeatPromises.push(promise);
    }

    logger.debug(
      `Sent heartbeat for ${file}: +${info.additions}/-${info.deletions} lines`,
    );
  }


  fileChanges.clear();
  updateLastHeartbeat();


  if (force && heartbeatPromises.length > 0) {
    logger.debug(
      `Waiting for ${heartbeatPromises.length} heartbeats to complete...`,
    );
    await Promise.all(heartbeatPromises);
    logger.debug("All heartbeats completed");
  }
}

/**
 * Update tracked file changes
 */
function trackFileChange(file: string, info: Partial<FileChangeInfo>): void {
  const existing = fileChanges.get(file) ?? {
    additions: 0,
    deletions: 0,
    lastModified: Date.now(),
    isWrite: false,
  };

  fileChanges.set(file, {
    additions: existing.additions + (info.additions ?? 0),
    deletions: existing.deletions + (info.deletions ?? 0),
    lastModified: Date.now(),
    isWrite: existing.isWrite || (info.isWrite ?? false),
  });
}

export const plugin: Plugin = async (ctx) => {
  // Read debug setting from ~/.wakatime.cfg (or $WAKATIME_HOME/.wakatime.cfg)
  const wakatimeCfgPath = getWakatimeConfigFilePath();
  try {
    const cfg = fs.readFileSync(wakatimeCfgPath, "utf-8");
    const debugMatch = cfg.match(/^\s*debug\s*=\s*true\s*$/m);
    if (debugMatch) {
      logger.setLevel(LogLevel.DEBUG);
    }
  } catch {

  }

  const { project, worktree, client } = ctx;


  const projectName = path.basename(worktree || project.worktree);


  const projectFolder = worktree || process.cwd();


  const rawClient = process.env.OPENCODE_CLIENT || "cli";
  const opencodeClient = rawClient === "app" ? "web" : rawClient;


  let opencodeVersion = "unknown";
  try {

    const cached = JSON.parse(fs.readFileSync(OPENCODE_VERSION_CACHE, "utf-8"));

    if (cached.version && Date.now() - cached.timestamp < 60_000) {
      opencodeVersion = cached.version;
    }
  } catch {

  }
  if (opencodeVersion === "unknown") {
    try {
      const httpClient =
        (client as any).global._client ?? (client as any)._client;
      const { data } = await httpClient.get({ url: "/global/health" });
      if (data?.version) {
        opencodeVersion = data.version;
        try {
          fs.writeFileSync(
            OPENCODE_VERSION_CACHE,
            JSON.stringify({ version: data.version, timestamp: Date.now() }),
          );
        } catch {

        }
      }
    } catch (err) {
      logger.warn(`Could not fetch OpenCode version: ${err}`);
    }
  }

  logger.debug(
    `OpenCode client: ${opencodeClient}, version: ${opencodeVersion}`,
  );


  initState(projectFolder);


  const cliInstalled = await ensureCliInstalled();

  if (!cliInstalled) {
    logger.warn(
      "WakaTime CLI could not be installed. Please install it manually: https://wakatime.com/terminal",
    );
  } else {
    logger.info(
      `OpenCode WakaTime plugin initialized for project: ${projectName}`,
    );
  }

  const hooks: Hooks = {

    "chat.message": async (_input, _output) => {
      logger.debug("Chat message received");


      if (fileChanges.size > 0) {
        await processHeartbeat(projectFolder, opencodeVersion, opencodeClient);
      }
    },


    event: async ({ event }) => {

      if (isMessagePartUpdatedEvent(event)) {
        const { part } = event.properties;


        if (part.type !== "tool") return;

        const toolPart = part as ToolPart;


        if (toolPart.state.status !== "completed") return;


        if (processedCallIds.has(toolPart.callID)) return;
        processedCallIds.add(toolPart.callID);


        if (processedCallIds.size > 1000) {
          const idsArray = Array.from(processedCallIds);
          for (let i = 0; i < 500; i++) {
            processedCallIds.delete(idsArray[i]);
          }
        }

        const { tool } = toolPart;
        const state = toolPart.state as ToolStateCompleted;
        const { metadata, title, output } = state;

        logger.debug(`Tool executed: ${tool} - ${title}`);


        const changes = extractFileChanges(
          tool,
          metadata as Record<string, unknown>,
          output,
          title,
        );

        for (const change of changes) {

          try {
            if (fs.statSync(change.file).isDirectory()) {
              logger.debug(`Skipping directory: ${change.file}`);
              continue;
            }
          } catch {

          }

          trackFileChange(change.file, change.info);
          logger.debug(
            `Tracked: ${change.file} (+${change.info.additions ?? 0}/-${change.info.deletions ?? 0})`,
          );
        }


        if (changes.length > 0) {
          await processHeartbeat(
            projectFolder,
            opencodeVersion,
            opencodeClient,
          );
        }
      }


      if (event.type === "session.deleted" || event.type === "session.idle") {
        logger.debug(`Session event: ${event.type} - sending final heartbeat`);
        await processHeartbeat(
          projectFolder,
          opencodeVersion,
          opencodeClient,
          true,
        );
      }
    },
  };

  return hooks;
};

export default plugin;
