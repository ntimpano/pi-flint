# Project Map: pi-flint

## Core Files
- `index.ts` — Single entry point: registers 4 tools (`local_save`, `local_recall`, `local_get`, `local_list`) + compaction recovery hooks (`session_compact`, `before_agent_start`) + TUI render callbacks
- `package.json` — NPM package `@ntimpano/pi-flint` v0.2.1, peerDeps on `pi-coding-agent`, `pi-tui`, `typebox`. Extension path: `./index.ts`
- `README.md` — Docs: install, tools, compaction recovery, usage, recall scoping, parameters, architecture, changelog
- `logo.svg` — Package logo

## Dependency Chain
```
pi-coding-agent (ExtensionAPI, AgentToolResult)
  └── index.ts
       ├── typebox (Type.Object for tool schemas)
       ├── node:child_process (spawn flint binary)
       ├── node:fs (existsSync for binary resolution)
       ├── node:path (join for binary resolution)
       ├── node:os (homedir for binary resolution)
       └── pi-tui (Text — tool render callbacks)
```

## Key Patterns
- **CLI wrapper pattern:** All tools call the `flint` binary via `spawn()`. No direct SQLite access.
- **Binary resolution:** `FLINT_BIN` env → `existsSync` checks (`~/.local/bin/flint`, `/opt/flint/flint`) → fallback to `"flint"` on PATH
- **Tool namespacing:** All registered as `local_save`, `local_recall`, `local_get`, `local_list` (not `flint_*`)
- **JSON parsing:** Tools parse flint CLI JSON output for structured results (note IDs, formatted lists, metadata)
- **Compaction recovery:** Hooks into Pi lifecycle events:
  - `session_compact` → `flint recovery save --summary "<summary>"` (saves to topic_key `session/compaction-recovery`)
  - `before_agent_start` → `flint recovery get` → injects as system message → `flint recovery clear` (one-shot)
- **Deprecation guards:** `local_recall` accepts `limit` and `all_projects` for API compat but strips them before passing to CLI (query corruption fix v0.2.1)
- **`local_list` default:** `all_projects=true` unless explicitly set to `false`

## Flint CLI Recovery Protocol
```
flint recovery save --summary "..."  → saves note with type="recovery", topic_key="session/compaction-recovery"
flint recovery get                   → recalls latest note with that topic_key
flint recovery clear                 → deletes the recovery note
```

## Removed
- `extensions/index.ts` — Consolidated into root `index.ts` in v0.2.0. The root version now includes all features (recovery hooks, JSON parsing, better binary resolution, structured error handling).

## Last Updated
2026-05-23