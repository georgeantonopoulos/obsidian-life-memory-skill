# obsidian-life-memory-skill

Transform your OpenClaw workspace into a **structured, navigable memory system** using Obsidian. This skill provides persistent personal memory for AI agents through wikilinked notes, daily logs, and graph-based context retrieval.

## What It Does

This skill helps agents maintain continuity across sessions by organizing information into an Obsidian vault with:

- **Daily notes** — Timestamped logs of events, decisions, and context
- **Wikilinked entities** — People, projects, and concepts as connected nodes (`[[Project Name]]`, `[[Person]]`)
- **Graph navigation** — Traverse connections between related information
- **Long-term memory** — Distilled summaries from daily noise
- **Automatic context injection** — Pre-prompt hook loads relevant context at session start

## Vault Taxonomy

The skill organizes your workspace into a connected graph:

```
workspace/
├── [[IDENTITY]].md          # Who the agent is (name, vibe, emoji)
├── [[USER]].md              # Who the human is (preferences, context)
├── [[SOUL]].md              # Behavioral guidelines and boundaries
├── [[MEMORY]].md            # Long-term distilled knowledge
├── [[HEARTBEAT]].md         # System status and maintenance notes
├── [[BOOTSTRAP]].md         # First-run instructions (delete after setup)
│
├── /Context                 # Stable reference information
│   ├── locations.md
│   ├── vehicles.md
│   └── preferences.md
│
├── /Daily                   # Timestamped logs (YYYY-MM-DD.md)
│   ├── 2026-02-14.md
│   ├── 2026-02-15.md
│   └── 2026-02-16.md
│
├── /Projects                # Active projects with backlinks
│   ├── [[Project Alpha]].md
│   └── [[Project Beta]].md
│
└── /Archives                # Completed/cold projects
```

## Core Concepts

### Wikilinks — The Graph Backbone

Obsidian's `[[...]]` syntax creates traversable connections:

```markdown
- Met with [[Client]] about [[Project Alpha]]
- Need to follow up with [[Vendor]] on [[Equipment Issue]]
- [[Person A]] and [[Person B]] start at [[Organization]] next month
```

These links form a knowledge graph. The agent can:
- Follow connections to gather context
- Identify related entities automatically
- Maintain persistent identity through `[[SOUL]]` and `[[IDENTITY]]`

### Daily Notes — Event Stream

Each day gets a log file at `Daily/YYYY-MM-DD.md`:

```markdown
---
type: daily-log
created: 2026-02-16
tags: [daily, log]
---

# 2026-02-16

## Events
- **08:00** [System] Updated Obsidian hook with token optimization [[GitHub]]
- **09:30** [Planning] Reviewed project proposals [[Project Alpha]]
- **14:00** [Health] Scheduled annual checkup [[Doctor]]

## Connectors
- [[SOUL]]
- [[Project Alpha]]
- [[GitHub]]
```

### The Obsidian CLI

The skill uses the Obsidian CLI (`obsidian` command) for vault operations:

```bash
# Read today's daily note
obsidian daily:read

# Search the vault
obsidian search --query "project"

# Append an event to today's note
obsidian daily:append --content "- **10:00** [Event] Description [[Link]]"
```

This provides real-time access to the vault without file system dependencies.

## Token-Optimized Pre-Prompt Hook

The `hooks/obsidian-preprompt.js` runs at every session start to inject context. It solves a critical problem: **daily logs grow indefinitely, causing token inflation**.

### How It Works

| Scenario | Behavior | Tokens Used |
|----------|----------|-------------|
| **First session** | Read full daily note, build summary, save state | ~3000 |
| **No changes** | Return cached snapshot instantly | ~3000 (no processing) |
| **New content** | Compute delta, prepend "Since you last spoke:" | ~3000 |

The hook maintains `.obsidian-bootstrap-state.json`:

```json
{
  "2026-02-16": {
    "noteHash": "a3f7c2d8...",
    "snapshot": "# Obsidian Daily Log Essence...",
    "lastLineCount": 52,
    "lastUpdatedIso": "2026-02-16T08:30:00.000Z"
  }
}
```

**Key features:**
- **SHA256 hashing** — Skip processing if daily note unchanged
- **Line-based delta** — Only process new lines since last session
- **Token budgeting** — `estimateTokens() = Math.ceil(chars / 4)`
- **Obsidian-safe** — Preserves wikilinks `[[...]]`, tags `#tag`, tasks `- [ ]`

## Installation

### Fast path (recommended): npm CLI wizard

```bash
npx obsidian-life-memory init
```

The wizard is explicit and transparent:
- asks whether to enable **Heartbeat Gardening** (opt-in)
- previews planned changes before applying
- writes a rollback snapshot
- keeps private context local (not in shared repo)

Useful commands:

```bash
npx obsidian-life-memory doctor
npx obsidian-life-memory sync
npx obsidian-life-memory rollback
```

### Manual path

#### 1. Clone the skill

```bash
git clone https://github.com/georgeantonopoulos/obsidian-life-memory-skill.git \
  ~/.codex/skills/obsidian-life-memory
```

#### 2. Install the pre-prompt hook

```bash
cp ~/.codex/skills/obsidian-life-memory/hooks/obsidian-preprompt.js \
   ~/.openclaw/workspace/hooks/obsidian-preprompt.js
```

#### 3. Optional private context overlay (recommended)

Keep personal/instance-specific context out of the shared skill repo.

- Use template files in `templates/Context/` as starting points.
- Store real private content in your vault (example):
  - `Context/retrieval_policy.md`
  - `Context/now.md`
- Enable optional context loading via env on the hook:

```bash
OBSIDIAN_OPTIONAL_CONTEXT_FILES="Context/retrieval_policy.md,Context/now.md"
```

If files are missing, the hook skips them safely.

#### 4. Sync canonical repo → live copy safely

Use the included sync script to deploy updates while preserving local/private overrides:

```bash
bash scripts/sync_live_copy.sh \
  /root/.openclaw/workspace/obsidian-life-memory-skill/ \
  /root/.openclaw/workspace/skills/obsidian-life-memory/
```

The script excludes `.git/`, `local-overrides/`, and `scripts/__pycache__/`.

## Heartbeat Gardening (optional, user-consented)

If enabled, heartbeat can maintain a lightweight knowledge graph and a fast index.

Typical behavior:
- reads recent `Daily/YYYY-MM-DD.md`
- updates/creates nodes under knowledge folders (e.g. `Projects/`, `People/`)
- maintains `Context/now.md` for fast retrieval
- never auto-edits governance/system files when configured with safe rules

Recommended defaults:
- every `30m`
- active hours `07:00–21:00`
- timezone set explicitly
- target `none` (silent unless meaningful)

Use `npx obsidian-life-memory init` to enable this **only after explicit confirmation**.

### 3. Set your vault path

```bash
python3 ~/.codex/skills/obsidian-life-memory/scripts/life_memory.py set-vault \
  --vault-path "/path/to/your/vault"
```

### 4. Verify CLI access

```bash
obsidian --version
python3 ~/.codex/skills/obsidian-life-memory/scripts/life_memory.py show-vault
```

### 5. Restart your agent

The skill will be discoverable after restart.

## Vault Path Configuration

The skill resolves the vault path in this priority order:

1. **`OBSIDIAN_VAULT_PATH` environment variable** — Highest priority
   ```bash
   export OBSIDIAN_VAULT_PATH="/path/to/your/vault"
   ```

2. **Python CLI config file** — Set via `set-vault` command
   ```bash
   python3 scripts/life_memory.py set-vault --vault-path "/path/to/vault"
   ```
   Stored at: `~/.local/state/obsidian-life-memory/vault_config.json`

3. **Current working directory** — Fallback if neither above is set

The pre-prompt hook and CLI helper both use this resolution order, so setting the path once (via env var or CLI) works for both.

## Usage

### Search and Retrieve

```bash
# Search across all notes
python3 scripts/life_memory.py search --query "project proposal"

# Read a specific file
python3 scripts/life_memory.py read --file "Daily/2026-02-15.md"

# Read via Obsidian CLI (real-time sync)
obsidian read --file "Projects/Project Alpha.md"
```

### Log Events

```bash
# Log to today's daily note with wikilinks
python3 scripts/life_memory.py log-event \
  --category "Planning" \
  --event "Reviewed vendor proposals" \
  --details "Selected three candidates for follow-up" \
  --tags "planning,vendor"
```

This creates entries like:
```markdown
- **14:30** [Planning] Reviewed vendor proposals — Selected three candidates for follow-up #planning #vendor [[Project Alpha]]
```

### Organize the Vault

Preview changes (dry-run):
```bash
python3 scripts/life_memory.py organize
```

Apply organization:
```bash
python3 scripts/life_memory.py organize --apply
```

Moves files into taxonomy folders (`Daily/`, `Projects/`, `Archives/`, `Context/`).

### Distill to Long-Term Memory

Promote important facts from daily logs to `[[MEMORY]].md`:

```bash
python3 scripts/life_memory.py distill --date "2026-02-15"
```

### Audit Graph Health

```bash
python3 scripts/life_memory.py audit
```

Checks for:
- Orphaned notes (no inbound links)
- Missing wikilink targets
- Stale daily notes needing distillation

## Repository Layout

```
obsidian-life-memory-skill/
├── SKILL.md                           # Agent-facing skill definition
├── README.md                          # This file
├── hooks/
│   └── obsidian-preprompt.js          # Token-optimized bootstrap hook
├── scripts/
│   └── life_memory.py                 # CLI helper for vault operations
└── references/
    ├── life-patterns.md               # Daily note templates
    └── obsidian-cli-notes.md          # CLI usage patterns
```

## Configuration

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `OBSIDIAN_VAULT_PATH` | Root path to Obsidian vault (highest priority) | Reads from config file, then `process.cwd()` |
| `OBSIDIAN_BOOTSTRAP_TOKEN_BUDGET` | Max tokens for hook output | 3000 |

### State Files

- **Vault config:** `~/.local/state/obsidian-life-memory/vault_config.json`
- **Hook state:** `$OBSIDIAN_VAULT_PATH/.obsidian-bootstrap-state.json`

## Requirements

- Python 3.10+
- Node.js 18+ (for pre-prompt hook)
- Obsidian CLI (`obsidian` binary in `PATH`)
- Access to Obsidian vault (local or headless with `DISPLAY=:99`)

## License

MIT
