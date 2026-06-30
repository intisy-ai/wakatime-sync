// Merge plugin config values (api_key, api_url, hide_filenames) into
// ~/.wakatime.cfg (or $WAKATIME_HOME/.wakatime.cfg) without clobbering
// unrelated sections or keys. The file is INI-formatted; we do a minimal
// line-by-line parse that preserves comments and key order.
import * as fs from "node:fs";
import { getPluginConfig } from "./config.js";
import { logger } from "./logger.js";
import { getWakatimeConfigFilePath } from "./wakatime-paths.js";

// ── Minimal INI parser ───────────────────────────────────────────────────────

interface IniSection {
  // Ordered list of raw lines (comments, blanks, key=value) for this section.
  lines: string[];
  // Map of key → index into lines[] for O(1) replacement.
  keyIndex: Map<string, number>;
}

interface ParsedIni {
  // Lines that appear before the first section header (preamble comments, blanks).
  preamble: string[];
  // Ordered section names.
  sectionOrder: string[];
  sections: Map<string, IniSection>;
}

function parseIni(raw: string): ParsedIni {
  const result: ParsedIni = {
    preamble: [],
    sectionOrder: [],
    sections: new Map(),
  };

  let current: IniSection | null = null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();

    // Section header
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const name = trimmed.slice(1, -1).trim();
      if (!result.sections.has(name)) {
        result.sectionOrder.push(name);
        result.sections.set(name, { lines: [], keyIndex: new Map() });
      }
      current = result.sections.get(name)!;
      // Don't store the header line itself — we'll re-emit it.
      continue;
    }

    if (current === null) {
      result.preamble.push(rawLine);
      continue;
    }

    // Key=value line (not a comment, not blank)
    if (trimmed && !trimmed.startsWith(";") && !trimmed.startsWith("#")) {
      const eqIdx = rawLine.indexOf("=");
      if (eqIdx !== -1) {
        const key = rawLine.slice(0, eqIdx).trim();
        current.keyIndex.set(key, current.lines.length);
      }
    }

    current.lines.push(rawLine);
  }

  return result;
}

function setIniKey(ini: ParsedIni, section: string, key: string, value: string): void {
  if (!ini.sections.has(section)) {
    ini.sectionOrder.push(section);
    ini.sections.set(section, { lines: [], keyIndex: new Map() });
  }

  const sec = ini.sections.get(section)!;
  const newLine = `${key} = ${value}`;

  if (sec.keyIndex.has(key)) {
    sec.lines[sec.keyIndex.get(key)!] = newLine;
  } else {
    sec.keyIndex.set(key, sec.lines.length);
    sec.lines.push(newLine);
  }
}

function serializeIni(ini: ParsedIni): string {
  const parts: string[] = [];

  if (ini.preamble.length > 0) {
    parts.push(ini.preamble.join("\n"));
  }

  for (const name of ini.sectionOrder) {
    const sec = ini.sections.get(name)!;
    // Blank line before section unless preamble is empty and it's the first.
    if (parts.length > 0) parts.push("");
    parts.push(`[${name}]`);
    if (sec.lines.length > 0) {
      parts.push(sec.lines.join("\n"));
    }
  }

  // Preserve a trailing newline if the original had one (we always add one).
  return parts.join("\n") + "\n";
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * If any of api_key / api_url / hide_filenames / proxy / hostname /
 * hide_project_names is set in the plugin config, merge those values into
 * ~/.wakatime.cfg (or $WAKATIME_HOME/.wakatime.cfg) under [settings],
 * preserving all other sections and keys.
 *
 * If none of those keys carry a value, the file is not touched.
 */
export function applyPluginConfigToWakatimeCfg(): void {
  const cfg = getPluginConfig();

  const apiKey = String(cfg.api_key ?? "").trim();
  const apiUrl = String(cfg.api_url ?? "").trim();
  const hideFilenames = cfg.hide_filenames === true || cfg.hide_filenames === "true";
  const proxy = String(cfg.proxy ?? "").trim();
  const hostname = String(cfg.hostname ?? "").trim();
  const hideProjectNames = cfg.hide_project_names === true || cfg.hide_project_names === "true";

  if (!apiKey && !apiUrl && !hideFilenames && !proxy && !hostname && !hideProjectNames) {
    return; // nothing to write — leave the file alone
  }

  const cfgPath = getWakatimeConfigFilePath();

  let raw = "";
  try {
    raw = fs.readFileSync(cfgPath, "utf-8");
  } catch {
    // File doesn't exist yet — start with empty content.
  }

  const ini = parseIni(raw);

  if (apiKey) setIniKey(ini, "settings", "api_key", apiKey);
  if (apiUrl) setIniKey(ini, "settings", "api_url", apiUrl);
  if (hideFilenames) setIniKey(ini, "settings", "hidefilenames", "true");
  if (proxy) setIniKey(ini, "settings", "proxy", proxy);
  if (hostname) setIniKey(ini, "settings", "hostname", hostname);
  if (hideProjectNames) setIniKey(ini, "settings", "hide_project_names", "true");

  const merged = serializeIni(ini);

  try {
    fs.writeFileSync(cfgPath, merged, "utf-8");
    logger.debug(`Applied plugin config to ${cfgPath}`);
  } catch (err) {
    logger.warnException(err);
  }
}
