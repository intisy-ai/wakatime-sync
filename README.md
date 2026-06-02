# plugin-wakatime

WakaTime integration for OpenCode and Claude Code. Automatically tracks coding time, project metrics, and language usage.

## Under-the-Hood Architecture

```mermaid
flowchart TD
    %% Editor Integrations
    subgraph Editor_Hooks [Editor Integration Hooks]
        CC_HOOK[Claude Code File Edit/Save Hook]
        OC_HOOK[OpenCode FS/Edit Hook]
    end

    %% Core Application
    subgraph Tracker_Core [WakaTime Tracker Core (src/)]
        EVENT_BUFFER[Event Debounce Buffer]
        PAYLOAD_BUILDER[Heartbeat Payload Builder]
        CLI_SPAWNER[wakatime-cli Spawner]
        
        CC_HOOK -->|Raw edit event| EVENT_BUFFER
        OC_HOOK -->|Raw edit event| EVENT_BUFFER
        
        EVENT_BUFFER -->|2-min heartbeat| PAYLOAD_BUILDER
        PAYLOAD_BUILDER -->|Construct args| CLI_SPAWNER
    end

    %% External
    subgraph External_WakaTime [WakaTime Ecosystem]
        WAKATIME_CLI[WakaTime Native CLI (.wakatime/)]
        WAKATIME_API[WakaTime Cloud API]
        
        CLI_SPAWNER -->|Executes CLI| WAKATIME_CLI
        WAKATIME_CLI -->|HTTPS POST| WAKATIME_API
    end
```

## Structure

- `src/` - Shared core logic (currently split into specific wrappers, to be unified)
- `claude/` - Claude Code specific wrappers
- `opencode/` - OpenCode specific wrappers
- `dist/` - Single compiled output supporting both environments

## License

MIT
