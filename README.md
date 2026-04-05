# obsidian-life-memory-skill

Transform your OpenClaw workspace into a **structured, navigable memory system** using plain Markdown, with **official Obsidian desktop + official Obsidian CLI** as the runtime path.

> ⚠️ **Important:** This skill now assumes the **official Obsidian app is installed and running**.
>
> The shipped `bin/obsidian-cli` is **not** a standalone vault editor anymore — it is a thin **compatibility adapter** for OpenClaw that forwards commands to the **official Obsidian 1.12.7+ CLI** while preserving the older command shape (`read path=...`, `daily:read`, `search-content`, etc.).

This skill provides persistent personal memory for AI agents through wikilinked notes, daily logs, backlink traversal, and graph-based context retrieval.

---

## What It Does

This skill helps agents maintain continuity across sessions by organizing information into an Obsidian vault with:

- **Daily notes** — Timestamped logs of events, decisions, and context
- **Wikilinked entities** — People, projects, and concepts as connected nodes (`[[Project Name]]`, `[[Person]]`)
- **Long-term memory** — Distilled summaries from daily noise
- **Automatic context injection** — Pre-prompt hook loads relevant context at session start
- **Auto-categorisation** — `gizmo-curate` files raw text into the right vault location automatically

---

## gizmo-curate: Auto-Categorisation

`gizmo-curate` is a companion tool that uses an LLM to auto-categorise raw text and file it into the correct vault location. Pass raw text → LLM decides path, title, and tags → writes via `obsidian-cli`. No manual path decisions needed.

```bash
# File a person automatically
gizmo-curate "Alice Smith is a contractor at Acme Corp, alice@acme.com"
# → creates People/alice-smith.md ✅

# Append to an existing project note
gizmo-curate "Project Alpha: v2 integration in progress, review scheduled Friday"
# → appends to Projects/project-alpha.md ✅

# Preview without writing
gizmo-curate --dry-run "some text"

# Pipe mode
echo "some text" | gizmo-curate
```

**Speed:** ~1.2s per call.

### Decision rules

| Content type | Target path |
|---|---|
| Person | `People/firstname-lastname.md` |
| Project fact | `Projects/project-name.md` (appends if file exists) |
| Place | `Places/place-name.md` |
| Financial | `Finance/` |
| Vendor/service | `Vendors/` |
| Unsure | `Notes/` |

### Integration points
- **Nightly cron** — auto-curates new entities found in daily notes
- **Manual** — call `gizmo-curate` any time for instant filing
- **Coding agents** — available on PATH so agents can save project context

**Binary:** `/usr/local/bin/gizmo-curate` · **Requires:** LLM API key (configured in OpenClaw runtime env)

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

### Installation

```bash
cp bin/obsidian-cli /usr/local/bin/obsidian-cli
chmod +x /usr/local/bin/obsidian-cli
```

### Command Reference

#### Reading

```bash
obsidian-cli read path="MEMORY.md"
obsidian-cli read path="People/alice.md"
obsidian-cli daily:read                         # today's daily note
```

#### Writing & Editing

> **`\n` is interpreted** — all write commands use `printf '%b'` internally, so `\n` becomes a real newline.

```bash
obsidian-cli daily:append content="## 14:30 UTC\n- Meeting notes here"
obsidian-cli append path="MEMORY.md" content="\n## New section\n- important fact"
obsidian-cli create path="People/alice.md" content="# Alice\nEngineer at Acme Corp"
obsidian-cli edit path="MEMORY.md" find="🟡 PENDING" replace="✅ DONE"
```

#### Browsing & Searching

```bash
obsidian-cli list folder="People"
obsidian-cli search query="project"             # filename search
obsidian-cli search-content query="invoice"     # full-text with context lines
obsidian-cli status                             # vault overview
```

#### Moving

```bash
# Renames file AND updates [[wikilinks]] across the vault
obsidian-cli move path="People/old-name.md" to="People/correct-name.md"
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
├── People/                  # Real people the human interacts with
├── Projects/                # Active projects with backlinks
├── Places/                  # Real locations
├── Finance/                 # Financial facts, mortgages, investments
├── Vendors/                 # Companies and services
├── Notes/                   # Loose notes and catch-all
└── Archives/                # Completed/cold projects
```

---

## Session Startup Sequence

```bash
obsidian-cli read path="SOUL.md"
obsidian-cli read path="USER.md"
obsidian-cli daily:read
# Main sessions only:
obsidian-cli read path="MEMORY.md"
```

---

## Wiki Pattern (Karpathy llm-wiki)

The vault implements the [llm-wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — a persistent, compounding knowledge base maintained by the LLM. Instead of re-deriving answers from raw sources on every query, the agent incrementally builds and maintains a structured wiki of interlinked Markdown pages.

### Three workflows

**Ingest** — You send a URL, PDF, or text. The agent reads it, creates a `Sources/YYYY-MM-DD_slug.md` summary page, updates relevant entity pages (`Projects/`, `People/`, `Places/`), updates `index.md`, and appends to `log.md`. A single source can touch 5–15 pages.

**Query → file back** — When the agent produces a substantive synthesis (analysis, comparison, research summary), it offers to file the result as a wiki page. Your explorations compound in the knowledge base, not just disappear into chat history.

**Lint** — Weekly (or on-demand) health check: dead wikilinks, orphan pages, important stubs, stale status items. Runs as a scheduled cron job.

### Key files

| File | Purpose |
|------|---------|
| `index.md` | Catalog of every wiki page with one-line descriptions. Loaded at every session bootstrap so the agent always knows what exists. |
| `log.md` | Append-only record of ingests/queries/lint passes. Format: `## [YYYY-MM-DD] action | title`. Parseable: `grep "^## [" log.md | tail -5` |
| `Sources/` | One Markdown page per ingested external source. Immutable summaries. |

### Vault taxonomy (extended)
```
workspace/
├── index.md                 # Wiki catalog — all pages with one-liners
├── log.md                   # Append-only ingest/query/lint history
├── Sources/                 # External source summaries (one per source)
├── Projects/                # Active projects
├── People/                  # Real people
├── Places/                  # Real locations
...
```

---

## Token-Optimized Pre-Prompt Hook

`hooks/obsidian-preprompt.js` handles two injection paths:

**Session start (`agent:bootstrap`):** injects governance files + daily snapshot once per session. It also automatically loads any files specified in the `OBSIDIAN_OPTIONAL_CONTEXT_FILES` environment variable (e.g., `Context/retrieval_policy.md`) to enforce mandatory system behaviors like active graph traversal and wikilink resolution.

**Per-turn retrieval (`before_prompt_build`):** derives 1–3 queries from the current message, retrieves a small bounded set of snippets, injects as targeted context. Never auto-writes to the vault.

---

## Heartbeat Gardening

A heartbeat cron maintains a lightweight knowledge graph:
- reads recent daily notes
- updates/creates nodes under `Projects/`, `People/`, `Places/`
- silent unless something urgent surfaces
- never auto-edits governance files (`SOUL.md`, `AGENTS.md`, etc.)

---

## Repository Layout

```
obsidian-life-memory-skill/
├── SKILL.md                           # Agent-facing skill definition
├── README.md                          # This file
├── bin/
│   └── obsidian-cli                   # Compatibility adapter
├── hooks/
│   └── obsidian-preprompt.js          # Pre-prompt injection hook
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
- LLM API key (for `gizmo-curate` only)

## License

MIT
