# obsidian-life-memory-skill

Obsidian memory-management skill for OpenClaw/Codex-style agents.

It provides:
- A triggerable `SKILL.md` for agents
- A portable CLI helper (`scripts/life_memory.py`) for vault search/read/log/organize/distill/audit
- Reference docs for daily note patterns and Obsidian CLI behavior

## Repository Layout

```text
obsidian-life-memory-skill/
├── SKILL.md
├── README.md
├── scripts/
│   └── life_memory.py
└── references/
    ├── life-patterns.md
    └── obsidian-cli-notes.md
```

## Requirements

- Python 3.10+
- Obsidian CLI binary available as `obsidian` in `PATH`
- Access to an Obsidian vault (default: `~/.openclaw/workspace`)

## Install (Human)

1. Clone into your skills directory:
```bash
git clone https://github.com/<your-org>/obsidian-life-memory-skill.git ~/.codex/skills/obsidian-life-memory
```

2. Verify the script works:
```bash
python3 ~/.codex/skills/obsidian-life-memory/scripts/life_memory.py --help
```

3. Set your vault path once:
```bash
python3 ~/.codex/skills/obsidian-life-memory/scripts/life_memory.py set-vault --vault-path "/path/to/your/vault"
```

4. Restart your agent runtime so the skill is discoverable.

## Install (Agent)

If your runtime has the `skill-installer` workflow available, install directly from GitHub repo path:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo <your-org>/obsidian-life-memory-skill \
  --path .
```

Then restart the agent process.

## Usage

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

## Notes

- `organize` is dry-run by default to avoid accidental file moves.
- State is stored at `~/.local/state/obsidian-life-memory/vault_config.json` (or `$XDG_STATE_HOME`).
- If running as root/headless, the script handles `--no-sandbox` and defaults `DISPLAY=:99`.

## License

MIT (add your preferred license if different).
