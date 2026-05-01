import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';
import { spawn } from 'child_process';
import { createInterface } from 'readline';

const CLAUDE_BIN = '/home/tm/.nvm/versions/node/v20.19.3/bin/claude';
const VALID_PERMISSION_MODES = ['acceptEdits', 'bypassPermissions', 'dontAsk'];

interface RunOptions {
  cwd: string;
  model?: string;
  allowedTools?: string;
  permissionMode?: string;
  signal?: AbortSignal;
  onUpdate?: (text: string) => void;
}

interface RunResult {
  text: string;
  costUsd: number | null;
  permissionDenials: string[];
  exitCode: number | null;
  stderr: string;
}

function runClaude(prompt: string, opts: RunOptions): Promise<RunResult> {
  const mode = VALID_PERMISSION_MODES.includes(opts.permissionMode ?? '')
    ? opts.permissionMode!
    : 'acceptEdits';

  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--no-session-persistence',
    '--permission-mode', mode,
    '--model', opts.model ?? 'claude-sonnet-4-6',
  ];
  if (opts.allowedTools) args.push('--allowedTools', opts.allowedTools);

  return new Promise((resolve) => {
    const proc = spawn(CLAUDE_BIN, args, {
      cwd: opts.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderrBuf = '';
    let resultText = '';
    let accumulated = '';
    let costUsd: number | null = null;
    let permissionDenials: string[] = [];

    const onAbort = () => proc.kill('SIGTERM');
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    proc.stderr?.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString(); });

    const rl = createInterface({ input: proc.stdout! });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      let event: any;
      try { event = JSON.parse(line); } catch { return; }

      if (event.type === 'assistant') {
        const content: any[] = event.message?.content ?? [];
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            accumulated += block.text;
            opts.onUpdate?.(accumulated);
          } else if (block.type === 'tool_use') {
            accumulated += `\n[${block.name}: ${JSON.stringify(block.input).slice(0, 120)}]\n`;
            opts.onUpdate?.(accumulated);
          }
        }
      } else if (event.type === 'result') {
        resultText = event.result ?? '';
        costUsd = event.total_cost_usd ?? null;
        permissionDenials = event.permission_denials ?? [];
      }
    });

    proc.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort);
      resolve({
        text: resultText || accumulated,
        costUsd,
        permissionDenials,
        exitCode: code,
        stderr: stderrBuf.trim(),
      });
    });
  });
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'claude_task',
    label: 'Claude Code Task',
    description:
      'Delegate a task to Claude Code as a headless subagent. Claude Code has full tool access: read/write files, run bash, git, build tools, etc. Results stream back in real time. Use allowed_tools to restrict scope.',
    parameters: Type.Object({
      prompt: Type.String({ description: 'Task to delegate to Claude Code' }),
      cwd: Type.Optional(Type.String({ description: 'Working directory (default: current session cwd)' })),
      model: Type.Optional(Type.String({ description: 'Model override (default: claude-sonnet-4-6)' })),
      allowed_tools: Type.Optional(Type.String({ description: 'Comma-separated tool allowlist e.g. "Read,Bash(git *)" — omit for full access' })),
      permission_mode: Type.Optional(Type.String({ description: 'acceptEdits (default) | bypassPermissions | dontAsk' })),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: 'text', text: `Running Claude Code…\n` }], details: undefined });

      const result = await runClaude(params.prompt, {
        cwd: params.cwd ?? ctx.cwd,
        model: params.model,
        allowedTools: params.allowed_tools,
        permissionMode: params.permission_mode,
        signal,
        onUpdate: (text) => onUpdate?.({ content: [{ type: 'text', text }], details: undefined }),
      });

      if (result.exitCode !== 0 && !result.text) {
        return {
          content: [{ type: 'text', text: `Claude Code exited with code ${result.exitCode}.\n${result.stderr}` }],
          details: undefined,
        };
      }

      const costLine = result.costUsd !== null ? `\n\n---\nCost: $${result.costUsd.toFixed(6)}` : '';
      const denialWarn = result.permissionDenials.length
        ? `\n\nWarning: ${result.permissionDenials.length} permission denial(s) — some tool calls were blocked.`
        : '';

      return {
        content: [{ type: 'text', text: result.text + costLine + denialWarn }],
        details: undefined,
      };
    },
  });

  pi.registerCommand('run', {
    description: 'Delegate a task to Claude Code and inject the result. Usage: /run <prompt>',
    async handler(args, ctx) {
      const prompt = args.trim();
      if (!prompt) { ctx.ui.notify('Usage: /run <prompt>'); return; }
      ctx.ui.setStatus('run', 'Claude Code running…');
      try {
        const result = await runClaude(prompt, {
          cwd: ctx.cwd,
          onUpdate: (text) => ctx.ui.setWorkingMessage(text.split('\n').pop() ?? ''),
        });
        ctx.ui.setStatus('run', '');
        ctx.ui.setWorkingMessage();

        if (result.exitCode !== 0 && !result.text) {
          ctx.ui.notify(`Claude Code failed (exit ${result.exitCode})`);
          return;
        }

        const costLine = result.costUsd !== null ? `\n\n---\nCost: $${result.costUsd.toFixed(6)}` : '';
        ctx.sendUserMessage(`Claude Code result:\n\n${result.text}${costLine}`, { deliverAs: 'followUp' });
      } catch (err) {
        ctx.ui.setStatus('run', '');
        ctx.ui.notify(`Run error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });
}
