#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_WORKSPACE = '/root/.openclaw/workspace';
const LIVE_SKILL_DIR = path.join(DEFAULT_WORKSPACE, 'skills', 'obsidian-life-memory');
const LIVE_HOOK_PATH = path.join(DEFAULT_WORKSPACE, 'hooks', 'obsidian-preprompt.js');
const LOCAL_INSTALL_STATE = path.join(DEFAULT_WORKSPACE, 'Context', 'skill-installs', 'obsidian-life-memory-install.json');

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || `command failed: ${cmd}`).trim());
  }
  return (res.stdout || '').trim();
}

function runSafe(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return {
    ok: res.status === 0,
    out: (res.stdout || '').trim(),
    err: (res.stderr || '').trim(),
    code: res.status,
  };
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJsonAtomic(filePath, obj) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function parseArgs(argv) {
  const [cmd = 'help', ...rest] = argv;
  const flags = new Set(rest.filter((x) => x.startsWith('--')));
  const values = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i].startsWith('--') && rest[i + 1] && !rest[i + 1].startsWith('--')) {
      values[rest[i]] = rest[i + 1];
      i += 1;
    }
  }
  return { cmd, flags, values };
}

function usage() {
  console.log(`obsidian-life-memory CLI\n\nCommands:\n  init [--yes] [--dry-run] [--enable-heartbeat] [--timezone <tz>] [--every <expr>]\n  sync\n  doctor\n  rollback [--dry-run]\n\nExamples:\n  npx obsidian-life-memory init\n  npx obsidian-life-memory init --yes --enable-heartbeat --timezone Europe/Athens\n  npx obsidian-life-memory doctor\n  npx obsidian-life-memory rollback\n`);
}

function getConfig(pathKey) {
  return runSafe('openclaw', ['config', 'get', pathKey]);
}

function setConfig(pathKey, value, dryRun = false) {
  if (dryRun) {
    console.log(`[dry-run] openclaw config set ${pathKey} ${value}`);
    return;
  }
  run('openclaw', ['config', 'set', pathKey, value]);
}

function snapshotConfig(keys) {
  const snap = { createdAt: new Date().toISOString(), keys: {} };
  for (const key of keys) {
    const r = getConfig(key);
    snap.keys[key] = r.ok ? r.out : null;
  }
  return snap;
}

function restoreConfig(snapshot, dryRun = false) {
  for (const [key, value] of Object.entries(snapshot?.keys || {})) {
    if (value === null || value === '') {
      if (dryRun) console.log(`[dry-run] openclaw config unset ${key}`);
      else runSafe('openclaw', ['config', 'unset', key]);
    } else {
      setConfig(key, value, dryRun);
    }
  }
}

function installHookAndSync(dryRun = false) {
  const syncScript = path.join(ROOT, 'scripts', 'sync_live_copy.sh');
  if (dryRun) {
    console.log(`[dry-run] bash ${syncScript}`);
    console.log(`[dry-run] copy hook -> ${LIVE_HOOK_PATH}`);
    return;
  }
  run('bash', [syncScript]);
  ensureDir(path.dirname(LIVE_HOOK_PATH));
  fs.copyFileSync(path.join(ROOT, 'hooks', 'obsidian-preprompt.js'), LIVE_HOOK_PATH);
}

function applyHeartbeat({ timezone, every, dryRun }) {
  setConfig('hooks.internal.entries.obsidian-preprompt.env.OBSIDIAN_OPTIONAL_CONTEXT_FILES', 'Context/retrieval_policy.md,Context/now.md', dryRun);
  setConfig('agents.defaults.heartbeat.every', every, dryRun);
  setConfig('agents.defaults.heartbeat.activeHours.timezone', timezone, dryRun);
  setConfig('agents.defaults.heartbeat.model', 'google-antigravity/gemini-3-flash', dryRun);
  setConfig('agents.defaults.heartbeat.target', 'none', dryRun);
  setConfig('agents.defaults.heartbeat.prompt', 'Read HEARTBEAT.md strictly and follow it. Nudge-only: if nothing meaningful changed, reply HEARTBEAT_OK only. If you create/update meaningful nodes or detect an urgent action/deadline, send a short Telegram DM to 7874264051 via the message tool, then finish (do not include HEARTBEAT_OK).', dryRun);
}

async function cmdInit({ flags, values }) {
  const dryRun = flags.has('--dry-run');
  const yes = flags.has('--yes');
  let enableHeartbeat = flags.has('--enable-heartbeat');
  let timezone = values['--timezone'] || 'UTC';
  let every = values['--every'] || '30m';

  const keys = [
    'hooks.internal.entries.obsidian-preprompt.env.OBSIDIAN_OPTIONAL_CONTEXT_FILES',
    'agents.defaults.heartbeat.every',
    'agents.defaults.heartbeat.activeHours.timezone',
    'agents.defaults.heartbeat.model',
    'agents.defaults.heartbeat.target',
    'agents.defaults.heartbeat.prompt',
  ];

  if (!yes) {
    const rl = readline.createInterface({ input, output });
    const hb = (await rl.question('Enable Heartbeat Gardening setup? (y/N): ')).trim().toLowerCase();
    enableHeartbeat = hb === 'y' || hb === 'yes';
    if (enableHeartbeat) {
      const tz = (await rl.question(`Timezone [${timezone}]: `)).trim();
      const ev = (await rl.question(`Heartbeat interval [${every}]: `)).trim();
      if (tz) timezone = tz;
      if (ev) every = ev;
    }
    rl.close();
  }

  const snapshot = snapshotConfig(keys);

  console.log('Planned actions:');
  console.log('- Sync canonical skill to live copy');
  console.log('- Install/update obsidian preprompt hook');
  if (enableHeartbeat) {
    console.log(`- Configure heartbeat gardener (every=${every}, timezone=${timezone})`);
  } else {
    console.log('- Leave heartbeat config unchanged');
  }

  if (!yes && !dryRun) {
    const rl2 = readline.createInterface({ input, output });
    const ok = (await rl2.question('Apply these changes? (y/N): ')).trim().toLowerCase();
    rl2.close();
    if (!(ok === 'y' || ok === 'yes')) {
      console.log('Cancelled.');
      return;
    }
  }

  installHookAndSync(dryRun);

  // install templates only if missing
  const ctxDir = path.join(DEFAULT_WORKSPACE, 'Context');
  ensureDir(ctxDir);
  const tplNow = path.join(ROOT, 'templates', 'Context', 'now.example.md');
  const tplPolicy = path.join(ROOT, 'templates', 'Context', 'retrieval_policy.example.md');
  const nowPath = path.join(ctxDir, 'now.md');
  const policyPath = path.join(ctxDir, 'retrieval_policy.md');
  if (!fs.existsSync(nowPath)) {
    if (dryRun) console.log(`[dry-run] create ${nowPath}`);
    else fs.copyFileSync(tplNow, nowPath);
  }
  if (!fs.existsSync(policyPath)) {
    if (dryRun) console.log(`[dry-run] create ${policyPath}`);
    else fs.copyFileSync(tplPolicy, policyPath);
  }

  if (enableHeartbeat) {
    applyHeartbeat({ timezone, every, dryRun });
  }

  if (!dryRun) {
    writeJsonAtomic(LOCAL_INSTALL_STATE, {
      ...snapshot,
      lastAppliedAt: new Date().toISOString(),
      options: { enableHeartbeat, timezone, every },
    });
  }

  console.log(`\nDone.${dryRun ? ' (dry-run)' : ''}`);
  console.log('Run `obsidian-life-memory doctor` to validate setup.');
}

function cmdSync() {
  installHookAndSync(false);
  console.log('Synced skill and hook.');
}

function cmdDoctor() {
  const checks = [];
  checks.push(['canonical repo exists', fs.existsSync(path.join(ROOT, '.git'))]);
  checks.push(['live skill exists', fs.existsSync(LIVE_SKILL_DIR)]);
  checks.push(['live hook exists', fs.existsSync(LIVE_HOOK_PATH)]);
  checks.push(['template now exists', fs.existsSync(path.join(ROOT, 'templates', 'Context', 'now.example.md'))]);
  checks.push(['template policy exists', fs.existsSync(path.join(ROOT, 'templates', 'Context', 'retrieval_policy.example.md'))]);

  const oc = runSafe('openclaw', ['status']);
  checks.push(['openclaw reachable', oc.ok]);

  const hb = getConfig('agents.defaults.heartbeat.every');
  checks.push(['heartbeat configured', hb.ok && Boolean(hb.out)]);

  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? '✅' : '❌'} ${name}`);
    if (!ok) failed += 1;
  }
  if (failed > 0) process.exitCode = 1;
}

async function cmdRollback({ flags }) {
  const dryRun = flags.has('--dry-run');
  if (!fs.existsSync(LOCAL_INSTALL_STATE)) {
    throw new Error(`No install snapshot found at ${LOCAL_INSTALL_STATE}`);
  }
  const data = JSON.parse(fs.readFileSync(LOCAL_INSTALL_STATE, 'utf8'));
  if (!dryRun) {
    const rl = readline.createInterface({ input, output });
    const ok = (await rl.question('Restore saved OpenClaw config values now? (y/N): ')).trim().toLowerCase();
    rl.close();
    if (!(ok === 'y' || ok === 'yes')) {
      console.log('Cancelled.');
      return;
    }
  }
  restoreConfig(data, dryRun);
  console.log(`Rollback ${dryRun ? 'dry-run ' : ''}complete.`);
}

(async () => {
  try {
    const { cmd, flags, values } = parseArgs(process.argv.slice(2));
    if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
      usage();
      return;
    }
    if (cmd === 'init') return cmdInit({ flags, values });
    if (cmd === 'sync') return cmdSync();
    if (cmd === 'doctor') return cmdDoctor();
    if (cmd === 'rollback') return cmdRollback({ flags });

    usage();
    process.exitCode = 1;
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exitCode = 1;
  }
})();
