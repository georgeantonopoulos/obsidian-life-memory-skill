import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

export function makeTempVault() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'olm-vault-'));
  fs.mkdirSync(path.join(root, 'memory'), { recursive: true });
  fs.mkdirSync(path.join(root, 'People'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Projects'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Places'), { recursive: true });
  fs.writeFileSync(path.join(root, 'SOUL.md'), '# Soul\n\nRules live here.\n');
  fs.writeFileSync(path.join(root, 'USER.md'), '# User\n\nGeorge\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Agents\n\nUse obsidian-cli.\n');
  fs.writeFileSync(path.join(root, 'TOOLS.md'), '# Tools\n\nSome tools.\n');
  fs.writeFileSync(path.join(root, 'MEMORY.md'), '# Memory\n\n- Barclays loan status\n');
  fs.writeFileSync(path.join(root, 'memory', '2026-03-23.md'), '# Daily Note — 2026-03-23\n\n- Barclays £40k loan\n- Carla remortgage follow-up\n');
  return root;
}

export function makeFakeOfficialCli(dir) {
  const cliPath = path.join(dir, 'fake-official-cli.js');
  fs.writeFileSync(cliPath, String.raw`#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const VAULT_PATH = process.env.TEST_VAULT_PATH;
if (!VAULT_PATH) { console.error('TEST_VAULT_PATH required'); process.exit(2); }
const args = process.argv.slice(2);
let idx = 0;
if (args[0] && args[0].startsWith('vault=')) idx = 1;
const cmd = args[idx];
const rest = args.slice(idx + 1);
const kv = {};
for (const arg of rest) {
  if (arg.includes('=')) {
    const i = arg.indexOf('=');
    kv[arg.slice(0, i)] = arg.slice(i + 1);
  }
}
function p(rel='') { return path.join(VAULT_PATH, rel); }
function ensureDir(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
function read(rel) {
  const file = p(rel);
  if (!fs.existsSync(file)) { console.error('not found'); process.exit(1); }
  process.stdout.write(fs.readFileSync(file, 'utf8'));
}
function write(rel, content) {
  const file = p(rel); ensureDir(file); fs.writeFileSync(file, content, 'utf8');
}
function append(rel, content) {
  const file = p(rel); ensureDir(file); if (!fs.existsSync(file)) fs.writeFileSync(file, '', 'utf8'); fs.appendFileSync(file, content, 'utf8');
}
function dailyPath() { return 'memory/2026-03-23.md'; }
function filesUnder(folder='') {
  const start = p(folder);
  const out = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.endsWith('.md')) out.push(path.relative(VAULT_PATH, full));
    }
  }
  walk(start);
  return out.sort();
}
function grep(query, withContext=false, limit=20) {
  const out = [];
  for (const rel of filesUnder('')) {
    const file = p(rel);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (line.toLowerCase().includes(String(query).toLowerCase())) {
        out.push(withContext ? rel + ':' + (i+1) + ': ' + line : rel);
      }
    });
  }
  const uniq = [...new Set(out)].slice(0, Number(limit));
  process.stdout.write(uniq.join('\n') + (uniq.length ? '\n' : ''));
}
function backlinks(rel) {
  const stem = path.basename(rel, '.md');
  grep('[[' + stem, false, 100);
}
function tags() {
  const found = new Set();
  for (const rel of filesUnder('')) {
    const text = fs.readFileSync(p(rel), 'utf8');
    for (const m of text.matchAll(/(^|\s)(#[A-Za-z0-9_-]+)/g)) found.add(m[2]);
  }
  const arr = [...found].sort();
  process.stdout.write(arr.join('\n') + (arr.length ? '\n' : ''));
}

switch (cmd) {
  case 'version': process.stdout.write('1.12.7 (installer 1.12.7)\n'); break;
  case 'daily:path': process.stdout.write(dailyPath() + '\n'); break;
  case 'daily:read': read(dailyPath()); break;
  case 'daily:append': append(dailyPath(), kv.content || ''); break;
  case 'read': read(kv.path || kv.file); break;
  case 'append': append(kv.path || kv.file, kv.content || ''); break;
  case 'create': write(kv.path || kv.file || kv.name, kv.content || ''); break;
  case 'delete': fs.unlinkSync(p(kv.path || kv.file)); process.stdout.write('Deleted permanently: ' + (kv.path || kv.file) + '\n'); break;
  case 'files': {
    const out = filesUnder(kv.folder || '');
    process.stdout.write(out.join('\n') + (out.length ? '\n' : ''));
    break;
  }
  case 'move': {
    const from = kv.path;
    const to = kv.to;
    ensureDir(p(to));
    fs.renameSync(p(from), p(to));
    const oldStem = path.basename(from, '.md');
    const newStem = path.basename(to, '.md');
    for (const rel of filesUnder('')) {
      const file = p(rel);
      const original = fs.readFileSync(file, 'utf8');
      const updated = original.replaceAll('[[' + oldStem + ']]', '[[' + newStem + ']]');
      if (updated !== original) fs.writeFileSync(file, updated, 'utf8');
    }
    process.stdout.write('Moved\n');
    break;
  }
  case 'search': grep(kv.query, false, kv.limit || 20); break;
  case 'search:context': grep(kv.query, true, kv.limit || 20); break;
  case 'backlinks': backlinks(kv.path || kv.file); break;
  case 'tags': tags(); break;
  default: console.error('unsupported fake command: ' + cmd); process.exit(2);
}
`);
  fs.chmodSync(cliPath, 0o755);
  return cliPath;
}

export function run(command, args, opts = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...opts });
}
