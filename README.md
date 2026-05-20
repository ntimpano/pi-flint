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
| `local_recall` | Search notes by text query |
| `local_get` | Get a single note by ID |
| `local_list` | List recent notes |

## Usage

```
# Save a discovery
local_save(content="Found auth pattern in middleware.ts...", title="auth pattern", topic_key="project/auth/middleware")

# Search prior context
local_recall(query="auth middleware pattern")

# Read full note
local_get(id=42)

# Browse recent
local_list(limit=5)
```

## Requirements

- `/opt/flint/flint` binary must be installed (or `flint` on PATH)
