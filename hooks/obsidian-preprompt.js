import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const OBSIDIAN_CLI_CMD = 'DISPLAY=:99 /usr/local/bin/obsidian-cli daily:read';
const CLI_TIMEOUT_MS = 3000;
const MAX_SNAPSHOT_CHARS = 12000;
const MAX_SNAPSHOT_TOKENS = Math.ceil(MAX_SNAPSHOT_CHARS / 4);

function resolveVaultRoot() {
  return process.env.OBSIDIAN_VAULT_PATH || process.cwd();
}

function getTodayDateString() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function computeSha256(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
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

function buildTokenAwareSnapshot({ deltaText, fullSnapshot, tokenBudget }) {
  const parts = [];
  let remaining = tokenBudget;

  if (deltaText) {
    const deltaBlock = trimTextToTokenBudget(`Since you last spoke:\n${deltaText}`, remaining);
    if (deltaBlock) {
      parts.push(deltaBlock);
      remaining -= estimateTokens(deltaBlock);
    }
  }

  if (fullSnapshot && remaining > 0) {
    const summaryBlock = trimTextToTokenBudget(fullSnapshot, remaining);
    if (summaryBlock) {
      parts.push(summaryBlock);
    }
  }

  return trimTextToTokenBudget(parts.join('\n\n---\n\n'), tokenBudget);
}

function readDailyViaCli() {
  return execSync(OBSIDIAN_CLI_CMD, {
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
  });
}

function resolveDailyPath() {
  const filename = `${getTodayDateString()}.md`;

  const vaultRoot = resolveVaultRoot();
  return path.join(vaultRoot, 'Daily', filename);
}

function readDailyViaFileFallback() {
  const dailyPath = resolveDailyPath();
  if (!fs.existsSync(dailyPath)) {
    throw new Error(`Daily log not found at ${dailyPath}`);
  }
  return fs.readFileSync(dailyPath, 'utf8');
}

function extractWikilinks(text) {
  const matches = text.match(/!?\[\[[^\]]+\]\]/g) || [];
  return Array.from(new Set(matches));
}

function extractTags(text) {
  const matches = text.match(/(^|\s)(#[A-Za-z0-9_\/-]+)/gim) || [];
  const normalized = matches.map((m) => m.trim());
  return Array.from(new Set(normalized));
}

function extractTaskLines(lines) {
  return lines.filter((line) => /^\s*- \[( |x|X)\]\s/.test(line));
}

function extractCommentLines(lines) {
  const out = [];
  let inBlockComment = false;

  for (const line of lines) {
    if (line.includes('%%')) {
      const markerCount = (line.match(/%%/g) || []).length;
      if (markerCount % 2 === 1) {
        inBlockComment = !inBlockComment;
      }
      out.push(line);
      continue;
    }

    if (inBlockComment) {
      out.push(line);
    }
  }

  return out;
}

function findHeadingContext(lines, startIdx) {
  const headings = [];
  for (let i = 0; i <= startIdx; i += 1) {
    const line = lines[i];
    if (/^#{1,6}\s/.test(line)) {
      headings.push(line);
    }
  }
  return headings;
}

function clipFromTailByLine(lines, maxChars) {
  const picked = [];
  let used = 0;

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const candidate = lines[i];
    const cost = candidate.length + 1;

    // Never split lines: either include the full line or skip it.
    if (used + cost > maxChars) {
      continue;
    }

    picked.push(i);
    used += cost;
  }

  if (picked.length === 0) {
    return [];
  }

  picked.sort((a, b) => a - b);
  const startIdx = picked[0];
  const headingContext = findHeadingContext(lines, startIdx);

  const result = [];
  const seen = new Set();

  for (const heading of headingContext) {
    if (!seen.has(heading)) {
      result.push(heading);
      seen.add(heading);
    }
  }

  for (const idx of picked) {
    const line = lines[idx];
    if (line.length === 0 || !seen.has(line)) {
      result.push(line);
      seen.add(line);
    }
  }

  return result;
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
  const clippedLines = clipFromTailByLine(lines, Math.floor(maxChars * 0.65));
  const allTasks = extractTaskLines(lines);
  const allLinks = extractWikilinks(text);
  const allTags = extractTags(text);
  const commentLines = extractCommentLines(lines);

  const parts = [];

  parts.push('## Recent Snapshot');
  parts.push(clippedLines.join('\n').trim());

  if (allTasks.length) {
    parts.push('## Tasks (Preserved)');
    parts.push(allTasks.join('\n'));
  }

  if (allLinks.length) {
    parts.push('## Wikilinks (Graph Integrity)');
    parts.push(allLinks.join(' '));
  }

  if (allTags.length) {
    parts.push('## Tags');
    parts.push(allTags.join(' '));
  }

  if (commentLines.length) {
    parts.push('## Comments');
    parts.push(commentLines.join('\n'));
  }

  const assembled = parts.filter(Boolean).join('\n\n').trim();

  if (assembled.length <= maxChars) {
    return assembled;
  }

  // Final guard: still line-based clipping only, so wikilinks remain intact.
  const bounded = [];
  let used = 0;
  for (const line of assembled.split('\n')) {
    const cost = line.length + 1;
    if (used + cost > maxChars) {
      continue;
    }
    bounded.push(line);
    used += cost;
  }

  return `${bounded.join('\n').trim()}\n\n[Truncated safely by line boundaries to preserve Obsidian syntax]`;
}

export default async function handler(event, context) {
  if (event.type !== 'agent:bootstrap') {
    return;
  }

  context.bootstrapFiles = context.bootstrapFiles || {};

  try {
    const today = getTodayDateString();
    const state = readBootstrapState();
    const dayState = state[today] || null;
    let obsidianOutput = '';

    try {
      // Primary integration path: Obsidian CLI for current vault-aware daily note content.
      obsidianOutput = readDailyViaCli();
    } catch (_cliError) {
      // Fallback path: direct file read from Daily/YYYY-MM-DD.md.
      obsidianOutput = readDailyViaFileFallback();
    }

    const normalizedOutput = String(obsidianOutput || '').replace(/\r\n?/g, '\n');
    const noteHash = computeSha256(normalizedOutput);
    const lineCount = normalizedOutput ? normalizedOutput.split('\n').length : 0;

    let safeSnapshot = '';

    if (dayState && dayState.noteHash === noteHash && dayState.snapshot) {
      safeSnapshot = dayState.snapshot;
    } else {
      const fullSnapshot = buildObsidianSafeSnapshot(normalizedOutput, MAX_SNAPSHOT_CHARS);
      let deltaText = '';

      if (dayState && Number.isInteger(dayState.lastLineCount) && lineCount > dayState.lastLineCount) {
        deltaText = normalizedOutput
          .split('\n')
          .slice(dayState.lastLineCount)
          .join('\n')
          .trim();
      }

      safeSnapshot = buildTokenAwareSnapshot({
        deltaText,
        fullSnapshot,
        tokenBudget: MAX_SNAPSHOT_TOKENS,
      });

      state[today] = {
        noteHash,
        snapshot: safeSnapshot,
        lastLineCount: lineCount,
        lastUpdatedIso: new Date().toISOString(),
      };
      writeBootstrapState(state);
    }

    if (safeSnapshot) {
      context.bootstrapFiles['OBSIDIAN_DAILY.md'] = [
        '# Obsidian Daily Log Essence',
        '',
        safeSnapshot,
        '',
        '---',
        '*Injected via Obsidian Pre-Prompt Hook (CLI primary, file fallback)*',
      ].join('\n');
    } else {
      context.bootstrapFiles['OBSIDIAN_DAILY.md'] = [
        '# Obsidian Daily Log',
        '',
        'No log entries found for today yet. Use the obsidian-life-memory skill to log events.',
      ].join('\n');
    }
  } catch (error) {
    context.bootstrapFiles['OBSIDIAN_ERROR.md'] = [
      '# Obsidian Memory Error',
      '',
      `The pre-prompt hook failed to load today's log: ${error.message}`,
      '',
      'Please check the Obsidian service status.',
    ].join('\n');

    console.error('Obsidian preprompt hook failure:', error.message);
  }
}
