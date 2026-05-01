import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';
import { execSync, spawnSync } from 'child_process';

const MAX_READ = 8000;
const MAX_WRITE = 50000;

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'clipboard_read',
    label: 'Clipboard Read',
    description: 'Read current clipboard contents (Wayland primary via wl-paste).',
    parameters: Type.Object({}),
    async execute() {
      try {
        const text = execSync('wl-paste --no-newline 2>/dev/null || wl-paste 2>/dev/null', {
          encoding: 'utf8',
          timeout: 3000,
        }).slice(0, MAX_READ);
        if (!text.trim()) return { content: [{ type: 'text', text: '(clipboard empty)' }], details: undefined };
        return { content: [{ type: 'text', text: text }], details: undefined };
      } catch {
        return { content: [{ type: 'text', text: 'Failed to read clipboard.' }], details: undefined };
      }
    },
  });

  pi.registerCommand('paste', {
    description: 'Paste clipboard contents into the editor.',
    async handler(_args, ctx) {
      try {
        const text = execSync('wl-paste --no-newline 2>/dev/null || wl-paste 2>/dev/null', {
          encoding: 'utf8',
          timeout: 3000,
        }).slice(0, MAX_READ);
        if (!text.trim()) { ctx.ui.notify('Clipboard is empty.'); return; }
        ctx.ui.pasteToEditor(text);
      } catch {
        ctx.ui.notify('Failed to read clipboard.');
      }
    },
  });

  pi.registerTool({
    name: 'clipboard_write',
    label: 'Clipboard Write',
    description: 'Write text to the Wayland clipboard via wl-copy.',
    parameters: Type.Object({
      text: Type.String({ description: 'Text to copy to clipboard' }),
    }),
    async execute(_id, params) {
      if (params.text.length > MAX_WRITE) {
        return { content: [{ type: 'text', text: `Content too large (${params.text.length} chars, max ${MAX_WRITE}).` }], details: undefined };
      }
      const result = spawnSync('wl-copy', [], {
        input: params.text,
        encoding: 'utf8',
        timeout: 3000,
      });
      if (result.status !== 0) {
        return { content: [{ type: 'text', text: `wl-copy failed: ${result.stderr}` }], details: undefined };
      }
      const preview = params.text.slice(0, 80).replace(/\n/g, ' ');
      return { content: [{ type: 'text', text: `Copied (${params.text.length} chars): ${preview}${params.text.length > 80 ? '…' : ''}` }], details: undefined };
    },
  });
}
