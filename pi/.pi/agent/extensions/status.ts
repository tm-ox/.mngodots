import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const C = {
  orange: "\x1b[38;2;255;158;100m",
  yellow: "\x1b[38;2;224;175;104m",
  red: "\x1b[38;2;247;118;142m",
  teal: "\x1b[38;2;115;218;202m",
  dim: "\x1b[38;2;133;141;173m",
  rst: "\x1b[0m",
};

const SEP = `${C.dim}  │  ${C.rst}`;

function hhmm(d: Date): string {
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function ctxColor(pct: number): string {
  if (pct >= 90) return C.red;
  if (pct >= 70) return C.yellow;
  return C.orange;
}

export default function (pi: ExtensionAPI) {
  let startMs = Date.now();
  let turns = 0;

  function push(ctx: any) {
    const usage = ctx.getContextUsage?.();
    const pct = usage?.percent != null ? Math.round(usage.percent) : null;

    const ctxPart =
      pct != null ? `${ctxColor(pct)}◆ ${pct}%${C.rst}` : `${C.dim}◆ —${C.rst}`;

    const parts = [
      ctxPart,
      `${C.orange}${hhmm(new Date(startMs))}${C.rst}`,
      `${C.dim}${elapsed(Date.now() - startMs)}${C.rst}`,
      `${C.dim}↺ ${turns}${C.rst}`,
    ];

    ctx.ui.setStatus("session-info", parts.join(SEP));
  }

  pi.on("session_start", (_e, ctx) => {
    startMs = Date.now();
    turns = 0;
    if (ctx.hasUI) push(ctx);
  });

  pi.on("before_agent_start", (_e, ctx) => {
    turns++;
    if (ctx.hasUI) push(ctx);
  });

  pi.on("message_end", (_e, ctx) => {
    if (ctx.hasUI) push(ctx);
  });

  pi.on("session_shutdown", (_e, ctx) => {
    if (ctx.hasUI) ctx.ui.setStatus("session-info", undefined);
  });
}
