import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getWakatimeResourcesDir } from "./wakatime-paths.js";

export interface State {
  lastHeartbeatAt?: number;
}

let stateFile = path.join(getWakatimeResourcesDir(), "opencode.json");

/**
 * Initialize state with a project-specific identifier.
 * Creates a hash of the project folder to isolate rate limiting per project.
 */
export function initState(projectFolder: string): void {
  const hash = crypto
    .createHash("md5")
    .update(projectFolder)
    .digest("hex")
    .slice(0, 8);
  stateFile = path.join(getWakatimeResourcesDir(), `opencode-${hash}.json`);
}

export function readState(): State {
  try {
    const content = fs.readFileSync(stateFile, "utf-8");
    return JSON.parse(content) as State;
  } catch {
    return {};
  }
}

export function writeState(state: State): void {
  try {
    const dir = path.dirname(stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch {
    /* never crash on state write failure */
  }
}

export function timestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function shouldSendHeartbeat(force: boolean = false): boolean {
  if (force) return true;

  try {
    const state = readState();
    const lastHeartbeat = state.lastHeartbeatAt ?? 0;

    return timestamp() - lastHeartbeat >= 60;
  } catch {
    return true;
  }
}

export function updateLastHeartbeat(): void {
  writeState({ lastHeartbeatAt: timestamp() });
}
