import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bin = path.join(root, 'bin', 'obsidian-life-memory.js');

function run(args) {
  return spawnSync('node', [bin, ...args], { encoding: 'utf8' });
}

test('help exits cleanly', () => {
  const r = run(['help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Commands:/);
});

test('init dry-run with heartbeat exits cleanly', () => {
  const r = run(['init', '--yes', '--dry-run', '--enable-heartbeat', '--timezone', 'UTC', '--every', '30m']);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /Planned actions:/);
  assert.match(r.stdout, /Done\. \(dry-run\)|Done\.\(dry-run\)|Done\. \(dry-run\)/);
});
