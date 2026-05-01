import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';

const SEARXNG = 'http://100.65.133.78:8080/search';

async function searxng(query: string, engines = 'all', numResults = 5): Promise<string> {
  const paramsObj = new URLSearchParams({ q: query, format: 'json', engines, safesearch: '0' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const res = await fetch(`${SEARXNG}?${paramsObj}`, { signal: controller.signal });
  clearTimeout(timeout);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.results?.length) return 'No results.';
  return data.results.slice(0, numResults).map((r: any) =>
    `**${r.title.replace(/&[a-z]+;/g, '')}**\n${r.url}\n${r.content.replace(/<[^>]*>/g, '').trim().slice(0, 400)}...\n---`
  ).join('\n\n');
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'search',
    label: 'SearXNG',
    description: 'Search the web via private SearXNG. Top results with titles, URLs, snippets.',
    parameters: Type.Object({
      query: Type.String({ description: 'Search query' }),
      engines: Type.Optional(Type.String({ description: 'Engines (google,wikipedia), default all' })),
      numResults: Type.Optional(Type.Number({ description: 'Max results, default 5' })),
    }),
    async execute(_id, params, _signal, onUpdate) {
      const { query, engines = 'all', numResults = 5 } = params;
      onUpdate?.({ content: [{ type: 'text', text: `Searching '${query}'...` }], details: undefined });
      try {
        const text = await searxng(query, engines, numResults);
        return { content: [{ type: 'text', text: `Results for "${query}" (${engines}):\n\n${text}` }], details: undefined };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}.` }], details: undefined };
      }
    },
  });

  pi.registerCommand('search', {
    description: 'Search the web and inject results into conversation. Usage: /search <query>',
    async handler(args, ctx) {
      const query = args.trim();
      if (!query) { ctx.ui.notify('Usage: /search <query>'); return; }
      ctx.ui.setStatus('search', `Searching "${query}"…`);
      try {
        const text = await searxng(query);
        ctx.ui.setStatus('search', '');
        ctx.sendUserMessage(`Web search results for "${query}":\n\n${text}`, { deliverAs: 'followUp' });
      } catch (err) {
        ctx.ui.setStatus('search', '');
        ctx.ui.notify(`Search error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });
}
