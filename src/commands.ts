// Cross-app slash-commands for wakatime-sync (deployed to both opencode and
// Claude Code by core's deployCommands) plus the CLI actions behind them. The
// commands shell into this same bundle (`node <bundle> <action>`), so there is
// no separate artifact to ship — maybeRunCli runs the action and the process exits.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { configCommand, runConfigCli, type CommandDef } from "../core/src/index.js";
import { dependencies } from "./dependencies.js";

export const WAKATIME_COMMANDS: CommandDef[] = [
  configCommand("wakatime-sync"),
  {
    name: "wakatime",
    description: "Show today's WakaTime coding activity",
    shell: 'node "{{BUNDLE}}" today',
    body: "Above is today's WakaTime coding total. Report it to the user concisely.",
  },
];

// Print today's tracked time via the installed wakatime-cli (`--today`).
function runToday(): Promise<void> {
  return new Promise((resolve) => {
    const cli = dependencies.getCliLocation();
    if (!cli || !existsSync(cli)) {
      console.log("WakaTime CLI is not installed yet — run a session first, then retry.");
      return resolve();
    }
    execFile(cli, ["--today"], { windowsHide: true }, (err, stdout, stderr) => {
      if (err) console.log(`Could not read today's time: ${stderr || err.message}`);
      else console.log(`Today: ${stdout.trim() || "no activity recorded yet"}`);
      resolve();
    });
  });
}

// If invoked as `node <bundle> <action>`, run that action and return true so the
// entry exits. Returns false on a normal plugin load (no recognized action).
export async function maybeRunCli(pluginName: string): Promise<boolean> {
  const argv = process.argv.slice(2);
  if (argv[0] === "config") {
    runConfigCli(pluginName, argv.slice(1));
    return true;
  }
  if (argv[0] === "today") {
    await runToday();
    return true;
  }
  return false;
}
