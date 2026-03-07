---
name: obsidian-life-memory
description: Manage an Obsidian-backed personal memory system for an agent: resolve vault, read/search recent context, append daily events, organize notes into a stable taxonomy, distill daily notes into long-term memory, and run graph health audits.
---

# Obsidian Life Memory

Use this skill when the user wants persistent personal memory in an Obsidian vault.

## Core Rules

- Use `obsidian-cli` for **all** note operations — never raw file tools on vault files.
- Read before writing: retrieve recent context first when the request depends on prior facts or decisions.
- Keep edits reversible: prefer `append` or `edit` over full `create` overwrites.
- Preserve privacy: do not publish or exfiltrate vault content unless explicitly requested.

## CLI Setup

The `obsidian-cli` wrapper lives at `/usr/local/bin/obsidian-cli` (bash script, no external deps).
- Vault is hardcoded to `/root/.openclaw/workspace`
- Daily notes live in `memory/YYYY-MM-DD.md`
- Source: `bin/obsidian-cli` in this skill repo

## Essential Commands

### Reading notes
```bash
obsidian-cli read path="MEMORY.md"
obsidian-cli read path="People/george.md"
obsidian-cli daily:read                        # today's daily note
```

### Writing & editing notes
```bash
# Append — \n and \t are interpreted (printf %b)
obsidian-cli daily:append content="## 14:30 UTC\n- Thing happened"
obsidian-cli append path="MEMORY.md" content="\n## New section\n- fact"

# Create — errors if file exists (use force=true to overwrite)
obsidian-cli create path="People/carla.md" content="# Carla\nMortgage broker"
obsidian-cli create path="People/carla.md" content="# Updated" force=true

# Daily create/overwrite
obsidian-cli daily:create content="# Daily Note — $(date -u +%Y-%m-%d)\n\n"

# Find & replace within a note
obsidian-cli edit path="MEMORY.md" find="🟡 PENDING" replace="✅ DONE"
obsidian-cli edit path="MEMORY.md" find="status: (open)" replace="status: closed" regex=true
```

### Browsing the vault
```bash
obsidian-cli list folder="People"              # list .md files in a folder
obsidian-cli list folder="Projects"
obsidian-cli list folder="."                   # vault root
obsidian-cli status                            # vault overview + folder counts
```

### Moving & deleting
```bash
# Move + updates [[wikilinks]] across the vault when filename changes
obsidian-cli move path="old/note.md" to="new/note.md"

# Delete
obsidian-cli delete path="Archive/stale.md"
```

### Searching
```bash
obsidian-cli search query="Athens"             # search by filename
obsidian-cli search-content query="Moraitis"   # full-text with context lines
obsidian-cli search-content query="lease" max=5 context=5
```

### Vault path
```bash
obsidian-cli print-default                     # workspace (/path/to/vault)
obsidian-cli print-default --path-only         # /path/to/vault
```

## Workflow

### 1) Session startup
```bash
obsidian-cli read path="SOUL.md"
obsidian-cli read path="USER.md"
obsidian-cli daily:read
obsidian-cli read path="MEMORY.md"   # main sessions only
```

### 2) Log events
```bash
obsidian-cli daily:append content="## $(date -u +%H:%M) UTC\n- <event>"
```

### 3) Update long-term notes
```bash
obsidian-cli append path="MEMORY.md" content="\n## New section\n- fact"
# or targeted edit:
obsidian-cli edit path="MEMORY.md" find="old status" replace="new status"
```

### 4) Maintain knowledge graph
```bash
obsidian-cli list folder="People"              # check coverage
obsidian-cli search-content query="[[Person]]" # find references
obsidian-cli move path="People/old.md" to="People/correct-name.md"
```

## Note on `\n` in content

All write commands (`append`, `create`, `daily:append`, `daily:create`) use `printf '%b'` internally, which interprets:
- `\n` → newline
- `\t` → tab

So pass multi-line content as: `content="## Heading\n- item one\n- item two"`

## Resources

- CLI binary: `/usr/local/bin/obsidian-cli`
- Source: `bin/obsidian-cli` (this repo)
- Vault path: `/root/.openclaw/workspace`
- Daily notes: `/root/.openclaw/workspace/memory/YYYY-MM-DD.md`
