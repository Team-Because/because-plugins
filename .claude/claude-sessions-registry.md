# Claude Code Sessions Registry

Manage 15-20 named Claude Code sessions across terminals without using the `/resume` picker.
Registry file: `~/.claude/named-sessions.json`

---

## Registered Sessions

> Auto-synced on every `ccs add`, `ccs rename`, `ccs remove`, and `ccs sync`.

| Name | PID | Status | Created | Last Used | Msgs | Description |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | No sessions registered for this project yet |
---
## Quick Reference

| Command | What it does |
|---|---|
| `ccs list` | Show all named sessions with live/idle status, created date, last used, message count |
| `ccs pids` | Show all running Claude processes with PIDs |
| `ccs open <name>` | Resume a session by name |
| `ccs add <name> <pid>` | Register a session using its PID |
| `ccs add <name> <session-id>` | Register using full session ID |
| `ccs add <name> <pid> "<desc>"` | Register with a custom description |
| `ccs update <name> "<desc>"` | Update description of an existing session |
| `ccs rename <old> <new>` | Rename a session |
| `ccs remove <name>` | Delete a session from registry |
| `ccs sync` | Force-rebuild the registry table in this file from JSON |
| `ccs sessions` | Browse last 30 sessions from history |

---

## Notes

1. `ccs open` must be run outside an active Claude Code session.
2. All other commands work both in terminal and inside Claude Code via `!`.
3. `○ idle` means the terminal process ended but the session is still resumable.
4. Session names are case-sensitive. Use lowercase kebab-case.
5. The Registered Sessions table is auto-maintained — never edit it manually. Run `ccs sync` if it looks stale.
6. This file was created on 19-10-2026.
