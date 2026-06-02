# wakatime

WakaTime integration for OpenCode and Claude Code. Automatically tracks coding time, project metrics, and language usage.

## Architecture

```mermaid
flowchart TD
    IDE[OpenCode / Claude Code] -->|Hook: File Save/Edit| PLUGIN[wakatime plugin]
    PLUGIN -->|Bundle telemetry| WAKACLI[WakaTime CLI]
    WAKACLI -->|Sync| API[WakaTime API]
```

## Structure

- `src/` - Shared core logic (currently split into specific wrappers, to be unified)
- `claude/` - Claude Code specific wrappers
- `opencode/` - OpenCode specific wrappers
- `dist/` - Single compiled output supporting both environments

## License

MIT
