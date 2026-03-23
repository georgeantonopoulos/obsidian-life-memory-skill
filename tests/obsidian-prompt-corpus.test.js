import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { makeTempVault, makeFakeOfficialCli } from './test-helpers.js';

function setupEnv() {
  const vault = makeTempVault();
  fs.writeFileSync(path.join(vault, 'People', 'carla-corbisiero.md'), '# Carla Corbisiero\nMortgage broker\nrate 4.68%\n');
  fs.writeFileSync(path.join(vault, 'Projects', 'orsett-terrace.md'), '# Orsett Terrace\nBM Solutions mortgage\n');
  fs.writeFileSync(path.join(vault, 'Places', 'athens.md'), '# Athens\nFlight tomorrow\n', { flag: 'w' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olm-corpus-'));
  const official = makeFakeOfficialCli(dir);
  process.env.OBSIDIAN_CLI_BIN = path.resolve('bin/obsidian-cli');
  process.env.OBSIDIAN_OFFICIAL_CLI = official;
  process.env.OBSIDIAN_VAULT_PATH = vault;
  process.env.OBSIDIAN_VAULT_NAME = 'workspace';
  process.env.TEST_VAULT_PATH = vault;
  process.env.OBSIDIAN_BOOTSTRAP_STATE_PATH = path.join(vault, '.obsidian-bootstrap-state.test.json');
  return vault;
}

const promptCases = [
  'What did Carla say about the remortgage?',
  'Update Barclays to closed',
  'Actually the loan was rejected',
  'Where is the Athens flight note?',
  'show me Orsett Terrace context',
  'Minecraft subscription tomorrow?',
  'Do I have anything about Lexie?',
  'Carla email draft',
  'What changed today?',
  'random banana spaceship nonsense',
  'please update Carla status',
  'Did George mention BM Solutions?',
  'AFM deadline',
  'school records overdue',
  'what do I need to do tomorrow',
  'wrong date for the flight',
  'new note about Athens move',
  'search for mortgage fee',
  'Who is Carla Corbisiero',
  'Minecraft',
  'Barclays',
  'Lexie grooming',
  'Hyperoptic bill',
  'Airport Executive receipt',
  'Can you correct the remortgage amount?',
];

test('before_prompt_build handles a corpus of prompts without throwing and returns only valid shapes', async () => {
  setupEnv();
  const mod = await import(path.resolve('hooks/obsidian-preprompt.js') + `?t=${Date.now()}`);
  for (const prompt of promptCases) {
    const res = await mod.default({ type: 'before_prompt_build', prompt }, {});
    const valid = res === undefined || (res && typeof res.prependContext === 'string');
    assert.equal(valid, true, `invalid response shape for prompt: ${prompt}`);
    if (res?.prependContext) {
      assert.match(res.prependContext, /# Obsidian Targeted Retrieval/);
      assert.ok(res.prependContext.length > 20);
    }
  }
});
