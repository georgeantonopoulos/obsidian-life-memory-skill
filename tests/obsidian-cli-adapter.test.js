import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { makeTempVault, makeFakeOfficialCli, run } from './test-helpers.js';

const adapter = path.resolve('bin/obsidian-cli');

function setup() {
  const vault = makeTempVault();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olm-cli-'));
  const official = makeFakeOfficialCli(dir);
  const env = {
    ...process.env,
    OBSIDIAN_OFFICIAL_CLI: official,
    OBSIDIAN_VAULT_PATH: vault,
    OBSIDIAN_VAULT_NAME: 'workspace',
    TEST_VAULT_PATH: vault,
  };
  return { vault, env };
}

function cli(args, env) {
  return run(adapter, args, { env });
}

test('read + append + create + delete work', () => {
  const { vault, env } = setup();
  let r = cli(['create', 'path=People/alice.md', 'content=# Alice\n#friend'], env);
  assert.equal(r.status, 0, r.stderr);
  r = cli(['append', 'path=People/alice.md', 'content=\n- note'], env);
  assert.equal(r.status, 0, r.stderr);
  r = cli(['read', 'path=People/alice.md'], env);
  assert.match(r.stdout, /# Alice/);
  assert.match(r.stdout, /- note/);
  r = cli(['delete', 'path=People/alice.md'], env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(path.join(vault, 'People', 'alice.md')), false);
});

test('edit handles pipes and first-match replacement safely', () => {
  const { vault, env } = setup();
  fs.writeFileSync(path.join(vault, 'MEMORY.md'), 'hello | one\nhello | one\n');
  const r = cli(['edit', 'path=MEMORY.md', 'find=hello | one', 'replace=hello | fixed'], env);
  assert.equal(r.status, 0, r.stderr);
  const text = fs.readFileSync(path.join(vault, 'MEMORY.md'), 'utf8');
  assert.equal(text.trimEnd(), 'hello | fixed\nhello | one');
});

test('daily commands use memory folder', () => {
  const { vault, env } = setup();
  let r = cli(['daily:read'], env);
  assert.match(r.stdout, /Carla remortgage/);
  r = cli(['daily:append', 'content=\n- added'], env);
  assert.equal(r.status, 0, r.stderr);
  r = cli(['daily:read'], env);
  assert.match(r.stdout, /- added/);
  r = cli(['daily:create', 'content=# Daily Note — 2026-03-23\n\nreset'], env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(vault, 'memory', '2026-03-23.md'), 'utf8'), '# Daily Note — 2026-03-23\n\nreset');
});

test('list + move + backlinks work', () => {
  const { vault, env } = setup();
  fs.writeFileSync(path.join(vault, 'People', 'old-name.md'), '# Old\n');
  fs.writeFileSync(path.join(vault, 'Projects', 'proj.md'), 'Talk to [[old-name]]\n');
  let r = cli(['list', 'folder=People'], env);
  assert.match(r.stdout, /People\/old-name\.md/);
  r = cli(['move', 'path=People/old-name.md', 'to=People/new-name.md'], env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(path.join(vault, 'People', 'new-name.md')), true);
  const proj = fs.readFileSync(path.join(vault, 'Projects', 'proj.md'), 'utf8');
  assert.match(proj, /\[\[new-name\]\]/);
  r = cli(['backlinks', 'path=People/new-name.md'], env);
  assert.match(r.stdout, /Projects\/proj\.md/);
});

test('search + search-content + query + tags work', () => {
  const { vault, env } = setup();
  fs.writeFileSync(path.join(vault, 'People', 'carla.md'), '# Carla\nstatus: open\n#broker\n');
  fs.writeFileSync(path.join(vault, 'Projects', 'mortgage.md'), 'Carla says remortgage\n');
  let r = cli(['search', 'query=carla'], env);
  assert.match(r.stdout, /People\/carla\.md/);
  r = cli(['search-content', 'query=remortgage'], env);
  assert.match(r.stdout, /Projects\/mortgage\.md:/);
  r = cli(['query', 'key=status', 'value=open'], env);
  assert.match(r.stdout, /People\/carla\.md:/);
  r = cli(['tags'], env);
  assert.match(r.stdout, /#broker/);
});

test('print-default and status expose vault info', () => {
  const { vault, env } = setup();
  let r = cli(['print-default'], env);
  assert.equal(r.stdout.trim(), 'workspace');
  r = cli(['print-default', '--path-only'], env);
  assert.equal(r.stdout.trim(), vault);
  r = cli(['status'], env);
  assert.match(r.stdout, new RegExp(vault.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(r.stdout, /Version:/);
  assert.match(r.stdout, /memory\/2026-03-23\.md/);
});
