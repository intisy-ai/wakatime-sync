// Universal plugin contract (shared across the ecosystem via core's test-kit):
// the /<plugin>-config CLI round-trips, the slash-commands deploy, and each action
// command runs cleanly — all in isolated temp homes.
import { runPluginContract } from "../../core/src/testing.js";

runPluginContract({
  name: "wakatime-sync",
  entry: "dist/index.js",
  configName: "wakatime-sync",
  app: "both",
  commands: ["wakatime", "wakatime-sync-config"],
  deploy: "load",
  actions: [["today"]],
  readme: true,
});
