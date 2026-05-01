import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';

const VAULT = '/home/tm/Documents/vault';
const AGENTS_MD = join(VAULT, 'AGENTS.md');
const WIKI_AGENTS_MD = join(VAULT, '30_knowledge/31_wiki/AGENTS.md');

// MCP tool names referenced in protocols → vault_* equivalents
const MCP_ADAPTER = `
## Tool Mapping (MCP not available)
MCP obsidian tools are unavailable in this context. Use these equivalents:
- \`mcp__obsidian__search_notes\` → \`vault_search\`
- \`mcp__obsidian__read_note\` → \`vault_read\`
- \`mcp__obsidian__write_note\` → \`vault_write\`
- \`mcp__obsidian__patch_note\` → \`vault_patch\`
- Directory listing → \`vault_list\`
`.trim();

let forbiddenPaths: string[] = [];

function parseForbiddenPaths(md: string): string[] {
  const forbidden: string[] = [];
  for (const match of md.matchAll(/- `([^`]+)`:\s*Access forbidden/g)) {
    forbidden.push(match[1]);
  }
  return forbidden;
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function safeVaultPath(rel: string): { full: string } | { error: string } {
  const full = join(VAULT, rel);
  if (!full.startsWith(VAULT + '/')) return { error: 'Path outside vault.' };
  for (const forbidden of forbiddenPaths) {
    if (rel.startsWith(forbidden)) return { error: `Access forbidden: ${forbidden}` };
  }
  return { full };
}

function searchVault(query: string, limit = 8): string {
  const files = execSync(
    `rg -l -i -g '*.md' ${shellEscape(query)} ${VAULT}`,
    { encoding: 'utf8', timeout: 10000 }
  ).trim().split('\n').filter(Boolean).slice(0, limit);

  if (!files.length) return 'No matches.';

  return files.map(file => {
    const rel = file.slice(VAULT.length + 1);
    try {
      const snippet = execSync(
        `rg -i -m 3 -A 3 -B 1 --no-heading --no-filename ${shellEscape(query)} ${shellEscape(file)}`,
        { encoding: 'utf8', timeout: 5000 }
      ).trim().slice(0, 500);
      return `**${rel}**\n${snippet}`;
    } catch {
      return `**${rel}**\n(match found, could not extract snippet)`;
    }
  }).join('\n\n---\n\n');
}

function walkMdRelative(dir: string, prefix: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = join(prefix, entry);
      if (statSync(full).isDirectory()) {
        results.push(...walkMdRelative(full, rel));
      } else if (entry.endsWith('.md')) {
        results.push(rel);
      }
    }
  } catch { /* skip unreadable dirs */ }
  return results;
}

export default function (pi: ExtensionAPI) {
  // Read protocols from disk on demand — once per agent turn, always fresh
  pi.on('before_agent_start', () => {
    let rootProtocol = '';
    let wikiProtocol = '';
    try {
      rootProtocol = readFileSync(AGENTS_MD, 'utf8');
      forbiddenPaths = parseForbiddenPaths(rootProtocol);
    } catch { forbiddenPaths = []; }
    try { wikiProtocol = readFileSync(WIKI_AGENTS_MD, 'utf8'); } catch { /* optional */ }

    if (!rootProtocol) return;
    const parts = [`# Vault Protocol\n\n${rootProtocol}`];
    if (wikiProtocol) parts.push(`# Wiki Protocol\n\n${wikiProtocol}`);
    parts.push(MCP_ADAPTER);
    return { systemPrompt: parts.join('\n\n---\n\n') };
  });

  // --- Tools ---

  pi.registerTool({
    name: 'vault_search',
    label: 'Vault Search',
    description: 'Full-text search across the JD vault at ~/Documents/vault. Returns matching notes with path and context lines.',
    parameters: Type.Object({
      query: Type.String({ description: 'Search terms (passed to rg, supports regex)' }),
      max_results: Type.Optional(Type.Number({ description: 'Max matching files to return, default 8' })),
    }),
    async execute(_id, params) {
      try {
        const text = searchVault(params.query, params.max_results ?? 8);
        return { content: [{ type: 'text', text: text }], details: undefined };
      } catch (err: any) {
        if (err.status === 1) return { content: [{ type: 'text', text: 'No matches.' }], details: undefined };
        return { content: [{ type: 'text', text: `Search error: ${err.message}` }], details: undefined };
      }
    },
  });

  pi.registerTool({
    name: 'vault_read',
    label: 'Vault Read',
    description: 'Read a specific note from the vault. Path is relative to vault root, e.g. "30_knowledge/31_wiki/foo.md".',
    parameters: Type.Object({
      path: Type.String({ description: 'Relative path from vault root' }),
    }),
    async execute(_id, params) {
      const resolved = safeVaultPath(params.path);
      if ('error' in resolved) return { content: [{ type: 'text', text: resolved.error }], details: undefined };
      try {
        return { content: [{ type: 'text', text: readFileSync(resolved.full, 'utf8') }], details: undefined };
      } catch {
        return { content: [{ type: 'text', text: `Not found: ${params.path}` }], details: undefined };
      }
    },
  });

  pi.registerTool({
    name: 'vault_list',
    label: 'Vault List',
    description: 'List notes in a vault directory. Path is relative to vault root, defaults to root.',
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: 'Relative directory path, e.g. "30_knowledge"' })),
    }),
    async execute(_id, params) {
      const rel = params.path ?? '';
      let dir: string;
      if (rel) {
        const resolved = safeVaultPath(rel);
        if ('error' in resolved) return { content: [{ type: 'text', text: resolved.error }], details: undefined };
        dir = resolved.full;
      } else {
        dir = VAULT;
      }
      try {
        const entries = readdirSync(dir).map(e => {
          const full = join(dir, e);
          return statSync(full).isDirectory() ? `${e}/` : e;
        });
        return { content: [{ type: 'text', text: entries.join('\n') }], details: undefined };
      } catch {
        return { content: [{ type: 'text', text: `Cannot list: ${rel || '/'}` }], details: undefined };
      }
    },
  });

  pi.registerTool({
    name: 'vault_write',
    label: 'Vault Write',
    description: 'Create or overwrite a note in the vault. Creates parent directories as needed. Fails if the note exists unless overwrite is true.',
    parameters: Type.Object({
      path: Type.String({ description: 'Relative path from vault root, e.g. "30_knowledge/31_wiki/new-note.md"' }),
      content: Type.String({ description: 'Full note content' }),
      overwrite: Type.Optional(Type.Boolean({ description: 'Allow overwriting an existing note (default false)' })),
    }),
    async execute(_id, params) {
      const resolved = safeVaultPath(params.path);
      if ('error' in resolved) return { content: [{ type: 'text', text: resolved.error }], details: undefined };
      if (!params.path.endsWith('.md')) return { content: [{ type: 'text', text: 'Path must end in .md' }], details: undefined };
      if (existsSync(resolved.full) && !params.overwrite) {
        return { content: [{ type: 'text', text: `Note already exists: ${params.path}. Pass overwrite: true to replace it.` }], details: undefined };
      }
      try {
        mkdirSync(dirname(resolved.full), { recursive: true });
        writeFileSync(resolved.full, params.content, 'utf8');
        return { content: [{ type: 'text', text: `Written: ${params.path} (${params.content.length} chars)` }], details: undefined };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Write failed: ${err.message}` }], details: undefined };
      }
    },
  });

  pi.registerTool({
    name: 'vault_patch',
    label: 'Vault Patch',
    description: 'Modify an existing note. Operations: append (add to end), prepend (add to start), replace-section (swap text between two markers).',
    parameters: Type.Object({
      path: Type.String({ description: 'Relative path from vault root' }),
      operation: Type.Union([
        Type.Literal('append'),
        Type.Literal('prepend'),
        Type.Literal('replace-section'),
      ], { description: 'append | prepend | replace-section' }),
      content: Type.String({ description: 'Content to insert or replacement text' }),
      marker_start: Type.Optional(Type.String({ description: 'For replace-section: exact string marking start of section to replace' })),
      marker_end: Type.Optional(Type.String({ description: 'For replace-section: exact string marking end of section to replace' })),
    }),
    async execute(_id, params) {
      const resolved = safeVaultPath(params.path);
      if ('error' in resolved) return { content: [{ type: 'text', text: resolved.error }], details: undefined };

      let existing: string;
      try {
        existing = readFileSync(resolved.full, 'utf8');
      } catch {
        return { content: [{ type: 'text', text: `Not found: ${params.path}` }], details: undefined };
      }

      let updated: string;
      if (params.operation === 'append') {
        updated = existing.trimEnd() + '\n\n' + params.content;
      } else if (params.operation === 'prepend') {
        updated = params.content + '\n\n' + existing.trimStart();
      } else {
        const start = params.marker_start;
        const end = params.marker_end;
        if (!start || !end) {
          return { content: [{ type: 'text', text: 'replace-section requires marker_start and marker_end.' }], details: undefined };
        }
        const si = existing.indexOf(start);
        const ei = existing.indexOf(end, si + start.length);
        if (si === -1 || ei === -1) {
          return { content: [{ type: 'text', text: `Markers not found in ${params.path}.` }], details: undefined };
        }
        updated = existing.slice(0, si) + params.content + existing.slice(ei + end.length);
      }

      try {
        writeFileSync(resolved.full, updated, 'utf8');
        return { content: [{ type: 'text', text: `Patched (${params.operation}): ${params.path}` }], details: undefined };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Write failed: ${err.message}` }], details: undefined };
      }
    },
  });

  // --- Commands ---

  pi.registerCommand('vault', {
    description: 'Search vault and inject results into conversation. Usage: /vault <query>',
    async handler(args, ctx) {
      const query = args.trim();
      if (!query) { ctx.ui.notify('Usage: /vault <query>'); return; }
      ctx.ui.setStatus('vault', `Searching vault for "${query}"…`);
      try {
        const results = searchVault(query);
        ctx.ui.setStatus('vault', '');
        ctx.sendUserMessage(`Vault search results for "${query}":\n\n${results}`, { deliverAs: 'followUp' });
      } catch (err: any) {
        ctx.ui.setStatus('vault', '');
        if (err.status === 1) ctx.ui.notify('No vault matches.');
        else ctx.ui.notify(`Vault search error: ${err.message}`);
      }
    },
  });

  pi.registerCommand('note', {
    description: 'Paste a vault note into the editor. Usage: /note <relative-path>',
    getArgumentCompletions(prefix) {
      const all = walkMdRelative(VAULT, '');
      return all
        .filter(p => p.toLowerCase().includes(prefix.toLowerCase()))
        .slice(0, 20)
        .map(p => ({ value: p, label: p }));
    },
    async handler(args, ctx) {
      const path = args.trim();
      if (!path) { ctx.ui.notify('Usage: /note <relative-path>'); return; }
      const resolved = safeVaultPath(path);
      if ('error' in resolved) { ctx.ui.notify(resolved.error); return; }
      try {
        ctx.ui.pasteToEditor(readFileSync(resolved.full, 'utf8'));
      } catch {
        ctx.ui.notify(`Note not found: ${path}`);
      }
    },
  });
}
