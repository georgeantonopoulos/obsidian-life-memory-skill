#!/usr/bin/env python3
"""
fix_deadends.py — Intelligent vault dead-end resolver

For each broken [[wikilink]], asks Moonshot AI:
  CREATE → link represents real content worth a note → writes a stub
  REMOVE → speculative/noise → replaces [[Link]] with plain text

Usage:
  python3 fix_deadends.py              # dry run, shows verdicts only
  python3 fix_deadends.py --apply      # make the changes
  python3 fix_deadends.py --apply --limit 30   # process up to 30 links
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Tuple
import urllib.request

# ── Config ────────────────────────────────────────────────────────────────────

def _get_moonshot_key() -> str:
    # 1. env override
    if os.environ.get("MOONSHOT_API_KEY"):
        return os.environ["MOONSHOT_API_KEY"]
    # 2. openclaw auth-profiles
    profiles_path = Path.home() / ".openclaw/agents/main/agent/auth-profiles.json"
    if profiles_path.exists():
        try:
            data = json.loads(profiles_path.read_text())
            for k, v in data.get("profiles", {}).items():
                if "moonshot" in k.lower():
                    key = v.get("key", "")
                    if key:
                        return key
        except Exception:
            pass
    raise RuntimeError("No Moonshot API key found. Set MOONSHOT_API_KEY or configure in OpenClaw.")

MOONSHOT_BASE_URL = "https://api.moonshot.ai/v1"
MOONSHOT_MODEL    = "moonshot-v1-8k"   # cheapest; just needs yes/no judgement

# ── Vault ─────────────────────────────────────────────────────────────────────

def get_vault() -> Path:
    store = Path.home() / ".life_memory_store.json"
    if store.exists():
        data = json.loads(store.read_text())
        v = data.get("vault")
        if v:
            return Path(v)
    return Path("/root/.openclaw/workspace")

SKIP_DIRS = {".git", ".obsidian", "node_modules", "__pycache__", ".trash",
             "obsidian-life-memory-skill", "dashboard_project", "Archives", "skills"}

def get_markdown_files(vault: Path) -> List[Path]:
    files = []
    for f in vault.rglob("*.md"):
        if not any(p in SKIP_DIRS for p in f.parts):
            files.append(f)
    return files

# ── Wikilink helpers ──────────────────────────────────────────────────────────

WIKILINK_RE = re.compile(r"\[\[([^|\]]+)(?:\|([^\]]+))?\]\]")

def extract_links_with_context(text: str) -> List[Tuple[str, str]]:
    """Return (link_target, surrounding_context) for each wikilink in text."""
    results = []
    lines = text.split("\n")
    for i, line in enumerate(lines):
        for m in WIKILINK_RE.finditer(line):
            link = m.group(1).strip()
            start, end = max(0, i - 1), min(len(lines), i + 2)
            ctx = " ".join(lines[start:end]).strip()[:400]
            results.append((link, ctx))
    return results

def resolve_link(link: str, vault: Path) -> Path:
    slug = link.replace(" ", "-").lower()
    if "/" in link:
        return vault / f"{slug}.md"
    for folder in ["", "Projects", "People", "Places", "Vendors",
                   "Events", "Daily", "Context", "Identity", "Finance"]:
        # exact slug match
        candidate = vault / folder / f"{slug}.md"
        if candidate.exists():
            return candidate
        # case-insensitive fallback (catches HEARTBEAT.md, SOUL.md etc.)
        parent = vault / folder if folder else vault
        if parent.exists():
            for f in parent.iterdir():
                if f.suffix == ".md" and f.stem.lower() == slug:
                    return f
    return vault / f"{slug}.md"

def remove_wikilink(text: str, link: str) -> str:
    """Replace [[link]] or [[link|alias]] with the alias or plain link name."""
    def _sub(m: re.Match) -> str:
        return m.group(2) if m.group(2) else m.group(1)
    pattern = re.compile(
        r"\[\[" + re.escape(link) + r"(?:\|([^\]]+))?\]\]"
    )
    return pattern.sub(lambda m: m.group(1) if m.group(1) else link, text)

# ── Moonshot verdict ──────────────────────────────────────────────────────────

def ask_moonshot(link: str, context: str, source: str, api_key: str) -> Tuple[str, str]:
    """Returns ('CREATE'|'REMOVE', reason_string)."""
    prompt = (
        f"You are a personal knowledge graph curator.\n"
        f"A markdown vault has a broken wikilink [[{link}]] in '{source}'.\n\n"
        f"Context:\n\"{context}\"\n\n"
        f"Should this become a real note?\n"
        f"- CREATE if: it's a real person, project, place, vendor, or recurring concept "
        f"that will accumulate information over time.\n"
        f"- REMOVE if: it's vague, a one-off mention, or doesn't warrant its own note.\n\n"
        f"Reply in exactly this format (two lines, nothing else):\n"
        f"DECISION: CREATE or REMOVE\n"
        f"REASON: one sentence"
    )

    payload = json.dumps({
        "model": MOONSHOT_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 80,
        "temperature": 0,
    }).encode()

    req = urllib.request.Request(
        f"{MOONSHOT_BASE_URL}/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read())
            content = data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return "REMOVE", f"API error ({e})"

    decision, reason = "REMOVE", "no reason given"
    for line in content.splitlines():
        if line.startswith("DECISION:"):
            val = line.split(":", 1)[1].strip().upper()
            decision = "CREATE" if "CREATE" in val else "REMOVE"
        elif line.startswith("REASON:"):
            reason = line.split(":", 1)[1].strip()
    return decision, reason

# ── Stub creator ──────────────────────────────────────────────────────────────

_PEOPLE_HINTS  = {"george", "maya", "elpi", "carla", "christina", "ryan", "agis",
                  "miss", "mr", "mrs", "dr"}
_PROJECT_HINTS = {"sequency", "dashboard", "orsett", "athens", "moraitis",
                  "project", "app", "bmw", "revolut"}

def create_stub(link: str, vault: Path, source: str, reason: str) -> Path:
    ll = link.lower()
    if any(h in ll for h in _PEOPLE_HINTS):
        folder = vault / "People"
    elif any(h in ll for h in _PROJECT_HINTS):
        folder = vault / "Projects"
    else:
        folder = vault

    folder.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^\w\-]", "-", link.lower()).strip("-")
    note_path = folder / f"{slug}.md"

    if not note_path.exists():
        note_path.write_text(
            f"# {link}\n\n"
            f"<!-- Stub created by fix_deadends.py -->\n"
            f"<!-- Source: {source} | Reason: {reason} -->\n\n"
            f"## Notes\n\n"
        )
    return note_path

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Intelligent vault dead-end resolver")
    ap.add_argument("--apply",  action="store_true", help="Apply changes (default: dry run)")
    ap.add_argument("--limit",  type=int, default=60, help="Max unique broken links to process (default 60)")
    ap.add_argument("--delay",  type=float, default=0.25, help="Seconds between API calls (default 0.25)")
    args = ap.parse_args()

    dry_run = not args.apply
    vault   = get_vault()
    api_key = _get_moonshot_key()

    print(f"Vault : {vault}")
    print(f"Mode  : {'DRY RUN — no files will be changed' if dry_run else 'APPLY'}")
    print()

    files = get_markdown_files(vault)
    print(f"Scanning {len(files)} markdown files…")

    # Build broken-link list: {link: [(source_rel, context), ...]}
    broken: dict[str, list[tuple[str, str]]] = {}
    for f in files:
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        rel = str(f.relative_to(vault))
        for link, ctx in extract_links_with_context(text):
            if not resolve_link(link, vault).exists():
                broken.setdefault(link, []).append((rel, ctx))

    print(f"Found  {sum(len(v) for v in broken.values())} broken occurrences "
          f"across {len(broken)} unique links\n")

    to_process = list(broken.items())[:args.limit]
    created = removed = errors = 0
    verdicts: list[tuple[str, str, str, str]] = []   # link, source, decision, reason

    for i, (link, occurrences) in enumerate(to_process, 1):
        primary_source, primary_ctx = occurrences[0]
        print(f"[{i:>3}/{len(to_process)}] [[{link}]]  ({len(occurrences)} occurrence{'s' if len(occurrences)>1 else ''})")
        print(f"         in: {primary_source}")

        decision, reason = ask_moonshot(link, primary_ctx, primary_source, api_key)
        verdicts.append((link, primary_source, decision, reason))
        print(f"         → {decision}: {reason}")

        if not dry_run:
            if decision == "CREATE":
                try:
                    p = create_stub(link, vault, primary_source, reason)
                    print(f"         ✅ stub → {p.relative_to(vault)}")
                    created += 1
                except Exception as e:
                    print(f"         ❌ create failed: {e}")
                    errors += 1
            else:  # REMOVE — apply to every file that contains this link
                for f in files:
                    try:
                        text = f.read_text(encoding="utf-8", errors="ignore")
                        if f"[[{link}" in text or f"[[{link}|" in text:
                            new_text = remove_wikilink(text, link)
                            if new_text != text:
                                f.write_text(new_text)
                    except Exception as e:
                        print(f"         ⚠️  {f.name}: {e}")
                        errors += 1
                print(f"         🗑️  removed from {len(occurrences)} file(s)")
                removed += 1

        if i < len(to_process):
            time.sleep(args.delay)

    # ── Summary ──────────────────────────────────────────────────────────────
    print()
    print("─" * 60)
    create_n = sum(1 for _, _, d, _ in verdicts if d == "CREATE")
    remove_n = sum(1 for _, _, d, _ in verdicts if d == "REMOVE")

    if dry_run:
        print(f"DRY RUN: would CREATE {create_n} stubs, REMOVE {remove_n} links")
        print("\nFull verdict list:")
        for link, src, dec, reason in verdicts:
            print(f"  {'✅ CREATE' if dec=='CREATE' else '🗑️  REMOVE'}  [[{link}]]  — {reason}")
        print("\nRun with --apply to execute.")
    else:
        print(f"Done: {created} stubs created · {removed} links removed · {errors} errors")
        try:
            result = subprocess.run(
                ["python3", str(Path(__file__).parent / "life_memory.py"), "audit", "--summary"],
                capture_output=True, text=True, cwd=str(vault)
            )
            print("New vault health:", result.stdout.strip())
        except Exception:
            pass

if __name__ == "__main__":
    main()
