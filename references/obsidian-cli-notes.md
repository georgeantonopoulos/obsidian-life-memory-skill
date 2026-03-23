# Obsidian CLI Notes

This skill assumes the official Obsidian CLI is available and that OpenClaw calls it through the compatibility adapter at `/usr/local/bin/obsidian-cli`.

## Commands used by this skill

- `obsidian read path=<note.md>` / `obsidian read file=<name>`
- `obsidian daily:read`, `obsidian daily:append content=<text>`
- `obsidian search query=<q>` and `obsidian search:context query=<q>`
- Graph checks when available: `unresolved`, `orphans`, `deadends`

## Runtime notes

- When running as root, Obsidian should be started with `--no-sandbox`.
- In headless environments, a display such as `:99` is often required for the app process.
- Obsidian 1.12.7 changed the CLI socket path on macOS/Linux; use the matching official app+CLI pair.
- Override binary path with `OBSIDIAN_BIN=/full/path/to/obsidian-cli` when calling the official CLI directly.
