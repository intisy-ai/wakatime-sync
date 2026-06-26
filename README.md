# wakatime-sync

[![npm version](https://img.shields.io/npm/v/wakatime-sync)](https://www.npmjs.com/package/wakatime-sync)
[![npm downloads](https://img.shields.io/npm/dm/wakatime-sync)](https://www.npmjs.com/package/wakatime-sync)
[![CI](https://github.com/intisy-ai/wakatime-sync/actions/workflows/publish.yml/badge.svg)](https://github.com/intisy-ai/wakatime-sync/actions/workflows/publish.yml)

WakaTime integration for both OpenCode and Claude Code from a single codebase. It automatically records the time you spend coding with AI — tracking edited files, line changes, and project activity — and reports it to WakaTime via the official `wakatime-cli`.

## Under-the-Hood Architecture

```mermaid
flowchart TD
    subgraph Entry [dist/index.js — dual-app entry]
        DETECT{argv contains<br/>"claude"?}
    end

    subgraph OpenCode [OpenCode — in-process plugin]
        OC_HOOKS[event / chat.message hooks]
        OC_TRACK[extractFileChanges +<br/>in-memory file buffer]
        OC_HB["sendHeartbeat (--entity file)"]
        OC_HOOKS --> OC_TRACK --> OC_HB
    end

    subgraph Claude [Claude Code — stdin hook process]
        CC_STDIN[parseInput from stdin]
        CC_RATE[per-transcript rate limit]
        CC_HB["syncAiActivity (--sync-ai-activity)"]
        CC_STDIN --> CC_RATE --> CC_HB
    end

    subgraph Shared [Shared core]
        DEPS[dependencies — wakatime-cli install]
        CLI[wakatime-cli spawner]
        OC_HB --> CLI
        CC_HB --> CLI
        DEPS --> CLI
    end

    DETECT -->|no| OpenCode
    DETECT -->|yes| Claude
    CLI -->|HTTPS| WAKATIME[(WakaTime API)]
```

## Structure

- `src/` — TypeScript source (shared core + `claude/` hook handler + OpenCode plugin)
- `dist/` — Compiled output (`dist/index.js` is the single dual-app entry)

## Installation

### Via plugin-updater (recommended)
Add to `~/.config/opencode/config/plugins.json`:
```json
[{ "name": "wakatime-sync", "url": "https://github.com/intisy-ai/wakatime-sync", "enabled": true }]
```

### Via npm
```bash
npm install wakatime-sync
```

Add your WakaTime API key to `~/.wakatime.cfg`:
```ini
[settings]
api_key = your-api-key-here
```
Get your key at https://wakatime.com/settings/api-key.

## Configuration

Config file: `~/.config/opencode/config/wakatime-sync.json` (preferred) or `~/.config/opencode/wakatime-sync.json` (fallback). For Claude Code, replace `opencode` with `claude`.

```json
{
  "logging": true
}
```

## Logging

Logs to `~/.config/opencode/logs/YYYY-MM-DD/wakatime-sync-HH-MM-SS.log` (Claude: under `~/.claude/`).
Set `"logging": false` in config to disable.

## License

MIT
