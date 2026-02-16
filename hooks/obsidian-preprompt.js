import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const OBSIDIAN_CLI_CMD = 'DISPLAY=:99 /usr/local/bin/obsidian-cli daily:read';
const CLI_TIMEOUT_MS = 3000;
const MAX_SNAPSHOT_CHARS = 12000;
const MAX_SNAPSHOT_TOKENS = Math.ceil(MAX_SNAPSHOT_CHARS / 4);

// Governance files to read from vault root
const GOVERNANCE_FILES = [
  'SOUL.md',
  'MEMORY.md',
  'AGENTS.md',
  'TOOLS.md',
];

// Token budget allocation: governance gets priority
const GOVERNANCE_TOKEN_BUDGET = Math.floor(MAX_SNAPSHOT_TOKENS * 0.4); // 40% for governance
const DAILY_TOKEN_BUDGET = Math.floor(MAX_SNAPSHOT_TOKENS * 0.6); // 60% for daily note

function resolveVaultRoot() {
  // 1. Check environment variable first
  if (process.env.OBSIDIAN_VAULT_PATH) {
    return process.env.OBSIDIAN_VAULT_PATH;
  }

  // 2. Try to read from Python CLI config file
  try {
    const homedir = process.env.HOME || process.env.USERPROFILE || '/root';
    const configPath = path.join(
      homedir,
      '.local',
      'state',
      'obsidian-life-memory',
      'vault_config.json'
    );
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.vault_path) {
        return config.vault_path;
      }
    }
  } catch {
    // Config file doesn't exist or is invalid, continue to fallback
  }

  // 3. Fall back to current working directory
  return process.cwd();
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
  const filename = `${getTodayDateString()}.md`;
  const vaultRoot = resolveVaultRoot();
  
  // Check multiple locations for daily note (OpenClaw supports various structures)
  const possiblePaths = [
    path.join(vaultRoot, 'Daily', filename),           // Standard Obsidian Daily folder
    path.join(vaultRoot, 'memory', filename),          // OpenClaw memory folder
    path.join(vaultRoot, filename),                    // Root level
  ];
  
  for (const dailyPath of possiblePaths) {
    if (fs.existsSync(dailyPath)) {
      return fs.readFileSync(dailyPath, 'utf8');
    }
  }
  
  // If not found anywhere, return empty (no daily note yet)
  return '';
}

/**
 * Read governance files from vault root
 * Returns object with file names as keys and content as values
 */
function readGovernanceFiles() {
  const vaultRoot = resolveVaultRoot();
  const governance = {};

  for (const filename of GOVERNANCE_FILES) {
    const filePath = path.join(vaultRoot, filename);
    try {
      if (fs.existsSync(filePath)) {
        governance[filename] = fs.readFileSync(filePath, 'utf8');
      }
    } catch (error) {
      // Silently skip files that can't be read
      console.error(`Failed to read governance file ${filename}:`, error.message);
    }
  }

  return governance;
}

/**
 * Extract critical constraints from governance file content
 * Looks for sections like: Boundaries, Protocols, Critical Violations, Safety, Security
 */
function extractCriticalConstraints(text, filename) {
  if (!text) return '';

  const criticalSections = [];
  const lines = text.split('\n');
  let currentSection = null;
  let currentContent = [];
  let inCriticalSection = false;

  // Keywords that indicate critical constraint sections
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
    'ban',
    'penalty',
    'consequence',
    'warning',
    '⚠️',
    '🚫',
    '❌',
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // Check if this line starts a heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      // Save previous section if it was critical
      if (inCriticalSection && currentContent.length > 0) {
        criticalSections.push({
          title: currentSection,
          content: currentContent.join('\n').trim(),
        });
      }

      // Start new section
      currentSection = headingMatch[2];
      currentContent = [line];
      // Check if this heading contains critical keywords
      inCriticalSection = criticalKeywords.some(kw => lowerLine.includes(kw));
      continue;
    }

    // Also check for bullet points that contain critical keywords (like "- Protocol:" or "- NEVER")
    if (line.match(/^\s*[-*]\s+/i)) {
      const isCriticalLine = criticalKeywords.some(kw => lowerLine.includes(kw));
      if (isCriticalLine) {
        // This is a critical bullet point, include it
        if (!inCriticalSection) {
          // Start capturing this as a standalone critical item
          currentSection = 'Critical Rules';
          currentContent = [];
          inCriticalSection = true;
        }
      }
    }

    if (inCriticalSection) {
      currentContent.push(line);
    }
  }

  // Don't forget the last section
  if (inCriticalSection && currentContent.length > 0) {
    criticalSections.push({
      title: currentSection,
      content: currentContent.join('\n').trim(),
    });
  }

  // Also extract any lines with "NEVER" or "ALWAYS" (strong constraints)
  const strongConstraints = [];
  for (const line of lines) {
    const upperLine = line.toUpperCase();
    if (upperLine.includes('NEVER') || upperLine.includes('ALWAYS') || upperLine.includes('MANDATORY')) {
      if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
        strongConstraints.push(line.trim());
      }
    }
  }

  // Combine extracted content
  const parts = [];

  for (const section of criticalSections) {
    parts.push(section.content);
  }

  if (strongConstraints.length > 0) {
    // Deduplicate
    const unique = [...new Set(strongConstraints)];
    parts.push('## Absolute Constraints', ...unique);
  }

  const result = parts.join('\n\n').trim();
  return result;
}

/**
 * Build unified governance context from all governance files
 */
function buildGovernanceContext(governanceFiles) {
  const sections = [];

  // Map filenames to friendly names
  const fileLabels = {
    'SOUL.md': 'Behavioral Constraints (SOUL)',
    'MEMORY.md': 'Long-Term Rules & Protocols (MEMORY)',
    'AGENTS.md': 'Operational Protocols (AGENTS)',
    'TOOLS.md': 'Tool Usage Patterns (TOOLS)',
  };

  for (const [filename, content] of Object.entries(governanceFiles)) {
    if (!content) continue;

    const critical = extractCriticalConstraints(content, filename);
    if (critical) {
      sections.push(`## ${fileLabels[filename] || filename}\n${critical}`);
    }
  }

  return sections.join('\n\n');
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

/**
 * Build unified context snapshot combining daily note and governance files
 * Governance files get priority for token budget
 */
function buildUnifiedSnapshot({ dailyText, governanceContext, tokenBudget }) {
  const parts = [];
  let remaining = tokenBudget;

  // PRIORITY 1: Governance context (behavioral constraints are critical)
  if (governanceContext) {
    const govHeader = '# Behavioral Governance\n';
    const govTokens = estimateTokens(governanceContext);
    const govBudget = Math.min(govTokens, GOVERNANCE_TOKEN_BUDGET);

    const trimmedGov = trimTextToTokenBudget(governanceContext, govBudget);
    if (trimmedGov) {
      parts.push(govHeader + trimmedGov);
      remaining -= estimateTokens(govHeader + trimmedGov);
    }
  }

  // PRIORITY 2: Daily note context
  if (dailyText && remaining > 0) {
    const dailyHeader = "# Today's Context (from daily note)\n";
    const dailyBudget = Math.min(remaining, DAILY_TOKEN_BUDGET);

    const trimmedDaily = trimTextToTokenBudget(dailyText, dailyBudget);
    if (trimmedDaily) {
      parts.push(dailyHeader + trimmedDaily);
    }
  }

  return parts.join('\n\n---\n\n').trim();
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

    // Read daily note
    try {
      obsidianOutput = readDailyViaCli();
    } catch (_cliError) {
      obsidianOutput = readDailyViaFileFallback();
    }

    // Read governance files
    const governanceFiles = readGovernanceFiles();
    const governanceContext = buildGovernanceContext(governanceFiles);

    // Compute combined hash for caching (daily + governance)
    const normalizedOutput = String(obsidianOutput || '').replace(/\r\n?/g, '\n');
    const governanceHash = computeSha256(governanceContext);
    const dailyHash = computeSha256(normalizedOutput);
    const combinedHash = computeSha256(dailyHash + governanceHash);

    const lineCount = normalizedOutput ? normalizedOutput.split('\n').length : 0;

    let safeSnapshot = '';

    // Use combined hash for cache validation
    if (dayState && dayState.combinedHash === combinedHash && dayState.snapshot) {
      safeSnapshot = dayState.snapshot;
    } else {
      // Build daily note snapshot
      const fullDailySnapshot = buildObsidianSafeSnapshot(normalizedOutput, MAX_SNAPSHOT_CHARS);

      // Build delta for daily note only
      let deltaText = '';
      if (dayState && Number.isInteger(dayState.lastLineCount) && lineCount > dayState.lastLineCount) {
        deltaText = normalizedOutput
          .split('\n')
          .slice(dayState.lastLineCount)
          .join('\n')
          .trim();
      }

      // Build token-aware daily content
      const dailyContent = buildTokenAwareSnapshot({
        deltaText,
        fullSnapshot: fullDailySnapshot,
        tokenBudget: DAILY_TOKEN_BUDGET,
      });

      // Build unified snapshot with governance priority
      safeSnapshot = buildUnifiedSnapshot({
        dailyText: dailyContent,
        governanceContext,
        tokenBudget: MAX_SNAPSHOT_TOKENS,
      });

      // Save state with combined hash
      state[today] = {
        noteHash: dailyHash,
        governanceHash,
        combinedHash,
        snapshot: safeSnapshot,
        lastLineCount: lineCount,
        lastUpdatedIso: new Date().toISOString(),
      };
      writeBootstrapState(state);
    }

    if (safeSnapshot) {
      context.bootstrapFiles['OBSIDIAN_DAILY.md'] = [
        '# Obsidian Context Snapshot',
        '',
        safeSnapshot,
        '',
        '---',
        '*Injected via Obsidian Pre-Prompt Hook (Governance + Daily Note)*',
      ].join('\n');
    } else {
      context.bootstrapFiles['OBSIDIAN_DAILY.md'] = [
        '# Obsidian Context Snapshot',
        '',
        'No log entries found for today yet. Use the obsidian-life-memory skill to log events.',
        '',
        governanceContext ? '\n# Behavioral Governance\n' + governanceContext : '',
      ].join('\n');
    }
  } catch (error) {
    context.bootstrapFiles['OBSIDIAN_ERROR.md'] = [
      '# Obsidian Memory Error',
      '',
      `The pre-prompt hook failed to load context: ${error.message}`,
      '',
      'Please check the Obsidian service status.',
    ].join('\n');

    console.error('Obsidian preprompt hook failure:', error.message);
  }
}
