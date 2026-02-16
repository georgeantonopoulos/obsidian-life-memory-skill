# obsidian-life-memory-skill

Obsidian memory-management skill for OpenClaw/Codex-style agents with **token-optimized incremental loading**.

## Overview

This skill provides persistent personal memory for AI agents using an Obsidian vault. It includes:
- A triggerable `SKILL.md` for agents
- A **pre-prompt hook** that injects daily context with **stateful caching**
- A portable CLI helper (`scripts/life_memory.py`) for vault operations
- Reference docs for daily note patterns and Obsidian CLI behavior

## Key Features

### 🚀 Token-Optimized Pre-Prompt Hook

The `hooks/obsidian-preprompt.js` hook solves token inflation in long-running daily logs:

| Feature | Benefit |
|---------|---------|
| **SHA256 Hash Caching** | Returns cached snapshot instantly if daily note unchanged |
| **Incremental Delta Loading** | Only processes new lines since last session |
| **Token-Aware Budgeting** | Enforces ~3000 token limit regardless of log size |
| **"Since you last spoke"** | Prepends new content for context continuity |
| **Obsidian-Safe** | Preserves wikilinks `[[...]]`, tags `#tag`, tasks `- [ ]` |

**State Persistence:** `.obsidian-bootstrap-state.json` tracks per-day:
```json
{
  "2026-02-16": {
    "noteHash": "a3f7c2...",
    "snapshot": "cached content...",
    "lastLineCount": 45,
    "lastUpdatedIso": "2026-02-16T08:30:00.000Z"
  }
}
```

## Repository Layout

```text
obsidian-life-memory-skill/
├── SKILL.md
├── README.md
├── hooks/
│   └── obsidian-preprompt.js    # Token-optimized bootstrap hook
├── scripts/
│   └── life_memory.py           # CLI helper for vault operations
└── references/
    ├── life-patterns.md
    └── obsidian-cli-notes.md
```

## Requirements

- Python 3.10+
- Node.js 18+ (for the pre-prompt hook)
- Obsidian CLI binary available as `obsidian` in `PATH`
- Access to an Obsidian vault (default: `~/.openclaw/workspace`)

## Install (Human)

1. Clone into your skills directory:
```bash
git clone https://github.com/georgeantonopoulos/obsidian-life-memory-skill.git ~/.codex/skills/obsidian-life-memory
```

2. Copy the pre-prompt hook to your workspace hooks:
```bash
cp ~/.codex/skills/obsidian-life-memory/hooks/obsidian-preprompt.js \
   ~/.openclaw/workspace/hooks/obsidian-preprompt.js
```

3. Verify the script works:
```bash
python3 ~/.codex/skills/obsidian-life-memory/scripts/life_memory.py --help
```

4. Set your vault path once:
```bash
python3 ~/.codex/skills/obsidian-life-memory/scripts/life_memory.py set-vault --vault-path "/path/to/your/vault"
```

5. Restart your agent runtime so the skill is discoverable.

## Install (Agent)

If your runtime has the `skill-installer` workflow available, install directly from GitHub repo path:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo georgeantonopoulos/obsidian-life-memory-skill \
  --path .
```

Then restart the agent process.

## Usage

### CLI Helper

```bash
python3 scripts/life_memory.py show-vault
python3 scripts/life_memory.py search --query "Athens move"
python3 scripts/life_memory.py read --file "Daily/2026-02-15.md"
python3 scripts/life_memory.py log-event --category "Ops" --event "Published skill" --tags "skills,release"
python3 scripts/life_memory.py organize            # dry-run
python3 scripts/life_memory.py organize --apply    # apply changes
python3 scripts/life_memory.py distill --date "2026-02-15"
python3 scripts/life_memory.py audit
```

### Pre-Prompt Hook

The hook runs automatically at `agent:bootstrap` and injects `OBSIDIAN_DAILY.md` into context:

1. **First session of the day:** Reads full daily note, builds snapshot, saves to state
2. **Subsequent sessions:** If note unchanged, returns cached snapshot instantly
3. **New content added:** Computes delta (new lines), prepends "Since you last spoke:"

**Token Budget:** Configurable via `OBSIDIAN_BOOTSTRAP_TOKEN_BUDGET` env var (default: ~3000 tokens).

## How It Works

### Hook Flow

```
agent:bootstrap triggered
        │
        ▼
┌─────────────────┐
│ Read daily note │ ◄── CLI first, file fallback
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Compute SHA256  │
└────────┬────────┘
         │
         ▼
    ┌────────────┐
    │ Hash match │──────► Return cached snapshot (instant)
    └─────┬──────┘
          │ No match
          ▼
┌─────────────────┐
│ Build snapshot  │ ◄── Extract wikilinks, tasks, tags
│ + Delta section │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Persist state   │ ◄── Save hash, snapshot, line count
└────────┬────────┘
         │
         ▼
   Return snapshot
```

### Delta Computation

The hook tracks `lastLineCount` from the previous session. If new lines are appended:

```
Previous session: 45 lines
Current session:  52 lines (7 new)

Snapshot includes:
---
## Since you last spoke:
[new line 46]
[new line 47]
...
[new line 52]

---

[full summary within remaining token budget]
```

## Notes

- `organize` is dry-run by default to avoid accidental file moves.
- State is stored at `~/.local/state/obsidian-life-memory/vault_config.json` (or `$XDG_STATE_HOME`).
- Hook state is stored at `$OBSIDIAN_VAULT_PATH/.obsidian-bootstrap-state.json`.
- If running as root/headless, the script handles `--no-sandbox` and defaults `DISPLAY=:99`.

## License

MIT
