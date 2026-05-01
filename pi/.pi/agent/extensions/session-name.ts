import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

const MAX_WORDS = 6;
const MAX_CHARS = 48;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, MAX_WORDS)
    .join('-')
    .slice(0, MAX_CHARS);
}

export default function (pi: ExtensionAPI) {
  let named = false;

  pi.on('session_start', () => { named = false; });

  pi.on('before_agent_start', (event, ctx) => {
    if (named || pi.getSessionName()) { named = true; return; }
    const slug = slugify(event.prompt);
    if (slug) pi.setSessionName(slug);
    named = true;
  });

  pi.registerCommand('rename', {
    description: 'Rename the current session. Usage: /rename <label>',
    async handler(args, ctx) {
      const label = args.trim();
      if (!label) { ctx.ui.notify('Usage: /rename <label>'); return; }
      pi.setSessionName(label);
      named = true;
    },
  });
}
