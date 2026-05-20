# @ntimpano/pi-flint

[flint](https://github.com/ntimpano/flint) memory tools for Pi coding agent. Persist and recall context via local SQLite — no bash hacks needed.

## Install

```bash
pi install ./path/to/pi-flint
# or from git once published:
# pi install git:github.com/ntimpano/pi-flint
# pi install npm:@ntimpano/pi-flint
```

## Tools

| Tool | Description |
|------|-------------|
| `flint_save` | Save a note to local SQLite |
| `flint_recall` | Search notes by text query |
| `flint_get` | Get a single note by ID |
| `flint_list` | List recent notes |

## Usage

```
# Save a discovery
flint_save(content="Found auth pattern in middleware.ts...", title="auth pattern", topic_key="project/auth/middleware")

# Search prior context
flint_recall(query="auth middleware pattern")

# Read full note
flint_get(id=42)

# Browse recent
flint_list(limit=5)
```

## Requirements

- `/opt/flint/flint` binary must be installed
