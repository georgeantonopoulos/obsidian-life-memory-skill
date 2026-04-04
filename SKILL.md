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

The `obsidian-cli` command at `/usr/local/bin/obsidian-cli` is a **compatibility adapter** over the **official Obsidian CLI** (1.12.7+).
- Runtime requires the **official Obsidian app** to be installed and running
- Adapter forwards note operations to the official CLI while preserving the older OpenClaw command shape
- Vault resolves to `/root/.openclaw/workspace` in this deployment
- Daily notes live in `memory/YYYY-MM-DD.md` via Obsidian daily-notes config
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

## Auto-Categorisation: gizmo-curate

`gizmo-curate` extends the skill with LLM-powered auto-categorisation. Instead of manually deciding where to file new knowledge, pass raw text and the tool decides path, title, tags, and whether to create or append.

### Usage
```bash
# File a person, project, place, or fact automatically
gizmo-curate "Alice Smith is a contractor at Acme Corp, alice@acme.com"

# Preview decision without writing
gizmo-curate --dry-run "some text"

# Pipe mode
echo "some text" | gizmo-curate
```

### How it works
1. Sends text + vault folder structure to Gemini Flash (~1.2s)
2. Gets back: `action` (create/append), `path`, `title`, `tags`, formatted markdown
3. Writes to vault via `obsidian-cli`

### Decision rules
| Content type | Target path |
|---|---|
| Person | `People/firstname-lastname.md` |
| Project fact | `Projects/project-name.md` (appends if exists) |
| Place | `Places/place-name.md` |
| Financial | `Finance/` |
| Vendor/service | `Vendors/` |
| Unsure | `Notes/` |

### Integration points
- **Nightly Memory cron (3am)**: auto-curates up to 3 new entities found in daily note
- **Manual**: call `gizmo-curate` any time during a session for instant filing
- **Coding agents**: `gizmo-curate` available on PATH for Codex/Claude Code to save project context

### Binary
- `/usr/local/bin/gizmo-curate`
- Source: `/root/gizmo_curate.py`
- Requires: `GEMINI_API_KEY` env var (pre-configured in OpenClaw runtime)


---

## Wiki Pattern (Karpathy llm-wiki)

Three workflows for building a compounding personal knowledge base.

### Ingest workflow
When user sends a source (URL/PDF/text) to add to the wiki:
```bash
# 1. Read source (web_fetch, pdf tool, etc.)
# 2. Discuss with user
# 3. Create source summary page
obsidian-cli create path="Sources/YYYY-MM-DD_slug.md" content="# Title

- **Source**: URL
- **Ingested**: date

## Summary
..."

# 4. Update relevant entity pages
obsidian-cli append path="Projects/relevant.md" content="
## Source update YYYY-MM-DD
- key takeaway"

# 5. Update index
obsidian-cli edit path="index.md" find="## Sources" replace="## Sources
- [[Sources/YYYY-MM-DD_slug]] — one-line summary"

# 6. Log it
obsidian-cli append path="log.md" content="
## [YYYY-MM-DD] ingest | Source Title
Pages updated: list"
```

### Query → file back
After producing substantive synthesis (analysis, comparison, research):
```bash
# Offer to file, then:
obsidian-cli create path="Projects/analysis-slug.md" content="# Analysis Title

..."
obsidian-cli append path="log.md" content="
## [YYYY-MM-DD] query | Analysis Title
Filed from conversation."
# Update index.md entry
```

### Lint workflow
```bash
# Check for dead wikilinks, orphan pages, stale MEMORY.md entries
obsidian-cli search-content query="<!-- Stub"  # find stub pages needing content
obsidian-cli read path="index.md"               # audit for missing pages
obsidian-cli append path="log.md" content="
## [YYYY-MM-DD] lint | Weekly health check
Issues: ..."
```

### Key files
| File | Purpose |
|------|---------|
| `index.md` | Catalog of all wiki pages with one-line descriptions |
| `log.md` | Append-only history of ingests/queries/lint passes |
| `Sources/` | One page per external source ingested |
