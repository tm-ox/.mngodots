import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

function hhmm(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function (pi: ExtensionAPI) {
  let startMs = Date.now();
  let turns = 0;

  function push(ctx: any) {
    const age = elapsed(Date.now() - startMs);
    const t = turns;
    const text = `${hhmm(new Date(startMs))}  ·  ${age}  ·  ${t} turn${t !== 1 ? 's' : ''}`;
    ctx.ui.setStatus('session-info', `\x1b[2m${text}\x1b[0m`);
  }

  pi.on('session_start', (_e, ctx) => {
    startMs = Date.now();
    turns = 0;
    if (ctx.hasUI) push(ctx);
  });

  pi.on('before_agent_start', (_e, ctx) => {
    turns++;
    if (ctx.hasUI) push(ctx);
  });

  pi.on('message_end', (_e, ctx) => {
    if (ctx.hasUI) push(ctx);
  });

  pi.on('session_shutdown', (_e, ctx) => {
    if (ctx.hasUI) ctx.ui.setStatus('session-info', undefined);
  });
}
