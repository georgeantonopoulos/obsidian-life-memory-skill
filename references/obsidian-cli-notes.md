# Obsidian CLI Notes

This skill assumes the Obsidian CLI binary is available as `obsidian`.

## Commands used by this skill

- `obsidian search query=<q> matches`
- `obsidian read file=<note.md>` or `obsidian read path=<path>`
- `obsidian daily:append content=<text> silent`
- Graph checks when available: `unresolved`, `orphans`, `deadends`

## Runtime notes

- When running as root, `--no-sandbox` is required.
- In headless environments, a display such as `:99` may be required.
- Override binary path with `OBSIDIAN_BIN=/full/path/to/obsidian`.
