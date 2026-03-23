import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

function cfg(api) {
  return api?.config?.plugins?.entries?.['obsidian-cli-tool']?.config ?? {};
}
function trunc(text, maxChars) {
  text = text || '';
  return text.length <= maxChars ? text : text.slice(0, maxChars) + `\n\n[truncated ${text.length - maxChars} chars]`;
}
async function run(api, subcommand, kv = {}, opts = {}) {
  const conf = cfg(api);
  const command = conf.command || 'obsidian-cli';
  const maxOutputChars = Number(conf.maxOutputChars || 20000);
  const args = [subcommand, ...Object.entries(kv).filter(([,v]) => v !== undefined && v !== null).map(([k,v]) => `${k}=${String(v)}`)];
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { maxBuffer: 20 * 1024 * 1024, timeout: opts.timeoutMs || 30000, env: process.env });
    return { ok: true, text: trunc(stdout || stderr || '', maxOutputChars), details: { command, args } };
  } catch (err) {
    const text = [err?.stdout, err?.stderr, err?.message].filter(Boolean).join('\n');
    return { ok: false, text: trunc(text, maxOutputChars), details: { command, args, error: true } };
  }
}
function reg(api, name, description, parameters, handler) {
  api.registerTool({ name, label: name, description, parameters, async execute(_id, params) { return handler(params || {}); } });
}
export default function register(api) {
  reg(api, 'obsidian_read', 'Read a note from the Obsidian vault.', {
    type: 'object', additionalProperties: false, properties: { path: { type: 'string' } }, required: ['path']
  }, async ({ path }) => {
    const r = await run(api, 'read', { path });
    return { content: [{ type: 'text', text: r.text }], details: r.details };
  });

  reg(api, 'obsidian_search', 'Search Obsidian notes by filename.', {
    type: 'object', additionalProperties: false, properties: { query: { type: 'string' } }, required: ['query']
  }, async ({ query }) => {
    const r = await run(api, 'search', { query });
    return { content: [{ type: 'text', text: r.text }], details: r.details };
  });

  reg(api, 'obsidian_search_content', 'Full-text search Obsidian notes with context.', {
    type: 'object', additionalProperties: false, properties: { query: { type: 'string' } }, required: ['query']
  }, async ({ query }) => {
    const r = await run(api, 'search-content', { query });
    return { content: [{ type: 'text', text: r.text }], details: r.details };
  });

  reg(api, 'obsidian_create', 'Create or overwrite a note in the Obsidian vault.', {
    type: 'object', additionalProperties: false, properties: { path: { type: 'string' }, content: { type: 'string' }, force: { type: 'boolean' } }, required: ['path','content']
  }, async ({ path, content, force }) => {
    const r = await run(api, 'create', { path, content, ...(force ? { force: 'true' } : {}) });
    return { content: [{ type: 'text', text: r.text }], details: r.details };
  });

  reg(api, 'obsidian_edit', 'Find and replace text within a vault note.', {
    type: 'object', additionalProperties: false, properties: { path: { type: 'string' }, find: { type: 'string' }, replace: { type: 'string' }, regex: { type: 'boolean' } }, required: ['path','find','replace']
  }, async ({ path, find, replace, regex }) => {
    const r = await run(api, 'edit', { path, find, replace, ...(regex ? { regex: 'true' } : {}) });
    return { content: [{ type: 'text', text: r.text }], details: r.details };
  });

  reg(api, 'obsidian_append', 'Append text to a note in the Obsidian vault.', {
    type: 'object', additionalProperties: false, properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path','content']
  }, async ({ path, content }) => {
    const r = await run(api, 'append', { path, content });
    return { content: [{ type: 'text', text: r.text }], details: r.details };
  });

  reg(api, 'obsidian_move', 'Move or rename a note and update wikilinks.', {
    type: 'object', additionalProperties: false, properties: { path: { type: 'string' }, to: { type: 'string' } }, required: ['path','to']
  }, async ({ path, to }) => {
    const r = await run(api, 'move', { path, to });
    return { content: [{ type: 'text', text: r.text }], details: r.details };
  });

  reg(api, 'obsidian_list', 'List notes in an Obsidian folder.', {
    type: 'object', additionalProperties: false, properties: { folder: { type: 'string' } }, required: ['folder']
  }, async ({ folder }) => {
    const r = await run(api, 'list', { folder });
    return { content: [{ type: 'text', text: r.text }], details: r.details };
  });

  reg(api, 'obsidian_daily_read', 'Read today\'s daily note.', {
    type: 'object', additionalProperties: false, properties: {} 
  }, async () => {
    const r = await run(api, 'daily:read', {});
    return { content: [{ type: 'text', text: r.text }], details: r.details };
  });

  reg(api, 'obsidian_daily_append', 'Append to today\'s daily note.', {
    type: 'object', additionalProperties: false, properties: { content: { type: 'string' } }, required: ['content']
  }, async ({ content }) => {
    const r = await run(api, 'daily:append', { content });
    return { content: [{ type: 'text', text: r.text }], details: r.details };
  });
}
