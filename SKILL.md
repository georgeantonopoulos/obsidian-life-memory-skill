---
name: obsidian-life-memory
description: Manage an Obsidian-backed personal memory system for an agent: resolve vault, read/search recent context, append daily events, organize notes into a stable taxonomy, distill daily notes into long-term memory, and run graph health audits.
---

# Obsidian Life Memory

Use this skill when the user wants persistent personal memory in an Obsidian vault.

## Core Rules

- Prefer Obsidian CLI (`obsidian`) for note operations (`search`, `read`, `daily:append`, graph checks).
- Read before writing: retrieve recent context first when the request depends on prior facts or decisions.
- Keep edits reversible: run organization in dry-run mode first, then apply.
- Preserve privacy: do not publish or exfiltrate vault content unless explicitly requested.

## Workflow

### 1) Resolve the vault

```bash
python3 scripts/life_memory.py show-vault
python3 scripts/life_memory.py set-vault --vault-path "/path/to/vault"
```

### 2) Retrieve context first

```bash
python3 scripts/life_memory.py search --query "Athens move"
python3 scripts/life_memory.py read --file "Daily/2026-02-14.md"
```

### 3) Log high-signal events to today

```bash
python3 scripts/life_memory.py log-event \
  --category "Health" \
  --event "Doctor referral sent" \
  --details "Follow-up booked for next week" \
  --tags "health,referral"
```

### 4) Organize the vault safely

Preview first:

```bash
python3 scripts/life_memory.py organize
```

Apply changes:

```bash
python3 scripts/life_memory.py organize --apply
```

### 5) Distill daily notes into long-term memory

```bash
python3 scripts/life_memory.py distill --date "2026-02-14"
```

### 6) Audit graph health

```bash
python3 scripts/life_memory.py audit
```

## Resources

- Script entrypoint: `scripts/life_memory.py`
- Pattern guide: `references/life-patterns.md`
- Obsidian CLI notes: `references/obsidian-cli-notes.md`
