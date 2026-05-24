# @ntimpano/pi-flint

[flint](https://github.com/ntimpano/flint) memory tools for Pi coding agent. Persist and recall context via local SQLite — no bash hacks needed.

## Install

```bash
pi install npm:@ntimpano/pi-flint
```

Or from source:

```bash
pi install ./path/to/pi-flint
```

## Tools

| Tool | Description |
|------|-------------|
| `local_save` | Save a note to local SQLite |
| `local_recall` | Search notes by text query (scoped to active project) |
| `local_get` | Get a single note by ID |
| `local_list` | List recent notes (supports cross-project) |

## Compaction Recovery

The extension hooks into Pi's lifecycle events to preserve context across session compactions:

- **`session_compact`** — Saves the compaction summary to flint via `flint recovery save`.
- **`before_agent_start`** — Checks for a pending recovery note via `flint recovery get`. If found, injects it into the agent's context as a system message, then clears the note via `flint recovery clear`.

This ensures that after a compaction, the next agent session can recover what was accomplished previously.

## Usage

```
# Save a discovery
local_save(content="Found auth pattern in middleware.ts...", title="auth pattern", topic_key="project/auth/middleware")

# Search prior context (always scoped to active project)
local_recall(query="auth middleware pattern")

# Search with type filter
local_recall(query="freshrss", type="bug")

# Read full note
local_get(id=42)

# Browse recent notes across all projects
local_list(limit=5, all_projects=true)
```

## Important: recall scoping

`local_recall` is **always scoped to the active project**. This is by design — the `flint recall` CLI command filters results by the project associated with the current working directory, which keeps search results relevant and avoids noise from unrelated projects.

If you need to search across all projects:

1. Use `local_list(all_projects=true)` to browse recent notes globally.
2. Find the note ID you need from the list.
3. Use `local_get(id=...)` to read the full content.

## Parameters

### local_recall

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | ✅ | Search query text |
| `type` | ❌ | Filter by note type (decision, bug, discovery, session-state, research, architecture) |
| `since` | ❌ | Filter notes since date (YYYY-MM-DD) |
| `until` | ❌ | Filter notes until date (YYYY-MM-DD) |
| `limit` | ❌ | ⚠️ Deprecated — not supported by the flint CLI. Accepted for API compat but ignored. |
| `all_projects` | ❌ | ⚠️ Deprecated — recall is always project-scoped. Accepted for API compat but ignored. |

### local_list

| Parameter | Required | Description |
|-----------|----------|-------------|
| `limit` | ❌ | Max results (default 10) |
| `all_projects` | ❌ | Include notes from all projects (default: active project only) |

### local_save

| Parameter | Required | Description |
|-----------|----------|-------------|
| `content` | ✅ | Note content |
| `title` | ❌ | Short descriptive title |
| `topic_key` | ❌ | Hierarchical key (e.g. `sdd/my-change/spec`) |
| `scope` | ❌ | Project or user scope identifier |
| `type` | ❌ | Note type: decision, discovery, bug, session-state, research, architecture |

### local_get

| Parameter | Required | Description |
|-----------|----------|-------------|
| `id` | ✅ | Note ID (numeric) |

## Architecture

Single entry point: `index.ts` registers all tools and compaction recovery hooks with Pi's extension API. All tools call the `flint` CLI binary via `spawn()` — no direct SQLite access.

Binary resolution order: `FLINT_BIN` env → `~/.local/bin/flint` → `/opt/flint/flint` → fallback to `flint` on PATH.

## Requirements

- `flint` binary must be installed and on PATH, or at `~/.local/bin/flint`, or at `/opt/flint/flint`, or set via `FLINT_BIN` env var.
- [flint](https://github.com/ntimpano/flint) v0.1.0+

## Changelog

### v0.2.1 — 2025-05-24

**Bug fix: `local_recall` query corruption**

The `flint recall` CLI command does not support `--all-projects` or a positional `limit` argument. Previously, both were passed as CLI args, causing them to be silently absorbed into the search query string. For example, `flint recall "freshrss" --all-projects` would search for `"freshrss" OR "--all-projects"` in FTS5, returning irrelevant or empty results.

Changes:
- Removed `--all-projects` flag from `local_recall` args. Recall is always scoped to the active project.
- Removed positional `limit` from `local_recall` args. The flint CLI uses a fixed limit of 10.
- Reordered args: flags (`--type=`, `--since=`, `--until=`) now precede the query string, matching the CLI parser expectations.
- `limit` and `all_projects` parameters are kept for API compatibility but marked as deprecated and ignored.

### v0.2.0 — 2025-05-23

**Added: Compaction recovery hooks + consolidated entry point**

- `session_compact` hook saves compaction summary to flint for context recovery.
- `before_agent_start` hook injects recovery note into agent context on next session start, then clears it.
- Consolidated extension into single `index.ts` entry point (removed `extensions/` directory).
- `local_save` now returns the note ID from flint CLI output.
- `local_recall` and `local_list` now parse and format JSON output from flint CLI.
- `local_get` returns structured note with metadata (title, topic_key, created_at, updated_at).
- Binary resolution now checks `FLINT_BIN` env, `~/.local/bin/flint`, `/opt/flint/flint`, then PATH fallback.
- `local_list` defaults to `all_projects=true` unless explicitly set to false.