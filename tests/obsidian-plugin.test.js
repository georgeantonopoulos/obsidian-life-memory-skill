import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { makeTempVault, makeFakeOfficialCli } from './test-helpers.js';

function setup() {
  const vault = makeTempVault();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olm-plugin-'));
  const official = makeFakeOfficialCli(dir);
  const adapter = path.resolve('bin/obsidian-cli');
  const api = {
    config: { plugins: { entries: { 'obsidian-cli-tool': { config: { command: adapter, maxOutputChars: 20000 } } } } },
    tools: new Map(),
    registerTool(def) { this.tools.set(def.name, def); },
  };
  const env = {
    ...process.env,
    OBSIDIAN_OFFICIAL_CLI: official,
    OBSIDIAN_VAULT_PATH: vault,
    OBSIDIAN_VAULT_NAME: 'workspace',
    TEST_VAULT_PATH: vault,
  };
  return { api, vault, env };
}

test('plugin registers expected obsidian tools and wrappers work', async () => {
  const { api, vault, env } = setup();
  const oldEnv = process.env;
  Object.assign(process.env, env);
  try {
    const mod = await import(path.resolve('plugins/obsidian-cli-tool/index.js') + `?t=${Date.now()}`);
    mod.default(api);

    const expected = [
      'obsidian_read','obsidian_search','obsidian_search_content','obsidian_create','obsidian_edit',
      'obsidian_append','obsidian_move','obsidian_list','obsidian_daily_read','obsidian_daily_append'
    ];
    for (const name of expected) assert.equal(api.tools.has(name), true, `${name} not registered`);

    await api.tools.get('obsidian_create').execute('1', { path: 'People/carla.md', content: '# Carla' });
    let r = await api.tools.get('obsidian_read').execute('2', { path: 'People/carla.md' });
    assert.match(r.content[0].text, /# Carla/);

    await api.tools.get('obsidian_append').execute('3', { path: 'People/carla.md', content: '\nstatus: open' });
    await api.tools.get('obsidian_edit').execute('4', { path: 'People/carla.md', find: 'open', replace: 'closed' });
    r = await api.tools.get('obsidian_search_content').execute('5', { query: 'closed' });
    assert.match(r.content[0].text, /People\/carla\.md/);

    r = await api.tools.get('obsidian_list').execute('6', { folder: 'People' });
    assert.match(r.content[0].text, /People\/carla\.md/);

    await api.tools.get('obsidian_move').execute('7', { path: 'People/carla.md', to: 'People/carla-corbisiero.md' });
    r = await api.tools.get('obsidian_list').execute('8', { folder: 'People' });
    assert.match(r.content[0].text, /People\/carla-corbisiero\.md/);

    r = await api.tools.get('obsidian_daily_read').execute('9', {});
    assert.match(r.content[0].text, /Daily Note/);
    await api.tools.get('obsidian_daily_append').execute('10', { content: '\n- plugin test' });
    assert.match(fs.readFileSync(path.join(vault, 'memory', '2026-03-23.md'), 'utf8'), /plugin test/);
  } finally {
    process.env = oldEnv;
  }
});
