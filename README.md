# obsidian-life-memory-skill

Transform your OpenClaw workspace into a **structured, navigable memory system** using plain Markdown, with **official Obsidian desktop + official Obsidian CLI** as the runtime path.

> ⚠️ **Important:** This skill now assumes the **official Obsidian app is installed and running**.
>
> The shipped `bin/obsidian-cli` is **not** a standalone vault editor anymore — it is a thin **compatibility adapter** for OpenClaw that forwards commands to the **official Obsidian 1.12.7+ CLI** while preserving the older command shape (`read path=...`, `daily:read`, `search-content`, etc.).

This skill provides persistent personal memory for AI agents through wikilinked notes, daily logs, backlink traversal, and graph-based context retrieval.

## What It Does

This skill helps agents maintain continuity across sessions by organizing information into an Obsidian vault with:

- **Daily notes** — Timestamped logs of events, decisions, and context
- **Wikilinked entities** — People, projects, and concepts as connected nodes (`[[Project Name]]`, `[[Person]]`)
- **Long-term memory** — Distilled summaries from daily noise
- **Automatic context injection** — Pre-prompt hook loads relevant context at session start

---

## `obsidian-cli` — Compatibility Adapter over the Official CLI

The skill ships `bin/obsidian-cli` and installs it to `/usr/local/bin/obsidian-cli`, but that file is now a **compatibility adapter**.

Under the hood it calls the **official Obsidian CLI** from the desktop installer (tested with **1.12.7**) and preserves the older OpenClaw-friendly command shape used throughout the vault and hooks.

**The golden rule: all vault reads and writes go through `obsidian-cli`. Never use raw file tools on vault files.**

### Runtime requirements

- **Official Obsidian desktop installed** (1.12.7+ recommended)
- **Official Obsidian CLI available** (bundled with the installer)
- Obsidian app **running**
- In root/headless environments: start Obsidian with `--no-sandbox` and usually `DISPLAY=:99`

### What the adapter does

- maps old commands like `read`, `daily:read`, `search-content`, `list`, `print-default` onto the official CLI
- keeps daily-note operations pointed at `memory/YYYY-MM-DD.md` by relying on Obsidian's daily-notes config
- performs safer `edit` operations through read/replace/write instead of brittle `sed` escaping
- lets OpenClaw tools keep using the same command surface while the backend is official Obsidian

### Installation

1. Install/update **official Obsidian 1.12.7+**
2. Start the app and ensure the target vault is opened
3. Set Obsidian daily notes folder to **`memory`** for this workflow
4. Install the adapter:

```bash
cp bin/obsidian-cli /usr/local/bin/obsidian-cli
chmod +x /usr/local/bin/obsidian-cli
```

If needed, point the adapter at the bundled official CLI by editing `OFFICIAL_CLI=` or setting up the same path used on the host.

### Command Reference

#### Reading

```bash
obsidian-cli read path="MEMORY.md"
obsidian-cli read path="People/alice.md"
obsidian-cli daily:read                         # today's daily note
```

#### Writing & Editing

> **`\n` is interpreted** — all write commands use `printf '%b'` internally, so `\n` becomes a real newline, `\t` becomes a tab.

```bash
# Append — adds content with a leading newline for clean separation
obsidian-cli daily:append content="## 14:30 UTC\n- Meeting with client went well"
obsidian-cli append path="MEMORY.md" content="\n## New section\n- important fact"

# Create — errors if file exists to prevent accidents
obsidian-cli create path="People/alice.md" content="# Alice\nEngineer at Acme Corp"
obsidian-cli create path="People/alice.md" content="# Alice\nUpdated bio" force=true

# Daily create/overwrite
obsidian-cli daily:create content="# Daily Note — $(date -u +%Y-%m-%d)\n\n"

# Find & replace within a note
obsidian-cli edit path="MEMORY.md" find="🟡 PENDING" replace="✅ DONE"
# Regex mode:
obsidian-cli edit path="Projects/alpha.md" find="status: (open|pending)" replace="status: closed" regex=true
```

#### Browsing

```bash
obsidian-cli list folder="People"               # list .md files in a folder
obsidian-cli list folder="Projects"
obsidian-cli list folder="."                    # vault root
obsidian-cli status                             # vault overview + folder counts
```

#### Moving & Deleting

```bash
# move: renames file AND updates [[wikilinks]] across the entire vault
obsidian-cli move path="People/old-name.md" to="People/correct-name.md"

obsidian-cli delete path="Archive/stale-note.md"
```

#### Searching

```bash
obsidian-cli search query="project"             # search by filename
obsidian-cli search-content query="invoice"     # full-text with context lines
obsidian-cli search-content query="meeting" max=5 context=5
```

#### Vault info

```bash
obsidian-cli print-default                      # workspace (/path/to/vault)
obsidian-cli print-default --path-only          # /path/to/vault
obsidian-cli status                             # overview
```

---

## Vault Taxonomy

```
workspace/
├── IDENTITY.md              # Who the agent is (name, vibe, emoji)
├── USER.md                  # Who the human is (preferences, context)
├── SOUL.md                  # Behavioral guidelines and boundaries
├── MEMORY.md                # Long-term distilled knowledge
├── HEARTBEAT.md             # System status and maintenance config
├── AGENTS.md                # Workspace rules and tool usage
│
├── memory/                  # Daily notes (YYYY-MM-DD.md)
│   ├── 2026-03-06.md
│   └── 2026-03-07.md
│
├── People/                  # Real people the human interacts with
│   └── alice.md
│
├── Projects/                # Active projects with backlinks
│   └── project-alpha.md
│
├── Places/                  # Real locations
│   └── city.md
│
└── Archives/                # Completed/cold projects
```

## Session Startup Sequence

Every session, agents should:

```bash
obsidian-cli read path="SOUL.md"
obsidian-cli read path="USER.md"
obsidian-cli daily:read
# Main sessions only (direct chat with the human):
obsidian-cli read path="MEMORY.md"
```

## Heartbeat Gardening (optional)

A heartbeat cron can maintain a lightweight knowledge graph. Typical behaviour:
- reads recent `memory/YYYY-MM-DD.md`
- updates/creates nodes under `Projects/`, `People/`, `Places/`
- silent unless something urgent surfaces (deadline within 24h, new blocker)
- never auto-edits governance/system files (`SOUL.md`, `AGENTS.md`, etc.)

See `HEARTBEAT.md` in your vault for configuration.

---

## Token-Optimized Pre-Prompt Hook

`hooks/obsidian-preprompt.js` runs at every session start to inject context without inflating tokens as daily logs grow.

| Scenario | Behaviour | Tokens |
|----------|-----------|--------|
| First session | Read full daily note, build summary, cache | ~3000 |
| No changes | Return cached snapshot instantly | ~3000 |
| New content | Compute delta, prepend "Since you last spoke:" | ~3000 |

---

## Repository Layout

```
obsidian-life-memory-skill/
├── SKILL.md                           # Agent-facing skill definition
├── README.md                          # This file
├── bin/
│   └── obsidian-cli                   # Compatibility adapter over official Obsidian CLI
├── hooks/
│   └── obsidian-preprompt.js          # Token-optimized bootstrap hook
├── scripts/
│   ├── life_memory.py                 # Python vault helper
│   ├── sync_live_copy.sh              # Deploy skill updates safely
│   ├── auto_sync_from_origin.sh       # Auto-pull from git origin
│   └── fix_deadends.py                # Fix broken [[wikilinks]]
├── agents/                            # Agent prompt fragments
├── templates/                         # Note templates
├── tests/                             # Tests
└── references/
    ├── life-patterns.md               # Daily note patterns
    └── obsidian-cli-notes.md          # CLI usage notes
```

## Requirements

- Official Obsidian desktop 1.12.7+
- Official Obsidian CLI (bundled with the installer)
- bash (for the compatibility adapter)
- Python 3.10+ (optional helper scripts)
- Node.js 18+ (pre-prompt hook)

## License

MIT


## Prompt hook split

`hooks/obsidian-preprompt.js` now handles **two distinct prompt-injection paths**:

### 1) Session start (`agent:bootstrap`)
- injects bounded orientation context once per session
- includes governance files plus a daily/open-items snapshot
- optimized for startup orientation, not message-specific recall

### 2) Per-turn retrieval (`before_prompt_build`)
- runs on every normal prompt
- derives **1–3 focused retrieval queries** from the current user message
- retrieves a **small bounded set of snippets** from the vault
- injects those snippets as targeted context for the current turn
- if the prompt looks like a correction/update, it also injects **possible write targets / edit hints**
- **does not auto-write** to the vault

### Design goals
- keep session-start orientation broad but bounded
- keep per-turn retrieval cheap and prompt-targeted
- separate retrieval from mutation
- let the assistant explicitly decide whether to call `obsidian_edit`, `obsidian_append`, or `obsidian_create` later

### Current limitations
- ranking is heuristic and still stronger on entity/status prompts than on fuzzy date-heavy prompts like “what do I need to do tomorrow?”
- retrieval intentionally prefers small snippets over full-note dumps
- the hook avoids governance/system-file mutation and never writes by itself

### Example prompt categories validated
- status lookup for a named project / financial item
- factual correction or update message
- near-term planning query (for example, asking what needs doing next)
- drafting a message to a known contact
