// INI-merge sanity tests for applyPluginConfigToWakatimeCfg().
// Exercises the three new keys (proxy, hostname, hide_project_names) plus
// verifies that unrelated sections and keys survive untouched.
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return { ...actual, homedir: vi.fn(() => actual.homedir()) };
});

// ── Helpers ────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wk2-cfg-test-"));
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function writePluginConfig(values: Record<string, unknown>): void {
  const configDir = path.join(tmpDir, "plugin-home", "config");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "wakatime-sync.json"),
    JSON.stringify(values),
    "utf-8",
  );
}

function wakatimeCfgPath(): string {
  return path.join(tmpDir, "wakatime-home", ".wakatime.cfg");
}

async function runApply(): Promise<void> {
  // Fresh import each test so module-level caches reset.
  const mod = await import("../wakatime-cfg.js");
  mod.applyPluginConfigToWakatimeCfg();
}

function setupEnv(initialCfg?: string): void {
  const wakatimeHome = path.join(tmpDir, "wakatime-home");
  const pluginHome = path.join(tmpDir, "plugin-home");
  fs.mkdirSync(wakatimeHome, { recursive: true });
  fs.mkdirSync(pluginHome, { recursive: true });

  if (initialCfg !== undefined) {
    fs.writeFileSync(wakatimeCfgPath(), initialCfg, "utf-8");
  }

  vi.stubEnv("WAKATIME_HOME", wakatimeHome);
  vi.stubEnv("HUB_OPENCODE_DIR", pluginHome);
  vi.stubEnv("CORE_APP", "opencode");
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("applyPluginConfigToWakatimeCfg", () => {
  it("writes proxy into [settings] when set", async () => {
    setupEnv();
    writePluginConfig({ proxy: "http://proxy.example.com:8080" });

    await runApply();

    const result = fs.readFileSync(wakatimeCfgPath(), "utf-8");
    expect(result).toContain("proxy = http://proxy.example.com:8080");
  });

  it("writes hostname into [settings] when set", async () => {
    setupEnv();
    writePluginConfig({ hostname: "my-machine" });

    await runApply();

    const result = fs.readFileSync(wakatimeCfgPath(), "utf-8");
    expect(result).toContain("hostname = my-machine");
  });

  it("writes hide_project_names = true into [settings] when true", async () => {
    setupEnv();
    writePluginConfig({ hide_project_names: true });

    await runApply();

    const result = fs.readFileSync(wakatimeCfgPath(), "utf-8");
    expect(result).toContain("hide_project_names = true");
  });

  it("preserves unrelated keys and sections during merge", async () => {
    const initial = [
      "; existing config",
      "[settings]",
      "api_key = old-key",
      "debug = true",
      "[internal]",
      "some_key = some_value",
      "",
    ].join("\n");
    setupEnv(initial);
    writePluginConfig({
      proxy: "http://proxy.example.com:8080",
      hostname: "my-machine",
      hide_project_names: true,
    });

    await runApply();

    const result = fs.readFileSync(wakatimeCfgPath(), "utf-8");
    const lines = result.split(/\r?\n/).map((l) => l.trim());

    expect(lines).toContain("proxy = http://proxy.example.com:8080");
    expect(lines).toContain("hostname = my-machine");
    expect(lines).toContain("hide_project_names = true");
    // unrelated keys survive
    expect(lines).toContain("debug = true");
    expect(lines).toContain("some_key = some_value");
    expect(lines).toContain("[internal]");
  });

  it("does not touch the file when no values are set", async () => {
    setupEnv();
    writePluginConfig({});

    await runApply();

    expect(fs.existsSync(wakatimeCfgPath())).toBe(false);
  });

  it("skips proxy/hostname/hide_project_names when left at defaults", async () => {
    setupEnv();
    writePluginConfig({ api_key: "mykey", proxy: "", hostname: "", hide_project_names: false });

    await runApply();

    const result = fs.readFileSync(wakatimeCfgPath(), "utf-8");
    expect(result).not.toContain("proxy");
    expect(result).not.toContain("hostname");
    expect(result).not.toContain("hide_project_names");
    expect(result).toContain("api_key = mykey");
  });
});
