import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const OBSIDIAN_DAILY_CMD = 'DISPLAY=:99 /usr/local/bin/obsidian-cli daily:read';
const OBSIDIAN_READ_PREFIX = 'DISPLAY=:99 /usr/local/bin/obsidian-cli read path=';
const CLI_TIMEOUT_MS = 3000;
const MAX_SNAPSHOT_CHARS = 12000;
const MAX_SNAPSHOT_TOKENS = Math.ceil(MAX_SNAPSHOT_CHARS / 4);
const MAX_STATE_DAYS = 14;

const GOVERNANCE_FILES = [
  'SOUL.md',
  'MEMORY.md',
  'AGENTS.md',
  'TOOLS.md',
];

const OPTIONAL_CONTEXT_FILES = [
  'Context/security_policy.md',
  'Context/job_routing_policy.md',
  ...String(process.env.OBSIDIAN_OPTIONAL_CONTEXT_FILES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
];

const GOVERNANCE_TOKEN_BUDGET = Math.floor(MAX_SNAPSHOT_TOKENS * 0.4);
const DAILY_TOKEN_BUDGET = Math.floor(MAX_SNAPSHOT_TOKENS * 0.6);

const MAX_RETRIEVAL_SNIPPETS = 4;
const MAX_RETRIEVAL_CHARS = 4500;
const MAX_QUERY_TERMS = 6;
const STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','but','by','for','from','how','i','if','in','into','is','it','its','me','my',
  'of','on','or','our','please','should','so','that','the','their','them','there','this','to','we','what','when',
  'where','which','who','why','with','would','you','your','about','just','tell','show','draft','message','email'
]);
const WRITE_AWARE_PATTERNS = [
  /\bactually\b/i,
  /\bupdate\b/i,
  /\bchanged?\b/i,
  /\bcorrection\b/i,
  /\bpaid\b/i,
  /\bconfirmed?\b/i,
  /\bno longer\b/i,
  /\bnow\b/i,
  /\bnew\b/i,
  /\buse this\b/i,
  /\bshould be\b/i,
  /\bisn't\b/i,
  /\bwasn't\b/i,
  /\bwrong\b/i,
];
const SEARCH_EXCLUDE_DIRS = new Set(['.git','node_modules','hooks','skills','dashboard_project','Archives','.openclaw']);

function resolveVaultRoot() {
  if (process.env.OBSIDIAN_VAULT_PATH) {
    return process.env.OBSIDIAN_VAULT_PATH;
  }

  try {
    const homedir = process.env.HOME || process.env.USERPROFILE || '/root';
    const configPath = path.join(
      homedir,
      '.local',
      'state',
      'obsidian-life-memory',
      'vault_config.json',
    );
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.vault_path) {
        return config.vault_path;
      }
    }
  } catch {
    // Fall through.
  }

  return process.cwd();
}

function getTodayDateString(now = new Date()) {
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

function trimTextToTokenBudget(text, tokenBudget) {
  const normalized = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!normalized || tokenBudget <= 0) {
    return '';
  }

  if (estimateTokens(normalized) <= tokenBudget) {
    return normalized;
  }

  const lines = normalized.split('\n');
  const kept = [];
  let used = 0;

  for (const line of lines) {
    const cost = estimateTokens(`${line}\n`);
    if (used + cost > tokenBudget) {
      break;
    }
    kept.push(line);
    used += cost;
  }

  return kept.join('\n').trim();
}

function computeSha256(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function getStateFilePath() {
  return path.join(resolveVaultRoot(), '.obsidian-bootstrap-state.json');
}

function readBootstrapState() {
  const statePath = getStateFilePath();
  if (!fs.existsSync(statePath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeBootstrapState(state) {
  const statePath = getStateFilePath();
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const entries = Object.entries(state || {}).sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  const trimmed = Object.fromEntries(entries.slice(0, MAX_STATE_DAYS));

  const tmpPath = `${statePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(trimmed, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, statePath);
}

function readDailyViaCli() {
  return execSync(OBSIDIAN_DAILY_CMD, {
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
  });
}

function readDailyViaFileFallback() {
  const filename = `${getTodayDateString()}.md`;
  const vaultRoot = resolveVaultRoot();
  const possiblePaths = [
    path.join(vaultRoot, 'Daily', filename),
    path.join(vaultRoot, 'memory', filename),
    path.join(vaultRoot, filename),
  ];

  for (const dailyPath of possiblePaths) {
    if (fs.existsSync(dailyPath)) {
      return fs.readFileSync(dailyPath, 'utf8');
    }
  }

  return '';
}

function readVaultFile(filename) {
  try {
    return execSync(`${OBSIDIAN_READ_PREFIX}${JSON.stringify(filename)}`, {
      encoding: 'utf8',
      timeout: CLI_TIMEOUT_MS,
    });
  } catch {
    const vaultRoot = path.resolve(resolveVaultRoot());
    const filePath = path.resolve(vaultRoot, filename);
    if (!filePath.startsWith(`${vaultRoot}${path.sep}`) && filePath !== vaultRoot) {
      return '';
    }
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
    return '';
  }
}

function readGovernanceFiles() {
  const governance = {};
  for (const filename of [...GOVERNANCE_FILES, ...OPTIONAL_CONTEXT_FILES]) {
    const content = readVaultFile(filename);
    if (content) {
      governance[filename] = content;
    }
  }
  return governance;
}

function extractCriticalConstraints(text) {
  if (!text) return '';

  const criticalKeywords = [
    'boundaries',
    'protocol',
    'critical',
    'violation',
    'safety',
    'security',
    'never',
    'always',
    'mandatory',
    'prohibited',
    'banned',
    'warning',
    '⚠️',
    '🚫',
    '❌',
  ];

  const lines = text.split('\n');
  const sections = [];
  let currentContent = [];
  let inCriticalSection = false;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const isHeading = /^#{1,6}\s/.test(line);

    if (isHeading) {
      if (inCriticalSection && currentContent.length > 0) {
        sections.push(currentContent.join('\n').trim());
      }
      currentContent = [line];
      inCriticalSection = criticalKeywords.some((keyword) => lower.includes(keyword));
      continue;
    }

    if (/^\s*[-*]\s+/.test(line) && criticalKeywords.some((keyword) => lower.includes(keyword))) {
      if (!inCriticalSection) {
        currentContent = ['## Critical Rules'];
        inCriticalSection = true;
      }
    }

    if (inCriticalSection) {
      currentContent.push(line);
    }
  }

  if (inCriticalSection && currentContent.length > 0) {
    sections.push(currentContent.join('\n').trim());
  }

  return sections.join('\n\n').trim();
}

function buildGovernanceContext(governanceFiles) {
  const fileLabels = {
    'SOUL.md': 'Behavioral Constraints (SOUL)',
    'MEMORY.md': 'Long-Term Rules & Protocols (MEMORY)',
    'AGENTS.md': 'Operational Protocols (AGENTS)',
    'TOOLS.md': 'Tool Usage Patterns (TOOLS)',
  };

  const sections = [];
  for (const [filename, content] of Object.entries(governanceFiles)) {
    const critical = extractCriticalConstraints(content);
    if (critical) {
      sections.push(`## ${fileLabels[filename] || filename}\n${critical}`);
    }
  }

  return sections.join('\n\n');
}

function findHeadingContext(lines, startIdx) {
  const headings = [];
  for (let index = 0; index <= startIdx; index += 1) {
    if (/^#{1,6}\s/.test(lines[index])) {
      headings.push(lines[index]);
    }
  }
  return headings;
}

function buildObsidianSafeSnapshot(raw, maxChars) {
  const text = String(raw || '').replace(/\r\n?/g, '\n').trim();
  if (!text) {
    return '';
  }
  if (text.length <= maxChars) {
    return text;
  }

  const lines = text.split('\n');
  const picked = [];
  let used = 0;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const cost = lines[index].length + 1;
    if (used + cost > Math.floor(maxChars * 0.65)) {
      continue;
    }
    picked.push(index);
    used += cost;
  }

  if (picked.length === 0) {
    return text.slice(-maxChars);
  }

  picked.sort((a, b) => a - b);
  const headingContext = findHeadingContext(lines, picked[0]);
  const output = [...headingContext, ...picked.map((index) => lines[index])];
  return output.join('\n').trim().slice(0, maxChars);
}

function buildTokenAwareDailySnapshot(rawDaily, previousState) {
  const normalized = String(rawDaily || '').replace(/\r\n?/g, '\n');
  const lines = normalized ? normalized.split('\n') : [];
  const lineCount = lines.length;
  const fullSnapshot = buildObsidianSafeSnapshot(normalized, MAX_SNAPSHOT_CHARS);

  let deltaText = '';
  if (previousState && Number.isInteger(previousState.lastLineCount) && lineCount > previousState.lastLineCount) {
    deltaText = lines.slice(previousState.lastLineCount).join('\n').trim();
  }

  const parts = [];
  let remaining = DAILY_TOKEN_BUDGET;

  if (deltaText) {
    const deltaBlock = trimTextToTokenBudget(`Since you last spoke:\n${deltaText}`, remaining);
    if (deltaBlock) {
      parts.push(deltaBlock);
      remaining -= estimateTokens(deltaBlock);
    }
  }

  if (remaining > 0) {
    const summaryBlock = trimTextToTokenBudget(fullSnapshot, remaining);
    if (summaryBlock) {
      parts.push(summaryBlock);
    }
  }

  return {
    dailyText: trimTextToTokenBudget(parts.join('\n\n---\n\n'), DAILY_TOKEN_BUDGET),
    lineCount,
    normalized,
  };
}

function buildOrientationSnapshot({ governanceContext, dailyText }) {
  const parts = [];
  let remaining = MAX_SNAPSHOT_TOKENS;

  if (governanceContext) {
    const governance = trimTextToTokenBudget(governanceContext, GOVERNANCE_TOKEN_BUDGET);
    if (governance) {
      parts.push(`# Behavioral Governance\n${governance}`);
      remaining -= estimateTokens(governance);
    }
  }

  if (dailyText && remaining > 0) {
    const daily = trimTextToTokenBudget(dailyText, Math.min(remaining, DAILY_TOKEN_BUDGET));
    if (daily) {
      parts.push(`# Session Orientation (daily/open items)\n${daily}`);
    }
  }

  return parts.join('\n\n---\n\n').trim();
}


function isLikelyWriteAwarePrompt(prompt) {
  const text = String(prompt || '').trim();
  return WRITE_AWARE_PATTERNS.some((rx) => rx.test(text));
}

function deriveFocusedQueries(prompt) {
  const text = String(prompt || '').replace(/[`*_#>\[\](){}]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return [];

  const quoted = Array.from(text.matchAll(/"([^"]{3,80})"|'([^']{3,80})'/g))
    .map((m) => (m[1] || m[2] || '').trim())
    .filter(Boolean)
    .slice(0, 2);

  const capitalizedPhrases = Array.from(text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g))
    .map((m) => m[1].trim())
    .filter((v) => v.length >= 4)
    .slice(0, 3);

  const terms = text.toLowerCase().split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
  const uniqTerms = [...new Set(terms)].slice(0, MAX_QUERY_TERMS);

  const queries = [];
  for (const q of [...quoted, ...capitalizedPhrases]) {
    if (!queries.includes(q)) queries.push(q);
  }
  if (uniqTerms.length) {
    const dense = uniqTerms.slice(0, 3).join(' ');
    if (dense && !queries.includes(dense)) queries.push(dense);
  }
  for (const t of uniqTerms.slice(0, 3)) {
    if (!queries.includes(t)) queries.push(t);
  }
  return queries.slice(0, 3);
}

function listVaultTextFiles(root) {
  const out = [];
  function walk(dir, rel='') {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const relPath = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        if (SEARCH_EXCLUDE_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), relPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(md|txt|json)$/i.test(entry.name)) continue;
      out.push(relPath);
    }
  }
  walk(root);
  return out;
}

function scoreCandidate(relPath, content, queries) {
  const hay = `${relPath}\n${String(content || '').slice(0, 4000)}`.toLowerCase();
  let score = 0;
  for (const q of queries) {
    const needle = q.toLowerCase();
    if (!needle) continue;
    if (relPath.toLowerCase().includes(needle)) score += 8;
    if (hay.includes(needle)) score += needle.includes(' ') ? 6 : 3;
  }
  if (/^(memory|Projects|People|Places|Context)\//.test(relPath)) score += 1;
  return score;
}

function buildSnippet(relPath, content, queries) {
  const text = String(content || '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  let best = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const lower = lines[i].toLowerCase();
    if (queries.some((q) => lower.includes(q.toLowerCase()))) { best = i; break; }
  }
  if (best === -1) {
    for (let i = 0; i < lines.length; i += 1) {
      if (/^#{1,3}\s|^-\s|^\|/.test(lines[i])) { best = i; break; }
    }
  }
  if (best === -1) best = 0;
  const start = Math.max(0, best - 3);
  const end = Math.min(lines.length, best + 7);
  const body = lines.slice(start, end).join('\n').trim();
  return `- ${relPath}\n${body}`.trim();
}

function retrieveTargetedVaultContext(prompt) {
  const vaultRoot = path.resolve(resolveVaultRoot());
  const queries = deriveFocusedQueries(prompt);
  if (!queries.length) return { queries: [], snippets: [], writeTargets: [] };

  const files = listVaultTextFiles(vaultRoot);
  const scored = [];
  for (const relPath of files) {
    let content = '';
    try { content = readVaultFile(relPath); } catch { continue; }
    const score = scoreCandidate(relPath, content, queries, prompt);
    if (score > 0) scored.push({ relPath, score, content });
  }
  scored.sort((a, b) => b.score - a.score || a.relPath.localeCompare(b.relPath));
  const top = scored.slice(0, MAX_RETRIEVAL_SNIPPETS);
  const snippets = top.map((item) => buildSnippet(item.relPath, item.content, queries));
  const writeTargets = top.slice(0, 3).map((item) => item.relPath);
  return { queries, snippets, writeTargets };
}

function buildBeforePromptContext(prompt) {
  const retrieval = retrieveTargetedVaultContext(prompt);
  if (!retrieval.snippets.length) return '';

  const parts = [];
  parts.push('# Obsidian Targeted Retrieval');
  parts.push('');
  parts.push(`Focus: ${String(prompt || '').trim().slice(0, 220)}`);
  parts.push(`Queries: ${retrieval.queries.map((q) => JSON.stringify(q)).join(', ')}`);
  parts.push('');
  parts.push('Relevant snippets:');
  parts.push(retrieval.snippets.join('\n\n'));

  if (isLikelyWriteAwarePrompt(prompt) && retrieval.writeTargets.length) {
    parts.push('');
    parts.push('Possible write targets / edit hints:');
    for (const target of retrieval.writeTargets) {
      parts.push(`- ${target} — already mentions this topic; likely place to update if the retrieved snippet is stale.`);
    }
    parts.push('Hook note: no vault write was performed. Decide explicitly later if an obsidian edit/append/create call is warranted.');
  }

  return String(parts.join('\n')).slice(0, MAX_RETRIEVAL_CHARS).trim();
}

function readThrottleWarning() {
  try {
    const flagFile = '/root/.openclaw/workspace/.claude_usage_flag';
    if (!fs.existsSync(flagFile)) {
      return '';
    }

    const flagContent = fs.readFileSync(flagFile, 'utf8');
    const throttle = flagContent.match(/CLAUDE_THROTTLE=(\d)/)?.[1];
    const weekly = flagContent.match(/CLAUDE_USAGE_WEEKLY=(\d+)/)?.[1];
    const sonnet = flagContent.match(/CLAUDE_USAGE_SONNET=(\d+)/)?.[1];
    if (throttle === '1' || (weekly && parseInt(weekly, 10) >= 70)) {
      return `⚠️ CLAUDE USAGE HIGH: ${weekly}% weekly / ${sonnet}% Sonnet used.\nTHROTTLE MODE: Minimise tool calls, combine operations, and skip redundant fetches.\n`;
    }
  } catch {
    // Non-fatal.
  }

  return '';
}

export default async function handler(event, context) {
  if (event.type === 'before_prompt_build') {
    try {
      const injected = buildBeforePromptContext(event.prompt || '');
      if (injected) {
        return { prependContext: injected };
      }
    } catch (error) {
      console.error('Obsidian before_prompt_build hook failure:', error.message);
    }
    return;
  }

  if (event.type !== 'agent:bootstrap') {
    return;
  }

  context.bootstrapFiles = context.bootstrapFiles || {};

  try {
    const today = getTodayDateString();
    const state = readBootstrapState();
    const dayState = state[today] || null;

    let rawDaily = '';
    try {
      rawDaily = readDailyViaCli();
    } catch {
      rawDaily = readDailyViaFileFallback();
    }

    const governanceFiles = readGovernanceFiles();
    const governanceContext = buildGovernanceContext(governanceFiles);
    const { dailyText, lineCount, normalized } = buildTokenAwareDailySnapshot(rawDaily, dayState);

    const governanceHash = computeSha256(governanceContext);
    const dailyHash = computeSha256(normalized);
    const combinedHash = computeSha256(`${governanceHash}:${dailyHash}`);

    let orientationSnapshot = '';
    if (dayState && dayState.combinedHash === combinedHash && dayState.snapshot) {
      orientationSnapshot = dayState.snapshot;
    } else {
      orientationSnapshot = buildOrientationSnapshot({ governanceContext, dailyText });
      state[today] = {
        governanceHash,
        dailyHash,
        combinedHash,
        lastLineCount: lineCount,
        snapshot: orientationSnapshot,
        lastUpdatedIso: new Date().toISOString(),
      };
      writeBootstrapState(state);
    }

    if (orientationSnapshot) {
      context.bootstrapFiles['OBSIDIAN_DAILY.md'] = [
        '# Obsidian Session Orientation',
        '',
        readThrottleWarning(),
        orientationSnapshot,
        '',
        '---',
        '*Injected at session start only. Per-turn vault retrieval now happens in before_prompt_build.*',
      ].join('\n');
      return;
    }

    context.bootstrapFiles['OBSIDIAN_DAILY.md'] = [
      '# Obsidian Session Orientation',
      '',
      'No daily orientation context was available yet.',
      '',
      governanceContext ? `# Behavioral Governance\n${governanceContext}` : '',
      '',
      '---',
      '*Injected at session start only. Per-turn vault retrieval now happens in before_prompt_build.*',
    ].join('\n');
  } catch (error) {
    context.bootstrapFiles['OBSIDIAN_ERROR.md'] = [
      '# Obsidian Memory Error',
      '',
      `The Obsidian bootstrap hook failed: ${error.message}`,
      '',
      'Session-start orientation was unavailable for this run.',
    ].join('\n');

    console.error('Obsidian bootstrap hook failure:', error.message);
  }
}
