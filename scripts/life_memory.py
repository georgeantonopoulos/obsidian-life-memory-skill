#!/usr/bin/env python3
"""Obsidian Life Memory CLI.

Portable helper for managing a personal memory vault with Obsidian CLI.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Optional

DEFAULT_VAULT = Path.home() / ".openclaw" / "workspace"
DEFAULT_STATE_DIR = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local" / "state")) / "obsidian-life-memory"
STATE_FILE = DEFAULT_STATE_DIR / "vault_config.json"

IDENTITY_FILES = {"SOUL.md", "IDENTITY.md", "USER.md"}
CONTEXT_FILES = {"LIFE_CONTEXT.md", "TOOLS.md", "AGENTS.md", "HEARTBEAT.md", "MEMORY.md"}
DAILY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\.md$")


class LifeMemoryError(RuntimeError):
    pass


@dataclass
class ConfigStore:
    state_file: Path = STATE_FILE

    def load(self) -> dict:
        if not self.state_file.exists():
            return {"vault_path": str(DEFAULT_VAULT)}
        return json.loads(self.state_file.read_text(encoding="utf-8"))

    def save(self, data: dict) -> None:
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.state_file.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


@dataclass
class ObsidianCLI:
    vault_path: Path
    binary: str = os.environ.get("OBSIDIAN_BIN", "obsidian")

    def run(self, command: str, *args: str) -> str:
        cmd = [self.binary, command, *args]
        if os.geteuid() == 0:
            cmd.append("--no-sandbox")

        env = os.environ.copy()
        if env.get("DISPLAY") is None:
            env["DISPLAY"] = ":99"

        try:
            proc = subprocess.run(
                cmd,
                cwd=self.vault_path,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )
        except FileNotFoundError as exc:
            raise LifeMemoryError(
                "Obsidian CLI binary not found. Install `obsidian-cli` (or set OBSIDIAN_BIN)."
            ) from exc

        if proc.returncode != 0:
            raise LifeMemoryError(proc.stderr.strip() or f"Obsidian command failed: {' '.join(map(shlex.quote, cmd))}")
        return proc.stdout.strip()


@dataclass
class Organizer:
    vault: Path
    apply: bool = False

    def _move(self, src: Path, dst: Path) -> None:
        action = "MOVE" if self.apply else "DRY-RUN"
        print(f"[{action}] {src.relative_to(self.vault)} -> {dst.relative_to(self.vault)}")
        if self.apply:
            dst.parent.mkdir(parents=True, exist_ok=True)
            src.rename(dst)

    def _iter_root_files(self) -> Iterable[Path]:
        for path in self.vault.iterdir():
            if path.is_file():
                yield path

    def run(self) -> None:
        for folder in ["Identity", "Context", "Daily", "Archives"]:
            target = self.vault / folder
            if self.apply:
                target.mkdir(exist_ok=True)

        for item in self._iter_root_files():
            name = item.name
            if name in IDENTITY_FILES:
                self._move(item, self.vault / "Identity" / name)
            elif name in CONTEXT_FILES:
                self._move(item, self.vault / "Context" / name)
            elif DAILY_RE.match(name):
                self._move(item, self.vault / "Daily" / name)

        memory_dir = self.vault / "memory"
        if memory_dir.exists() and memory_dir.is_dir():
            for item in memory_dir.iterdir():
                if item.is_file() and DAILY_RE.match(item.name):
                    self._move(item, self.vault / "Daily" / item.name)

        self._update_obsidianignore()

    def _update_obsidianignore(self) -> None:
        rules = [
            ".git/",
            "node_modules/",
            "__pycache__/",
            "*.pyc",
            "*.sqlite",
            "*.db",
            "*_env/",
            "venv/",
            ".venv/",
            "Archives/",
        ]
        path = self.vault / ".obsidianignore"
        existing = []
        if path.exists():
            existing = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

        merged = sorted(set(existing + rules))
        action = "WRITE" if self.apply else "DRY-RUN"
        print(f"[{action}] .obsidianignore ({len(merged)} rules)")
        if self.apply:
            path.write_text("\n".join(merged) + "\n", encoding="utf-8")


def _store_and_vault() -> tuple[ConfigStore, Path]:
    store = ConfigStore()
    config = store.load()
    vault_path = Path(config.get("vault_path", str(DEFAULT_VAULT))).expanduser().resolve()
    return store, vault_path


def cmd_set_vault(args: argparse.Namespace) -> None:
    store = ConfigStore()
    path = Path(args.vault_path).expanduser().resolve()
    store.save({"vault_path": str(path)})
    print(path)


def cmd_show_vault(_: argparse.Namespace) -> None:
    _, vault = _store_and_vault()
    print(vault)


def cmd_search(args: argparse.Namespace) -> None:
    _, vault = _store_and_vault()
    cli = ObsidianCLI(vault)
    print(cli.run("search", f"query={args.query}", "matches"))


def cmd_read(args: argparse.Namespace) -> None:
    _, vault = _store_and_vault()
    cli = ObsidianCLI(vault)
    if bool(args.file) == bool(args.path):
        raise LifeMemoryError("Provide exactly one of --file or --path.")
    if args.file:
        print(cli.run("read", f"file={args.file}"))
    else:
        print(cli.run("read", f"path={args.path}"))


def cmd_log_event(args: argparse.Namespace) -> None:
    _, vault = _store_and_vault()
    cli = ObsidianCLI(vault)

    timestamp = datetime.now().strftime("%H:%M")
    tags = " ".join(f"#{tag.strip()}" for tag in args.tags.split(",") if tag.strip())
    details = f": {args.details.strip()}" if args.details.strip() else ""
    content = f"\n- **{timestamp}** [{args.category}] {args.event}{details} {tags}".rstrip()

    cli.run("daily:append", f"content={content}", "silent")
    print("logged")


def cmd_organize(args: argparse.Namespace) -> None:
    _, vault = _store_and_vault()
    if not vault.exists():
        raise LifeMemoryError(f"Vault path does not exist: {vault}")
    Organizer(vault=vault, apply=args.apply).run()


def _extract_event_lines(text: str) -> List[str]:
    lines = []
    in_events = False
    for raw in text.splitlines():
        line = raw.strip()
        if line.lower().startswith("## "):
            in_events = line.lower() == "## events"
            continue
        if in_events and line.startswith("-"):
            lines.append(line)
    return lines


def cmd_distill(args: argparse.Namespace) -> None:
    _, vault = _store_and_vault()
    date = args.date
    daily_file = vault / "Daily" / f"{date}.md"
    if not daily_file.exists():
        raise LifeMemoryError(f"Daily note not found: {daily_file}")

    daily_text = daily_file.read_text(encoding="utf-8")
    event_lines = _extract_event_lines(daily_text)
    if not event_lines:
        print("no-events")
        return

    memory_file = vault / "MEMORY.md"
    if not memory_file.exists():
        memory_file.write_text("# MEMORY\n\n", encoding="utf-8")

    stamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    block = [f"## Distilled {date}", f"- Source: [[Daily/{date}]]", f"- Updated: {stamp}"]
    block.extend(event_lines)
    memory_file.write_text(memory_file.read_text(encoding="utf-8") + "\n" + "\n".join(block) + "\n", encoding="utf-8")
    print(f"distilled {len(event_lines)} events")


def cmd_audit(_: argparse.Namespace) -> None:
    _, vault = _store_and_vault()
    cli = ObsidianCLI(vault)

    checks = ["unresolved", "orphans", "deadends"]
    for check in checks:
        print(f"## {check}")
        try:
            print(cli.run(check, "total", "verbose"))
        except LifeMemoryError as exc:
            print(f"{check}: unavailable ({exc})")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Obsidian Life Memory CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("set-vault", help="Persist the vault path")
    p.add_argument("--vault-path", required=True)
    p.set_defaults(func=cmd_set_vault)

    p = sub.add_parser("show-vault", help="Print the current vault path")
    p.set_defaults(func=cmd_show_vault)

    p = sub.add_parser("search", help="Search the vault")
    p.add_argument("--query", required=True)
    p.set_defaults(func=cmd_search)

    p = sub.add_parser("read", help="Read a note via Obsidian CLI")
    p.add_argument("--file")
    p.add_argument("--path")
    p.set_defaults(func=cmd_read)

    p = sub.add_parser("log-event", help="Append an event to today's daily note")
    p.add_argument("--category", required=True)
    p.add_argument("--event", required=True)
    p.add_argument("--details", default="")
    p.add_argument("--tags", default="")
    p.set_defaults(func=cmd_log_event)

    p = sub.add_parser("organize", help="Normalize vault layout")
    p.add_argument("--apply", action="store_true", help="Apply changes (default is dry-run)")
    p.set_defaults(func=cmd_organize)

    p = sub.add_parser("distill", help="Promote daily events to MEMORY.md")
    p.add_argument("--date", required=True, help="YYYY-MM-DD")
    p.set_defaults(func=cmd_distill)

    p = sub.add_parser("audit", help="Run graph health checks")
    p.set_defaults(func=cmd_audit)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
        return 0
    except LifeMemoryError as exc:
        print(f"error: {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
