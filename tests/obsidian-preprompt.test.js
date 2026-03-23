import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { makeTempVault, makeFakeOfficialCli } from './test-helpers.js';

function setupEnv() {
  const vault = makeTempVault();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olm-hook-'));
  const official = makeFakeOfficialCli(dir);
  process.env.OBSIDIAN_CLI_BIN = path.resolve('bin/obsidian-cli');
  process.env.OBSIDIAN_OFFICIAL_CLI = official;
  process.env.OBSIDIAN_VAULT_PATH = vault;
  process.env.OBSIDIAN_VAULT_NAME = 'workspace';
  process.env.TEST_VAULT_PATH = vault;
  process.env.OBSIDIAN_BOOTSTRAP_STATE_PATH = path.join(vault, '.obsidian-bootstrap-state.test.json');
  return vault;
}

test('before_prompt_build injects relevant retrieval context', async () => {
  const vault = setupEnv();
  fs.writeFileSync(path.join(vault, 'People', 'carla-corbisiero.md'), '# Carla Corbisiero\nMortgage broker\n');
  const mod = await import(path.resolve('hooks/obsidian-preprompt.js') + `?t=${Date.now()}`);
  const res = await mod.default({ type: 'before_prompt_build', prompt: 'What did Carla say about the remortgage?' }, {});
  assert.ok(res?.prependContext);
  assert.match(res.prependContext, /Obsidian Targeted Retrieval/);
  assert.match(res.prependContext, /Carla/);
  assert.match(res.prependContext, /remortgage/i);
});

test('before_prompt_build includes write targets for correction/update prompts', async () => {
  const vault = setupEnv();
  fs.writeFileSync(path.join(vault, 'People', 'carla-corbisiero.md'), '# Carla Corbisiero\nstatus: open\n');
  const mod = await import(path.resolve('hooks/obsidian-preprompt.js') + `?t=${Date.now()}`);
  const res = await mod.default({ type: 'before_prompt_build', prompt: 'Actually update Carla status to closed' }, {});
  assert.ok(res?.prependContext);
  assert.match(res.prependContext, /Possible write targets/);
  assert.match(res.prependContext, /carla-corbisiero\.md/);
});

test('before_prompt_build returns nothing when no vault match is relevant', async () => {
  setupEnv();
  const mod = await import(path.resolve('hooks/obsidian-preprompt.js') + `?t=${Date.now()}`);
  const res = await mod.default({ type: 'before_prompt_build', prompt: 'Completely unrelated banana spaceship question' }, {});
  assert.equal(res, undefined);
});

test('agent bootstrap injects orientation and writes bootstrap state', async () => {
  const vault = setupEnv();
  const mod = await import(path.resolve('hooks/obsidian-preprompt.js') + `?t=${Date.now()}`);
  const context = {};
  await mod.default({ type: 'agent:bootstrap' }, context);
  assert.ok(context.bootstrapFiles?.['OBSIDIAN_DAILY.md']);
  assert.match(context.bootstrapFiles['OBSIDIAN_DAILY.md'], /Obsidian Session Orientation/);
  assert.match(context.bootstrapFiles['OBSIDIAN_DAILY.md'], /Barclays|Carla|Daily/);
  const statePath = process.env.OBSIDIAN_BOOTSTRAP_STATE_PATH;
  assert.equal(fs.existsSync(statePath), true);
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.ok(Object.keys(state).length >= 1);
});

test('non-target hook events are ignored cleanly', async () => {
  setupEnv();
  const mod = await import(path.resolve('hooks/obsidian-preprompt.js') + `?t=${Date.now()}`);
  const res = await mod.default({ type: 'something-else' }, {});
  assert.equal(res, undefined);
});
