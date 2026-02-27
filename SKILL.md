---
name: obsidian-life-memory
description: Manage an Obsidian-backed personal memory system for an agent: resolve vault, read/search recent context, append daily events, organize notes into a stable taxonomy, distill daily notes into long-term memory, and run graph health audits.
---

# Obsidian Life Memory

Use this skill when the user wants persistent personal memory in an Obsidian vault.

## Core Rules

- Use the native `obsidian-cli` wrapper for all note operations — it talks directly to the running Obsidian 1.12.4 (Catalyst) instance.
- Read before writing: retrieve recent context first when the request depends on prior facts or decisions.
- Keep edits reversible: run organization in dry-run mode first, then apply.
- Preserve privacy: do not publish or exfiltrate vault content unless explicitly requested.

## CLI Setup

The `obsidian-cli` wrapper at `/usr/local/bin/obsidian-cli` invokes the native Obsidian CLI:
- Obsidian runs headless via `systemd` service `obsidian-headless`
- `DISPLAY=:99` (Xvfb), `--no-sandbox` (root), `--user-data-dir=/tmp/.config/obsidian`
- Config with `"cli":true` at `/root/.config/obsidian/obsidian.json` (auto-copied to user-data-dir on each call)

If the service is not running: `systemctl start obsidian-headless && sleep 8`

## Essential Commands

### Vault info
```bash
obsidian-cli vault                          # name, path, file/folder counts, size
obsidian-cli files total                    # total file count
obsidian-cli folders                        # list all folders
```

### Reading notes
```bash
obsidian-cli read path="Daily/2026-02-27.md"
obsidian-cli daily:read                     # read today's daily note
obsidian-cli search query="Athens move"     # full-text search
obsidian-cli search:context query="Moraitis" # search with surrounding lines
```

### Writing notes
```bash
obsidian-cli daily:append content="## 14:30 UTC\n- Thing happened"
obsidian-cli append path="MEMORY.md" content="New fact"
obsidian-cli prepend path="Projects/athens.md" content="# Update"
obsidian-cli create path="People/carla.md" content="# Carla Corbisiero\nMortgage broker"
obsidian-cli create path="Daily/2026-02-27.md" template="Daily Note"
```

### Graph health
```bash
obsidian-cli orphans total                  # files with no incoming links
obsidian-cli orphans                        # list orphan files
obsidian-cli deadends total                 # files with no outgoing links
obsidian-cli unresolved total               # count of broken [[wikilinks]]
obsidian-cli unresolved verbose             # list with source files
```

### Tags & properties
```bash
obsidian-cli tags counts sort=count         # tag frequency
obsidian-cli properties                     # all frontmatter properties
obsidian-cli property:set name="status" value="done" path="Projects/foo.md"
```

### Tasks
```bash
obsidian-cli tasks todo                     # all incomplete tasks in vault
obsidian-cli tasks done                     # completed tasks
obsidian-cli task path="MEMORY.md" line=12 toggle  # toggle a specific task
```

### Files & navigation
```bash
obsidian-cli files folder="Projects"        # list files in folder
obsidian-cli move path="old.md" to="Archive/old.md"
obsidian-cli delete path="junk.md"
obsidian-cli rename path="note.md" name="better-name.md"
```

### Plugins & commands
```bash
obsidian-cli plugins                        # list all plugins
obsidian-cli commands filter="dataview"     # find command IDs
obsidian-cli command id="dataview:..."      # execute a command
obsidian-cli eval code="return app.vault.getName()"  # arbitrary JS
```

## Workflow

### 1) Read context before writing
```bash
obsidian-cli daily:read
obsidian-cli search query="<topic>"
```

### 2) Log events
```bash
obsidian-cli daily:append content="## $(date -u +%H:%M) UTC\n- <event>"
```

### 3) Create/update long-term notes
```bash
obsidian-cli read path="MEMORY.md"
obsidian-cli append path="MEMORY.md" content="\n## New section\n- fact"
```

### 4) Vault health audit
```bash
obsidian-cli orphans total
obsidian-cli unresolved total
obsidian-cli deadends total
```
Fix broken wikilinks: `python3 obsidian-life-memory-skill/scripts/fix_deadends.py --apply --limit 60`

### 5) Distill daily → long-term (nightly)
Use the nightly cron (Gemini 3 Flash, 3 AM UK) which runs the 5-phase consolidation prompt.

## Resources

- Wrapper: `/usr/local/bin/obsidian-cli`
- Fix deadends script: `scripts/fix_deadends.py`
- Obsidian headless service: `systemctl status obsidian-headless`
- Vault path: `/root/.openclaw/workspace`
- Vault ID: `c8736eac4e90066e`
