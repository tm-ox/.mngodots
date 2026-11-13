// Map: every computer → hc session → space → tab → agent → its sub-agents, in one window (mod.open:map-tm; Ctrl+Shift+A opens it).
// Derived from jenthous/herdr-app-agent-map (MIT, see LICENSE); update check, demo data and language switch removed.
//
// A machine is a board (up to three columns; two machines share the full width). Inside, a tree with only what has a shape:
// a space whose one tab holds one agent is one line; a space with several tabs or terminals branches; an agent with
// sub-agents branches again. A space whose agents all rest folds to one line; an agent alone in its space that has rested
// 12 hours or more becomes a small cell under the tree. Computers are grouped and named as `hc machine ls` does.
//
// Keys (vim, as the other mods): j k rows, h l boards, g G ends, Enter go, / find, Ctrl R reply, Ctrl Z snooze 30 min,
// p peek, 1-9 answer a blocked agent's numbered prompt, a everything, s shells, = re-place boards, ? help, Esc clear / close.
// Reply and snooze match the agent switcher (jump-tm); the numbered answers, context % and snooze marks do too.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Popup } from "gpui-base";
import { hc, exec, notify, theme, props, closeOverlay, openOverlay, shared, setShared, spaces, panes, terminals, agents, run, readTextFile, appHome, settings, focused } from "herdr";
// Derived from jenthous/herdr-app-agent-map (MIT). The update check and the demo data are removed; vim keys, reply and snooze added.

const QUIET = 12 * 3600e3;
const DAY = 86400e3;
const LOCAL = "@local";
const COLORS = { indigo: "#5e6ad2", ocean: "#3d7ea6", teal: "#2f8a80", moss: "#5f8a5b", amber: "#b0873e", rust: "#b0634b", rose: "#b05a78", plum: "#7d62a8", slate: "#64748b" };
const RANK = { blocked: 4, working: 3, done: 2, idle: 1, shell: 0 };

const STR = {
  en: {
    title: "Agent map",
    sum: (w, b, d, bg) => `${w} working · ${b} waiting · ${d} done · ${bg} sub-agents`,
    thisComputer: "This computer",
    sessions: (n) => `${n} sessions`,
    session: "session",
    defaultSession: "default",
    tabs: (n) => `${n} tabs`,
    loose: "in the background",
    terms: (n) => `${n} terminals`,
    resting: "resting",
    quiet: (n) => `12h+ ${n}`,
    shells: (n) => `shells ${n}`,
    shell: "shell",
    alsoTab: "tab",
    all: "Everything",
    showShells: "Shells",
    find: "Find a machine, space, tab or agent",
    none: "Nothing matches",
    loading: "Reading…",
    here: "you are here",
    legend: "cells: rested 12h+",
    l1: "<1d", l2: "1–3d", l3: "3d+",
    ran: (m) => (m < 1 ? "<1m" : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`),
    ago: (m) => (m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`),
  },
};

// When each terminal's status last changed (ms), kept across opens.
const SINCE = new Map(); // address → { status, at }
// The last lines of a terminal's screen, read on hover: address → { at, text }.
const PEEK = new Map();
const CTX = new Map(); // address → { pct, tok } (context left, read off the agent's status line; shared "agent-ctx" is the switcher's cache)
const PEEK_FRESH = 15000;
const ROW = 28; // px per weight unit when a machine's spaces are split into columns
const DOCK_H = 320; // the docked preview: header + 14 lines without scrolling (it still scrolls if a line count ever exceeds that)

// A screen's last few lines worth reading: an agent's input box and status lines
// (under a ──── rule near the bottom) and blank lines left out.
function lastLines(text, n = 14) {
  let lines = String(text ?? "").split("\n").map((l) => l.replace(/\s+$/, ""));
  const tail = Math.max(0, lines.length - 14);
  const rule = lines.findIndex((l, i) => i >= tail && /^\s*[─━]{10,}/.test(l));
  if (rule > 0) lines = lines.slice(0, rule);
  return lines.filter((l) => l.trim()).slice(-n)
    .map((l) => l.replace(/^\s{8,}/, "  "))
    .map((l) => (l.length > 200 ? l.slice(0, 199) + "…" : l)).join("\n");
}

const stop = (_e, cx) => cx.stop_propagation();
// Style guide helpers (reference_herdr-mod-style): key chips and hint line.
const keyChip = (text, t) => div().px(6).h(18).min_w(18).flex().items_center().justify_center().flex_none().rounded(5).border_1().border_color(t.input ?? t.border).bg(t.raised).text_size(11).font_medium().text_color(t.muted).child(text);
const keyHints = (text, t) => h_flex().gap(14).items_center().min_w(0).overflow_hidden().children(text.split(" · ").map((seg) => {
  const w = seg.split(" "); let n = 1;
  while (n < w.length && /^[A-Z]$/.test(w[n])) n++;
  const label = w.slice(n).join(" ");
  return h_flex().gap(6).items_center().flex_none().child(keyChip(w.slice(0, n).join(" "), t)).when(Boolean(label), (e) => e.child(div().text_size(12).text_color(t.dim).child(label)));
}));
const HELP = [
  ["Move", [["j k · ↑ ↓", "Move between rows (Ctrl J K too)."], ["Ctrl+Shift+A · Ctrl N P", "Cycle through the agents only (Ctrl+Shift+A also opens the map from anywhere)."], ["h l · ← →", "Previous / next machine board."], ["g G", "First / last row."], ["/", "Find a machine, space, tab or agent (Esc clears)."]]],
  ["Act", [["Enter", "Jump to the selected agent and close."], ["Ctrl R", "Reply to the selected agent (Enter sends, even over a blocked prompt)."], ["Ctrl Z", "Snooze the agent for 30 minutes, again to undo (skipped by Alt+N)."], ["p · Ctrl O", "Peek: show that terminal over the current tab and close the map."], ["1-9", "Answer a blocked agent's numbered prompt."]]],
  ["Parked terminals (running, no pane)", [["Enter", "Bring it back as a split right of the focused pane."], ["t", "Bring it back as a new tab."], ["p", "Peek at it."], ["x", "Kill it (asks first)."]]],
  ["View", [["a", "Everything: also resting agents as full rows."], ["s", "Show plain shells too."], ["=", "Place the boards afresh."], ["Esc", "Close (first clears the find box or the reply)."], ["Ctrl+Shift+U", "Open the map on the parked terminals."]]],
];

// A theme color (maybe #rrggbbaa) at some opacity.
const alpha = (c, a) => String(c).slice(0, 7) + a;
const lower = (s) => String(s ?? "").toLowerCase();

export default class AgentMap extends View {
  init(_props, cx) {
    this.demo = null; // made-up boards, when config.json asks
    this.groups = null; // machine groups from hc
    this.all = shared("map-tm.all") === true;
    this.shells = shared("map-tm.shells") === true;
    this.query = "";
    // The terminal you were in when the map opened (focus stays under the window).
    this.hereAddr = focused()?.terminal ?? null;
    this.sel = this.hereAddr; // key of the selected row: starts there
    this.kb = Boolean(this.hereAddr); // shown selected, with its card, straight away
    this.hover = null; // { addr, label } under the pointer
    this.nav = []; // rows in reading order, rebuilt by render: { key, board, go }
    this.search = InputState.new({});
    this.replying = null; // { addr, label } while a reply to an agent is being typed
    this.replyIn = InputState.new({});
    this.replyIn.on("submit", (_e, cx) => this.sendReply(cx));
    this.search.on("change", (_e, cx) => { this.query = this.search.value(); this.sel = null; cx.notify(); });
    this.search.on("submit", (_e, cx) => { this.go(this.current()); cx.notify(); });
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.helpOpen = false;
    this.startParked = shared("map-tm.start") === "parked"; setShared("map-tm.start", null); // Ctrl+Shift+U: open on the parked terminals
    // Ctrl+Shift+A is a command of pane-parking: it opens this window, or, while it beats, bumps shared "map-tm.step" to step on.
    this.seenStep = shared("map-tm.step")?.n ?? 0;
    setShared("map-tm.beat", Date.now());
    cx.timer.every(500, () => setShared("map-tm.beat", Date.now()));
    cx.timer.every(120, (cx) => {
      const n = shared("map-tm.step")?.n ?? 0;
      if (n > this.seenStep) { const k = Math.min(n - this.seenStep, 20); this.seenStep = n; for (let i = 0; i < k; i++) this.moveSel(1, cx, true); cx.notify(); }
    });
    for (const [k, v] of Object.entries(shared("agent-ctx") || {})) if (v && typeof v.pct === "number") CTX.set(k, v);
    // Context figures: one agent screen read per 4 s, in turn (each at most every 15 s), like the switcher does.
    cx.timer.every(4000, (cx) => { const a = [...new Set(this.nav.map((r) => r.key.split("#")[0]))]; if (a.length) { this.rr = ((this.rr ?? -1) + 1) % a.length; this.peek(a[this.rr], cx); } });
    cx.spawn(async (cx) => {
      this.groups = await this.machines();
      cx.notify();
      if (this.hereAddr) this.peek(this.hereAddr, cx);
      this.readSince(cx);
    });
    // Ages tick; statuses are live anyway.
    cx.timer.every(30000, (cx) => { this.readSince(cx); cx.notify(); });
  }

  T() { return STR.en; }

  // Machine Rail's grouping: entries by host, the session-less entry first.
  async machines() {
    const r = await hc(["machine", "ls", "--json"]).catch(() => null);
    let list = [];
    try { list = JSON.parse(r?.stdout ?? "{}").machines ?? []; } catch {}
    const prefs = shared("machine.prefs") ?? {};
    const byHost = new Map();
    for (const m of list) {
      if (m.temporary) continue;
      const key = m.host || m.target || m.name;
      if (!byHost.has(key)) byHost.set(key, []);
      byHost.get(key).push(m);
    }
    const out = [{ key: LOCAL, label: prefs.alias?.[`g:${LOCAL}`] || null, color: prefs.color?.[`g:${LOCAL}`] ?? "slate", entries: [{ name: null, session: null }] }];
    for (const [key, entries] of byHost) {
      entries.sort((a, b) => (a.session == null ? -1 : b.session == null ? 1 : String(a.session).localeCompare(String(b.session))));
      const main = entries[0];
      out.push({ key, label: prefs.alias?.[`g:${key}`] || (main.session == null ? main.name : main.target), color: prefs.color?.[`g:${key}`] ?? null, entries });
    }
    const order = prefs.order ?? [];
    const rank = (k) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
    return out.map((g, i) => ({ g, i })).sort((a, b) => rank(a.g.key) - rank(b.g.key) || a.i - b.i).map((x) => x.g);
  }

  // Ask hc when each resting agent's status last changed (once per status change).
  readSince(cx) {
    if (this.demo) return;
    const want = [], now = new Map();
    for (const p of panes()) if (p.terminal && p.status) now.set(p.terminal, p.status);
    // sub-agents too: their pills say how long they've been at it
    for (const k of terminals()) if (k.parent && k.state === "live" && k.status && !now.has(k.address)) now.set(k.address, k.status);
    for (const [a, st] of now) {
      const known = SINCE.get(a);
      if (!known || known.status !== st) want.push(a);
    }
    if (!want.length || this.reading) return;
    this.reading = true;
    cx.spawn(async (cx) => {
      const queue = [...want];
      const worker = async () => {
        for (let a; (a = queue.shift()); ) {
          try {
            const r = await hc(["get", a, "--json"]);
            const j = JSON.parse(r.stdout);
            SINCE.set(a, { status: now.get(a) ?? null, at: j.status_ms ?? 0 });
          } catch { SINCE.set(a, { status: null, at: 0 }); }
        }
      };
      await Promise.all(Array.from({ length: 8 }, worker));
      this.reading = false;
      cx.notify();
    });
  }

  // ---------- the model ----------

  // [{ g, label, color, sessions: [{ name, spaces: [{ id, name, tabs: [{ id, name, terms }] }] }] }]
  model() {
    const T = this.T();
    if (this.demo) return this.demo.map((b) => (b.g.key === "@local" ? { ...b, label: T.thisComputer } : b));
    const ps = panes();
    const all = terminals();
    const byAddr = new Map(all.map((x) => [x.address, x]));
    const inPane = new Set(ps.map((p) => p.terminal).filter(Boolean));
    const kids = (addr) => all.filter((k) => k.parent === addr && k.state === "live").map((k) => ({
      address: k.address, name: k.name || k.address.split("/").pop(), status: k.status || "idle", alsoTab: inPane.has(k.address),
    }));
    const entryOf = new Map();
    for (const g of this.groups ?? []) for (const e of g.entries) entryOf.set(e.name ?? null, { g, session: e.session });
    const out = new Map();
    for (const g of this.groups ?? []) out.set(g.key, { g, label: g.key === LOCAL ? (g.label || T.thisComputer) : g.label, color: COLORS[g.color] ?? null, sessions: new Map() });
    for (const sp of spaces()) {
      const where = entryOf.get(sp.machine ?? null);
      if (!where) continue;
      const box = out.get(where.g.key);
      const sname = where.session ?? "";
      if (!box.sessions.has(sname)) box.sessions.set(sname, { name: sname, spaces: [], loose: [] });
      const tabs = sp.tabs.map((tb) => ({
        id: tb.id, name: tb.name,
        terms: ps.filter((p) => p.tab === tb.id && p.terminal).map((p) => ({
          address: p.terminal, pane: p.pane, space: sp.id, tab: tb.id,
          status: p.status ? p.status : "shell", app: p.app, program: p.program ?? null, title: byAddr.get(p.terminal)?.name || p.app || "",
          bg: kids(p.terminal),
        })),
      }));
      box.sessions.get(sname).spaces.push({ id: sp.id, name: sp.name, tabs });
    }
    // Running with no tab and no parent shown anywhere (`hc run --bg --no-parent`, a
    // script started from outside Herdr): nowhere else to see them, so a group of
    // their own in their session.
    const shownParent = (k) => k.parent && inPane.has(k.parent) && byAddr.get(k.parent)?.state === "live";
    for (const k of all) {
      if (k.state !== "live" || inPane.has(k.address) || shownParent(k)) continue;
      const where = entryOf.get(k.address.includes("/") ? k.address.split("/")[0] : null);
      if (!where) continue;
      const box = out.get(where.g.key), sname = where.session ?? "";
      if (!box.sessions.has(sname)) box.sessions.set(sname, { name: sname, spaces: [], loose: [] });
      box.sessions.get(sname).loose.push({
        address: k.address, name: k.name || k.program?.name || k.address.split("/").pop(), status: k.status || "bg",
        alsoTab: false, loose: true, since: k.created_ms ?? null,
      });
    }
    return [...out.values()].map((b) => ({ ...b, sessions: [...b.sessions.values()] }));
  }

  // Read the screen of what's under the pointer (at most every 15 s per terminal).
  peek(addr, cx) {
    const p = PEEK.get(addr);
    if ((p && Date.now() - p.at < PEEK_FRESH) || p?.busy) return;
    PEEK.set(addr, { ...(p ?? { text: "" }), busy: true, at: p?.at ?? 0 });
    cx.spawn(async (cx) => {
      let text = p?.text ?? "";
      try {
        const r = await hc(["read", addr, "--json"]);
        if (r.code === 0) {
          const full = String(JSON.parse(r.stdout).text ?? ""); text = lastLines(full);
          const cm = [...full.matchAll(/ctx:\s*(\d+)%(?:\(([\d.]+k?)\))?/g)].pop();
          if (cm) { CTX.set(addr, { pct: Number(cm[1]), tok: cm[2] ?? "" }); setShared("agent-ctx", { ...(shared("agent-ctx") || {}), [addr]: { pct: Number(cm[1]), tok: cm[2] ?? "" } }); }
        }
      } catch {}
      PEEK.set(addr, { at: Date.now(), text, busy: false });
      cx.notify();
    });
  }

  // Hovering shows a card at once (a tooltip waits half a second): what it is and
  // the last lines on its screen, read on the first hover.
  // `key` tells apart two drawings of one terminal (a sub-agent's pill and its own
  // tab's row): each needs its own element ids and place, or their hovers fight.
  hoverOn(addr, label, bi, key = addr) {
    return (h, cx) => {
      if (h) {
        if (this.away === key) return;
        this.away = null;
        this.kb = false; // the pointer took over: no keyboard card left behind when it goes
        this.hover = { addr, label, key };
        this.peek(addr, cx);
        cx.notify();
      }
      else {
        if (this.away === key) this.away = null; // left it: pointing at it again shows the card again
        if (this.hover?.key === key) { this.hover = null; cx.notify(); }
      }
    };
  }

  // The card (what it is, the last lines on its screen), hung under the item by a
  // Popup, which measures the item and keeps the card inside the window. It shows
  // for the item under the pointer, else, once the arrows are used, the selected one.
  // The card for the arrow keys hangs under the selected item (a Popup measures
  // it). The pointer's card is drawn by the window itself (pointerCard), at a place
  // worked out before it's drawn, so it never shows up somewhere first and moves.
  pop(t, T, addr, label, el, bi, under = false, key = addr) {
    (this.infos ??= {})[key] = { addr, label };
    return Popup.new(`am-pop-${key}`, el
      .on_mouse_move((e, cx) => {
        const b = e.bounds, q = e.position;
        if (!b) return;
        // moves reach every element: only the one under the pointer says where it is
        // (the same terminal can be drawn twice, as a pill and as a row)
        if (q && (q.x < b.x || q.y < b.y || q.x > b.x + b.width || q.y > b.y + b.height)) return;
        const o = (this.boxes ??= {})[key];
        if (o && o.x === b.x && o.y === b.y && o.width === b.width) return;
        this.boxes[key] = { x: b.x, y: b.y, width: b.width, height: b.height, bi, under };
        if (this.hover?.key === key) cx.notify();
      }))
      .anchor("top_left");
  }

  // Width of a board column inside the window (for a card when the item itself has not been measured yet).
  colWidth() {
    // The window's width times the dialog's 0.8 until the pointer has measured it; a nested row is 70 px short of its column.
    let w = this.rootB?.width;
    if (!w) { try { w = Math.floor(window.viewport_size().width * 0.8); } catch { w = 1100; } }
    const n = this.ncols || 1;
    return Math.floor((w - 28 - 12 * (n - 1)) / n) - 70;
  }

  // Beside the item for rows and pills, over the neighbouring column (right; left
  // from the right-hand column), its top level with the item, so the column you move
  // through stays clear; under it for cells (you move across those). Nothing is
  // drawn until the item's and the window's places are known.
  pointerCard(t, T) { return null; // replaced by withCard (card under the board)
    // eslint-disable-next-line no-unreachable
    const h = this.hover, b = h && this.boxes?.[h.key], r = this.rootB;
    if (!b || !r) return null;
    const W = Math.max(376, Math.floor(b.width)), H = 64 + 16 * Math.min(14, String(PEEK.get(h.addr)?.text ?? "").split("\n").length);
    let x, y;
    if (b.under) { x = b.x - r.x; y = b.y - r.y + b.height + 4; }
    else {
      const right = (this.colOfBoard?.[b.bi] ?? 0) < 2;
      x = right ? b.x - r.x + b.width + 12 : b.x - r.x - W - 12;
      y = b.y - r.y - 2;
    }
    x = Math.max(8, Math.min(x, r.width - W - 8));
    y = Math.max(52, Math.min(y, r.height - 34 - H));
    // never over the item itself: the card would take the pointer, go away, give it
    // back, and blink. Try the other side, then under it.
    const bx = b.x - r.x, by = b.y - r.y;
    const over = (cx0, cy0) => cx0 < bx + b.width && cx0 + W > bx && cy0 < by + b.height && cy0 + H > by;
    if (over(x, y)) {
      const other = x > bx ? bx - W - 12 : bx + b.width + 12;
      if (other >= 8 && other <= r.width - W - 8 && !over(other, y)) x = other;
      else { x = Math.max(8, Math.min(bx, r.width - W - 8)); y = by + b.height + 4; }
    }
    return div().id("am-pointer-card").absolute().left(x).top(y)
      // a card can't let the pointer through: reaching it puts it away
      .on_hover((on, cx) => { if (on) { this.away = h.key; this.hover = null; cx.notify(); } })
      .child(this.cardBody(t, T, h.addr, h.label, W));
  }

  cardBody(t, T, addr, label, w = 376) {
    const p = PEEK.get(addr);
    const text = p?.text || (p && !p.busy ? "" : T.loading);
    const mono = settings().font_family ?? "JetBrains Mono";
    return v_flex().w(w).p(10).gap(6).rounded(8)
      .bg(t.raised).border_1().border_color(t.border).shadow_lg()
      .child(h_flex().gap(8).items_center().text_size(11.5).text_color(t.foreground)
        .child(div().min_w(0).truncate().font_semibold().child(label))
        .child(div().flex_1())
        .child(div().flex_none().text_color(t.dim).font_family(mono).text_size(11).child(addr)))
      .when(Boolean(text), (el) => el.child(v_flex().text_size(11.5).font_family(mono).text_color(t.muted)
        .children(text.split("\n").map((l) => div().truncate().child(l || " ")))));
  }


  since(x) { return x.mins != null ? Date.now() - x.mins * 60000 : SINCE.get(x.address)?.at ?? 0; }
  // The agent's own icon (programs.json): all of them, only the ones that aren't the
  // usual agent here, or none (shared agent-map.icons; trying it out).
  showIcon(x) {
    const mode = shared("map-tm.icons") ?? "all";
    if (mode === "off" || !x.program?.icon || !x.app) return false;
    return mode === "all" || x.program.key !== this.usual;
  }
  // Its own colors while it works, waits, is done or rested under 6 hours; after that
  // a gray silhouette, darker the longer it rests (6–12 h, under a day, 1–3 days, older).
  appIcon(t, x, size) {
    const p = x.program;
    if (!this.live(x)) {
      const at = this.since(x), rest = at ? Date.now() - at : Infinity;
      if (rest >= 6 * 3600e3) return svg(p.icon).size(size).flex_none().text_color(this.restGray(t, rest));
    }
    return p.tint ? svg(p.icon).size(size).flex_none().text_color(t.foreground) : image(p.icon).w(size).h(size).flex_none();
  }
  restGray(t, rest) {
    return rest < QUIET ? t.muted : rest < DAY ? t.dim : rest < 3 * DAY ? alpha(t.dim, "aa") : alpha(t.dim, "66");
  }
  live(x) { return x.status === "working" || x.status === "blocked" || x.status === "done"; }
  // The terminal focused under this window: marked, and never folded away.
  here(x) { return Boolean(this.hereAddr) && x.address === this.hereAddr; }
  resting(x) { const at = this.since(x); return !at || Date.now() - at >= QUIET; }

  matches(q, b, s, sp, tb, x) {
    return [b.label, s.name, sp.name, tb.name, x.app, x.title, x.address, ...x.bg.map((k) => k.name)].some((v) => lower(v).includes(q));
  }

  // ---------- going there ----------

  go(row) {
    if (!row || this.demo) return;
    row.go();
    this.shut();
  }
  goTerm(x) {
    if (x.app) run("agent.focus", { terminal: x.address });
    else { run("space.select", { id: x.space }); run("tab.select", { id: x.tab }); run("pane.focus", { pane: x.pane }); }
  }
  current() { return this.nav.find((r) => r.key === this.sel) ?? this.nav[0]; }

  // Reply to the selected agent (hc send --force, so it can answer a blocked prompt), as the agent switcher does.
  startReply(cx) {
    const cur = this.current(); if (!cur || this.demo) return;
    const addr = cur.key.split("#")[0], a = agents().find((x) => x.address === addr);
    this.replying = { addr, label: a?.tab_name || a?.space_name || addr };
    this.replyIn.set_value(""); this.replyIn.focus(); cx.notify();
  }

  sendReply(cx) {
    const r = this.replying, text = this.replyIn.value().trim();
    if (!r || !text) return;
    hc(["send", "--force", r.addr, text]).then((x) => { if (x.code !== 0) notify({ title: "Reply failed", body: String(x.stderr ?? "").slice(0, 120), level: "warning", timeout: 4000 }); });
    this.replying = null; this.replyIn.set_value(""); this.handle.focus(); cx.notify();
  }

  // Snooze 30 min (again: unsnooze): shared "snoozed", honoured by the Alt+N tour and the status bar's needs-you count.
  snooze(cx) {
    const cur = this.current(); if (!cur) return;
    const addr = cur.key.split("#")[0], s = { ...(shared("snoozed") || {}) }, on = s[addr] > Date.now();
    if (on) delete s[addr]; else s[addr] = Date.now() + 30 * 60 * 1000;
    for (const x of Object.keys(s)) if (s[x] <= Date.now()) delete s[x];
    setShared("snoozed", s);
    notify({ title: on ? "Unsnoozed" : "Snoozed 30 min", body: "", level: "info", timeout: 1500 });
  }

  shut() { setShared("map-tm.beat", 0); closeOverlay(props().overlay); }

  // Peek: the terminal shown over the current tab (hc terminal.peek), as the switcher does for parked terminals.
  peekTerm() {
    const addr = this.current()?.key.split("#")[0]; if (!addr) return;
    this.shut();
    run("terminal.peek", { terminal: addr });
  }

  // Numbered choices on a blocked agent's screen (permission prompts: "1. Yes", "2. No, ..."), from its last 14 lines.
  options(addr) {
    if (!addr || agents().find((a) => a.address === addr)?.status !== "blocked") return [];
    const out = [];
    for (const l of String(PEEK.get(addr)?.text ?? "").split("\n").slice(-14)) { const m = l.match(/^\s*[❯>›]?\s*(\d)\.\s+(.+?)\s*$/); if (m) out.push({ n: m[1], text: m[2] }); }
    return out;
  }

  answer(addr, n, cx) {
    hc(["keys", addr, n]).then(() => { PEEK.delete(addr); cx.timer.after(700, (cx) => { this.peek(addr, cx); cx.notify(); }); });
  }

  // agentsOnly (Ctrl N / Ctrl P): cycle through the agents themselves, skipping sub-agent pills; wraps around.
  moveSel(step, cx, agentsOnly = false) {
    this.kb = true;
    const rows = agentsOnly ? this.nav.filter((r) => !r.key.includes("#")) : this.nav;
    const n = rows.length; if (!n) return;
    const i = rows.findIndex((r) => r.key === this.sel);
    this.sel = rows[i < 0 ? (step > 0 ? 0 : n - 1) : (i + step + n) % n].key;
    this.hover = null; this.away = null;
    if (this.sel) this.peek(this.sel.split("#")[0], cx);
  }

  // Vim keys like the rest of the setup: j k rows, h l boards, g G ends; arrows and Ctrl N P J K work too.
  key(e, cx) {
    const typing = !this.handle.is_focused();
    const k = e.key, ctrl = Boolean(e.modifiers?.control), shift = Boolean(e.modifiers?.shift);
    if (this.helpOpen) { this.helpOpen = false; cx.stop_propagation(); cx.notify(); return; }
    if (typing && ctrl && shift && String(k).toLowerCase() === "v") { // dictation pastes with Ctrl+Shift+V, which a mod input ignores
      const box = this.replying ? this.replyIn : this.search;
      exec("wl-paste", ["-n"]).then((r) => { if (r.code === 0 && r.stdout) { box.replace(String(r.stdout).replace(/\r?\n/g, " ")); box.focus(); } });
      cx.stop_propagation(); return;
    }
    if (k === "escape") {
      // the first Esc closes the reply / clears the search / leaves the box; only a bare Esc closes the window
      if (this.replying) { this.replying = null; this.replyIn.set_value(""); this.handle.focus(); cx.stop_propagation(); cx.notify(); }
      else if (this.query) { this.search.set_value(""); this.query = ""; this.handle.focus(); cx.stop_propagation(); cx.notify(); }
      else if (typing) { this.handle.focus(); cx.stop_propagation(); cx.notify(); }
      else this.shut();
    } else if (typing) {
      if (k === "down" || k === "up") { this.handle.focus(); this.moveSel(k === "down" ? 1 : -1, cx); } else return;
    } else if (ctrl && !shift && k === "n") {
      this.moveSel(1, cx, true);
    } else if (ctrl && !shift && k === "p") {
      this.moveSel(-1, cx, true);
    } else if (k === "down" || (!ctrl && k === "j") || (ctrl && k === "j")) {
      this.moveSel(1, cx);
    } else if (k === "up" || (!ctrl && k === "k") || (ctrl && k === "k")) {
      this.moveSel(-1, cx);
    } else if (!ctrl && (k === "left" || k === "right" || k === "h" || (k === "l" && !shift))) {
      this.kb = true;
      const cur = this.current();
      const boards = [...new Set(this.nav.map((r) => r.board))];
      const bi = boards.indexOf(cur?.board);
      const fwd = k === "right" || k === "l";
      const next = boards[(bi + (fwd ? 1 : -1) + boards.length) % boards.length];
      this.sel = this.nav.find((r) => r.board === next)?.key ?? this.sel;
      this.hover = null; this.away = null;
      if (this.sel) this.peek(this.sel.split("#")[0], cx);
    } else if (k === "enter") {
      this.go(this.current());
    } else if (ctrl && !shift && k === "r") {
      this.startReply(cx);
    } else if (ctrl && !shift && k === "z") {
      this.snooze(cx);
    } else if (ctrl && !shift && k === "o") {
      this.peekTerm();
    } else if (e.modifiers?.platform || ctrl) {
      return;
    } else if (k === "g" && !shift) {
      this.kb = true; if (this.nav.length) { this.sel = this.nav[0].key; this.peek(this.sel.split("#")[0], cx); }
    } else if (k === "G" || (k === "g" && shift)) {
      this.kb = true; if (this.nav.length) { this.sel = this.nav[this.nav.length - 1].key; this.peek(this.sel.split("#")[0], cx); }
    } else if (k === "/" && !shift) {
      this.search.focus();
    } else if (k === "t" && this.looseKeys.has(this.sel)) {
      const addr = this.sel.split("#")[0]; this.shut(); run("terminal.keep", { terminal: addr, place: "tab" });
    } else if (k === "x" && this.looseKeys.has(this.sel)) {
      const addr = this.sel.split("#")[0], x = terminals().find((y) => y.address === addr), name = x?.labels?.pname || x?.name || addr;
      this.shut(); openOverlay({ mod: "confirm", kind: "dialog", width: 420, props: { title: "Kill " + name + "?", detail: "Ends the terminal and whatever is running in it.", command: { name: "terminal.kill", args: { terminal: addr } } } });
    } else if (k === "p") {
      this.peekTerm();
    } else if (k === "?" || (k === "/" && shift)) {
      this.helpOpen = true;
    } else if (/^[1-9]$/.test(k)) {
      const addr = this.current()?.key.split("#")[0];
      if (this.options(addr).some((o) => o.n === k)) this.answer(addr, k, cx); else return;
    } else if (k === "a") {
      this.all = !this.all; setShared("map-tm.all", this.all);
    } else if (k === "=") {
      setShared("map-tm.layout", null);
    } else if (k === "s") {
      this.shells = !this.shells; setShared("map-tm.shells", this.shells);
    } else return;
    cx.stop_propagation();
    cx.notify();
  }

  // ---------- where boards go ----------

  // As many columns as there are boards, up to three: two machines share the full width. A computer keeps the column
  // it was given (saved in shared "map-tm.layout") while that column still exists; the rest go under the shortest one.
  // Dragging a board's head moves it; "=" places them all afresh.
  place(drawn) {
    const n = Math.min(3, Math.max(1, drawn.length));
    const saved = shared("map-tm.layout")?.cols ?? [];
    const shown = new Set(drawn.map((d) => d.key));
    const cols = Array.from({ length: n }, (_, i) => (saved[i] ?? []).filter((k) => shown.has(k)));
    const weight = (k) => drawn.find((d) => d.key === k)?.weight ?? 0;
    const h = cols.map((c) => c.reduce((a, k) => a + weight(k), 0));
    const have = new Set(cols.flat());
    for (const d of drawn) {
      if (have.has(d.key)) continue;
      const i = h.indexOf(Math.min(...h));
      cols[i].push(d.key); h[i] += d.weight;
    }
    return cols;
  }

  // A board in its column: it takes a drop above it while one is dragged.
  slot(t, d, col, T) {
    const k = d.key, dragged = this.drag === k, over = this.over?.col === col && this.over?.before === k;
    return div().id(`am-slot-${k}`).relative().when(dragged, (el) => el.opacity(0.4))
      .on_mouse_move((_e, cx) => { if (this.drag && this.drag !== k && !(this.over?.col === col && this.over?.before === k)) { this.over = { col, before: k }; cx.notify(); } })
      .when(over, (el) => el.child(div().absolute().top(-8).left(0).right(0).h(3).rounded(2).bg(t.accent)))
      .child(d.el);
  }

  // The preview is docked along the bottom of the window, the full width, at a fixed height: whatever the number of
  // agents, it never covers the list (the list scrolls above it) and never moves. Its lines scroll when they don't fit.
  dock(t, T) {
    const key = this.hover?.key ?? (this.kb && this.sel !== this.away ? this.sel : null);
    const info = key == null ? null : this.hover ?? this.infos?.[key];
    if (!info?.addr) return null;
    const p = PEEK.get(info.addr), text = p?.text || (p && !p.busy ? "" : T.loading), mono = settings().font_family ?? "JetBrains Mono";
    return v_flex().id("am-dock").flex_none().h(DOCK_H).px(14).py(8).gap(6).border_t(1).border_color(t.border).bg(t.raised)
      .child(h_flex().flex_none().gap(8).items_center().text_size(11.5).text_color(t.foreground)
        .child(div().min_w(0).truncate().font_semibold().child(info.label))
        .child(div().flex_1())
        .child(div().flex_none().text_color(t.dim).font_family(mono).text_size(11).child(info.addr)))
      .child(v_flex().id("am-dock-text").flex_1().min_h(0).overflow_y_scrollbar().text_size(11.5).font_family(mono).text_color(t.muted)
        .children(String(text).split("\n").map((l) => div().child(l || " "))));
  }

  // Below a column's last board: a drop there puts it at the end.
  tail(t, col) {
    const over = this.over?.col === col && this.over?.before == null;
    return div().id(`am-tail-${col}`).relative().h(this.drag ? 120 : 0)
      .on_mouse_move((_e, cx) => { if (this.drag && !(this.over?.col === col && this.over?.before == null)) { this.over = { col, before: null }; cx.notify(); } })
      .when(over, (el) => el.child(div().absolute().top(-8).left(0).right(0).h(3).rounded(2).bg(t.accent)));
  }

  drop(cx) {
    const k = this.drag, o = this.over;
    this.drag = null; this.over = null;
    if (k && o) {
      const saved = (shared("map-tm.layout")?.cols ?? []).map((c) => c.filter((x) => x !== k));
      while (saved.length <= o.col) saved.push([]);
      const c = saved[o.col], i = o.before ? c.indexOf(o.before) : -1;
      c.splice(i < 0 ? c.length : i, 0, k);
      setShared("map-tm.layout", { cols: saved });
    }
    cx.notify();
  }

  // ---------- drawing ----------

  render() {
    const t = theme(), T = this.T();
    const boards = this.groups ? this.model() : [];
    { // the agent most terminals run: "other" mode leaves its icon out
      const n = new Map(), progs = new Map();
      for (const b of boards) for (const se of b.sessions) for (const sp of se.spaces) for (const tb of sp.tabs) for (const x of tb.terms)
        if (x.app && x.program?.key) { n.set(x.program.key, (n.get(x.program.key) ?? 0) + 1); progs.set(x.program.key, x.program); }
      this.usual = [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      this.usualProgram = progs.get(this.usual)?.icon ? progs.get(this.usual) : null;
    }
    const q = lower(this.query.trim());
    this.nav = []; this.looseKeys = new Set();
    const drawn = boards.map((b, bi) => { const d = this.board(t, T, b, bi, q); return d && { ...d, bi }; }).filter(Boolean);
    if (this.startParked && boards.length) {
      const first = this.nav.find((r) => this.looseKeys.has(r.key));
      if (first) { this.sel = first.key; this.kb = true; }
      this.startParked = false;
    }
    if (this.groups && this.sel != null && !this.nav.some((r) => r.key === this.sel)) this.sel = null; // not before the machines are loaded: the first draw has no rows, which cleared the opening selection (and its preview)
    const placed = this.place(drawn);
    this.ncols = placed.length;
    this.colOfBoard = {};
    placed.forEach((keys, ci) => keys.forEach((k) => { const d = drawn.find((x) => x.key === k); if (d) this.colOfBoard[d.bi] = ci; }));
    const cols = placed.map((keys, ci) => keys.map((k) => this.slot(t, drawn.find((d) => d.key === k), ci, T)));
    const n = { working: 0, blocked: 0, done: 0, bg: 0 };
    for (const b of boards) for (const s of b.sessions) for (const sp of s.spaces) for (const tb of sp.tabs) for (const x of tb.terms) {
      if (n[x.status] != null) n[x.status]++;
      n.bg += x.bg.length;
    }
    let body;
    if (!this.groups) body = div().p(16).text_color(t.dim).child(T.loading);
    else if (!drawn.length) body = div().p(16).text_color(t.dim).child(T.none);
    else body = h_flex().items_start().gap(12).p(14).children(cols.map((c, ci) => v_flex().flex_1().min_w(0).gap(12).children(c).child(this.tail(t, ci))));
    this.shown = this.hover?.addr ?? (this.kb && this.sel !== this.away ? this.sel?.split("#")[0] ?? null : null);
    const cur = this.current(), curAddr = cur?.key.split("#")[0], opts = this.replying ? [] : this.options(curAddr);
    return v_flex().id("agent-map").relative().track_focus(this.handle).size_full()
      .on_mouse_up("left", (_e, cx) => this.drop(cx))
      .on_mouse_move((e) => { const b = e.bounds; if (b) this.rootB = { x: b.x, y: b.y, width: b.width, height: b.height }; })
      .on_hover((h, cx) => { if (!h && this.hover) { this.hover = null; cx.notify(); } }).min_h(0)
      .rounded(10).overflow_hidden().border_1().border_color(t.border).bg(t.background).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => this.key(e, cx))
      .child(this.header(t, T, n))
      .when(this.helpOpen, (el) => el.child(h_flex().flex_1().min_h(0).items_start().gap(28).p(18).children([HELP.slice(0, 2), HELP.slice(2)].map((col, ci) =>
        v_flex().id(`am-help-${ci}`).flex_1().min_w(0).h_full().min_h(0).gap(14).overflow_y_scrollbar().children(col.map(([title, rows]) =>
          v_flex().gap(6).flex_none().child(div().px(2).text_size(12).font_semibold().text_color(t.muted).child(title.toUpperCase())).children(rows.map(([keys, text]) =>
            h_flex().gap(10).items_start().child(div().w(130).flex_none().flex().flex_wrap().gap(4).children(keys.split(" · ").map((kk) => keyChip(kk, t))))
              .child(div().flex_1().min_w(0).text_size(12).text_color(t.muted).child(text))))))))))
      .when(!this.helpOpen, (el) => el.child(div().id("am-scroll").flex_1().min_h(0).overflow_y_scrollbar().child(body)))
      .when(!this.helpOpen, (el) => el.child(this.dock(t, T) ?? div()))
      .when(!this.helpOpen && opts.length > 0, (el) => el.child(h_flex().flex_none().px(14).py(8).gap(8).items_center().flex_wrap().border_t(1).border_color(t.border)
        .child(div().text_size(10).font_medium().text_color(t.accent).child("ANSWER"))
        .children(opts.slice(0, 6).map((o) => h_flex().id(`am-opt-${o.n}`).h(24).px(8).gap(6).items_center().rounded(6).border_1().border_color(t.border).cursor_pointer().hover((x) => x.bg(t.hover))
          .on_mouse_down("left", stop).on_click((_e, cx) => this.answer(curAddr, o.n, cx))
          .child(keyChip(o.n, t)).child(div().max_w(260).truncate().text_size(12).text_color(t.muted).child(o.text))))))
      .when(!this.helpOpen && Boolean(this.replying), (el) => el.child(h_flex().h(40).flex_none().px(14).gap(10).items_center().border_t(1).border_color(t.accent)
        .child(h_flex().gap(6).items_center().flex_none().child(div().text_size(12).font_medium().text_color(t.accent).child("Reply to " + this.replying.label)).child(div().text_size(11).text_color(t.dim).child(this.replying.addr)))
        .child(div().flex_1().min_w(0).child(Input.new(this.replyIn).w_full().h(26).px(10).rounded(9).border_1().border_color(t.accent).bg(t.raised).text_size(12.8).text_color(t.foreground)))
        .child(keyHints("Enter send · Esc back", t))))
      ;
  }

  kbd(t, k) {
    return div().px(4).rounded(4).border_1().border_color(t.border).text_size(10.5).text_color(t.muted).child(k);
  }

  header(t, T, n) {
    // Toggles: standard border, no fill, accent text when on (style guide).
    const chip = (id, label, on, flip) => div().id(id).px(8).h(20).flex().items_center().rounded(6).border_1().border_color(t.border)
      .text_size(11).text_color(on ? t.accent : t.dim).cursor_pointer().on_mouse_down("left", stop).on_click((_e, cx) => { flip(); cx.notify(); }).child(label);
    return h_flex().h(30).flex_none().pr(10).items_center().gap(10).border_b(1).border_color(t.border)
      .child(div().h_full().pl(12).pr(2).flex().items_center().flex_none().text_size(12).font_medium().text_color(t.accent).child("Map"))
      .child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(T.sum(n.working, n.blocked, n.done, n.bg)))
      .child(h_flex().id("am-find").w(240).h(22).px(8).gap(6).items_center().rounded(9).border_1()
        .border_color(this.query ? t.accent : t.border).bg(t.raised).on_mouse_down("left", stop)
        .child(div().relative().flex_1().min_w(0)
          .child(Input.new(this.search).w_full().h(20).items_center().text_size(12))
          .when(!this.query, (el) => el.child(div().absolute().left(0).top(2).text_size(12).text_color(t.dim).child(T.find))))
        .child(keyChip("/", t)))
      .child(div().flex_1())
      .child(keyHints(this.looseKeys?.has(this.sel) ? "Enter split · t tab · p peek · x kill" : "Ctrl R reply · Ctrl Z snooze · p peek", t))
      .child(chip("am-all", T.all, this.all, () => { this.all = !this.all; setShared("map-tm.all", this.all); }))
      .child(chip("am-shells", T.showShells, this.shells, () => { this.shells = !this.shells; setShared("map-tm.shells", this.shells); }))
      .when(!this.replying && this.handle.is_focused(), (el) => el.child(div().id("am-help").cursor_pointer().on_mouse_down("left", stop).on_click((_e, cx) => { this.helpOpen = !this.helpOpen; cx.notify(); }).child(keyChip("?", t))));
  }

  cellColor(t, age) {
    return age === "fresh" ? alpha(t.muted, "cc") : age === "mid" ? alpha(t.muted, "55") : t.background;
  }

  statusColor(t, s) {
    return s === "blocked" ? t.blocked : s === "working" ? t.working : s === "done" ? t.done : null;
  }

  // As Herdr marks them: working spins, blocked a red dot, done a check, idle an
  // empty ring (each its own shape, not just a color); a shell a small square.
  dot(t, s, size = 14) {
    const slot = div().size(size).flex_none().flex().items_center().justify_center();
    if (s === "working") return slot.child(svg("mods/map-tm/icons/spinner.svg").size(size - 3).text_color(t.working).spin(900));
    if (s === "blocked" || s === "error") return slot.child(div().size(7).rounded(4).bg(t.blocked));
    if (s === "done") return slot.child(svg("mods/map-tm/icons/check.svg").size(size - 2).text_color(t.done));
    if (s === "shell") return slot.child(div().size(7).rounded(2).border_1().border_color(t.border));
    // running, but its program reports no status
    if (s === "bg") return slot.child(div().size(6).rounded(3).bg(t.muted));
    return slot.child(div().size(7).rounded(4).border(1.5).border_color(t.idle ?? t.dim));
  }

  counts(t, list) {
    const n = { blocked: 0, working: 0, done: 0, idle: 0 };
    for (const x of list) if (n[x.status] != null) n[x.status]++;
    const one = (s, v) => h_flex().gap(2).items_center().child(this.dot(t, s, 12)).child(String(v));
    return h_flex().gap(6).items_center().text_size(10.5).text_color(t.dim)
      .when(n.blocked > 0, (el) => el.child(one("blocked", n.blocked)))
      .when(n.working > 0, (el) => el.child(one("working", n.working)))
      .when(n.done > 0, (el) => el.child(one("done", n.done)))
      .child(one("idle", n.idle));
  }

  // A board: null when nothing in it is shown.
  board(t, T, b, bi, q) {
    const terms = (s) => s.spaces.flatMap((sp) => sp.tabs.flatMap((tb) => tb.terms));
    const mine = b.sessions.flatMap(terms).filter((x) => this.shells || x.app);
    if (!mine.length && !b.sessions.some((s) => s.loose?.length)) return null;
    const color = b.color ?? t.dim;
    const multi = b.sessions.length > 1;
    const parts = [];
    let weight = 3;
    for (const s of b.sessions) {
      const part = this.sessionPart(t, T, b, s, bi, q, color);
      if (!part) continue;
      weight += part.weight;
      parts.push(multi
        ? v_flex().mx(8).mt(8).rounded(8).border_1().border_color(t.border)
          .child(h_flex().h(26).px(10).gap(6).items_center().border_b(1).border_color(t.border).text_size(11.5)
            .child(div().text_color(t.dim).child(T.session))
            .child(div().font_semibold().text_color(t.muted).child(s.name || T.defaultSession))
            .child(div().flex_1()).child(this.counts(t, terms(s).filter((x) => this.shells || x.app))))
          .child(part.el)
        : part.el);
    }
    if (!parts.length) return null;
    const el = v_flex().rounded(10).border_1().border_color(mine.some((x) => x.status === "blocked") ? alpha(t.blocked, "99") : t.border).bg(t.background).pb(multi ? 8 : 0)
      .child(h_flex().id(`am-head-${b.g.key}`).h(36).px(12).gap(8).items_center().border_b(1).border_color(t.border).cursor_pointer()
        .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.drag = b.g.key; this.over = null; cx.notify(); })
        .child(div().size(10).rounded(3).bg(color))
        .child(div().font_semibold().child(b.label))
        .when(multi, (el) => el.child(div().px(5).rounded(5).border_1().border_color(t.border).text_size(10.5).text_color(t.dim).child(T.sessions(b.sessions.length))))
        .child(div().flex_1()).child(this.counts(t, mine)))
      .children(parts);
    return { el, weight, key: b.g.key };
  }

  sessionPart(t, T, b, s, bi, q, color) {
    this.lineColor = color;
    const rows = [], quiet = [];
    let weight = 0;
    for (const sp of s.spaces) {
      const w0 = weight, n0 = rows.length;
      const units = sp.tabs.map((tb) => ({ tb, xs: tb.terms.filter((x) => (this.shells || x.app) && (!q || this.matches(q, b, s, sp, tb, x))) })).filter((u) => u.xs.length);
      if (!units.length) continue;
      const xs = units.flatMap((u) => u.xs);
      const flat = units.length === 1 && xs.length === 1;
      const x0 = xs[0];
      if (!this.all && !q && flat && !this.live(x0) && !this.here(x0) && !x0.bg.length && (!x0.app || this.resting(x0))) {
        quiet.push({ sp, tb: units[0].tb, x: x0 });
        continue;
      }
      if (flat) {
        rows.push({ el: this.leaf(t, T, bi, x0, sp.name, units[0].tb.name !== sp.name ? units[0].tb.name : null), into: 5 });
        weight += 1 + x0.bg.length;
      } else if (!this.all && !q && !xs.some((x) => this.live(x) || this.here(x) || x.bg.length)) {
        rows.push({ el: this.folded(t, T, bi, sp, units), into: 0 });
        weight += 1 + xs.length;
      } else {
        const head = h_flex().h(24).px(8).gap(6).items_center().rounded(6).border_1().border_dashed().border_color(t.border)
          .child(div().min_w(0).truncate().font_medium().child(sp.name))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(units.length > 1 ? T.tabs(units.length) : T.terms(xs.length)));
        const kids = units.flatMap((u) => u.xs.map((x) => ({ el: this.leaf(t, T, bi, x, null, u.tb.name), mid: 12, into: 5 })));
        rows.push({ el: v_flex().child(head).child(this.fork(t, kids, { x: 10, from: -3 })), into: 0 });
        weight += 1 + xs.length + xs.reduce((a, x) => a + x.bg.length, 0);
      }
      if (rows.length > n0) rows[rows.length - 1].w = weight - w0;
    }
    const loose = (s.loose ?? []).filter((k) => !q || [b.label, s.name, k.name, k.address].some((v) => lower(v).includes(q)));
    if (loose.length) {
      const head = h_flex().h(24).px(8).gap(6).items_center().rounded(6).border_1().border_dashed().border_color(t.border)
        .child(div().font_medium().text_color(t.muted).child(T.loose))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(String(loose.length)));
      rows.push({ el: v_flex().child(head).child(this.fork(t, loose.map((k) => ({ el: h_flex().child(this.pill(t, T, bi, k)), mid: 11 })), { x: 10, from: -3 })), into: 0 });
      weight += 1 + loose.length; rows[rows.length - 1].w = 1 + loose.length;
    }
    if (!rows.length && !quiet.length) return null;
    // A machine taller than the window splits its spaces into two or three columns (as many as its width holds),
    // so the list does not have to scroll: about ROW px per weight unit against what is left under the dock.
    let vh; try { vh = this.rootB?.height ?? window.viewport_size().height * 0.85; } catch { vh = 800; }
    const avail = Math.max(220, vh - 30 - DOCK_H - 60 - 36 - 40);
    let bw; try { bw = this.rootB?.width ?? window.viewport_size().width * 0.8; } catch { bw = 1100; }
    const nc = this.ncols || 1, boardW = (bw - 28 - 12 * (nc - 1)) / nc;
    const kmax = Math.max(1, Math.min(3, Math.floor(boardW / 340)));
    const k = Math.max(1, Math.min(kmax, Math.ceil(weight * ROW / avail)));
    const groups = []; // contiguous chunks of the rows, about equal in weight
    { let acc = 0, cur = []; const per = weight / k;
      rows.forEach((r) => { if (cur.length && groups.length < k - 1 && acc + (r.w ?? 1) / 2 > per * (groups.length + 1)) { groups.push(cur); cur = []; } cur.push(r); acc += r.w ?? 1; });
      if (cur.length) groups.push(cur); }
    const el = v_flex()
      .when(rows.length > 0, (el) => el.child(h_flex().items_start().mt(8).mb(8).ml(16).mr(10).gap(10)
        .children(groups.map((g) => v_flex().flex_1().min_w(0).pl(12).gap(3)
          .children(g.map((r, i) => this.limb(t, color, r.el, i === 0, i === g.length - 1, r.into)))))))
      .when(quiet.length > 0, (el) => el.child(this.cells(t, T, bi, quiet, rows.length > 0)));
    return { el, weight: weight / Math.max(1, groups.length) + (quiet.length ? 1.5 : 0) };
  }

  // Tree lines, in the computer's color: the spine 2 px, branches 1 px; a piece of line belongs to the
  // item it leads to, so a line stops at the last item and turns into it with a
  // rounded corner (├ … ├ … └) and never runs past it.
  //   left: where the vertical runs (from the item's left edge, negative)
  //   top: where it starts (from the item's top; the gap above it is covered)
  //   mid: the item's vertical middle, where the line turns into it
  //   into: how far it goes past the item's edge (a row's mark sits 9 px in: the
  //         line stops 4 px short of it; a box or pill is met at its edge)
  //   bold: 2 px (the spine from a session to its spaces), else 1 px
  lines(c, { left, top, mid, last, into = 0, bold = false }) {
    const k = bold ? 2 : 1, w = -left + into, m = mid - Math.floor(k / 2);
    if (last) return [
      div().absolute().left(left).top(top).w(6).h(m - top + k)
        .when(bold, (el) => el.border_l_2().border_b_2()).when(!bold, (el) => el.border_l_1().border_b_1())
        .border_color(c).rounded_bl(bold ? 6 : 5),
      div().absolute().left(left + 6).top(m).w(w - 6).h(k).bg(c),
    ];
    return [
      div().absolute().left(left).top(top).bottom(0).w(k).bg(c),
      div().absolute().left(left).top(m).w(w).h(k).bg(c),
    ];
  }

  // A space on the computer's spine (12 px left of the rows, 3 px between them).
  limb(t, color, child, first, last, into = 5) {
    // the item first, the lines after: they're drawn over its (invisible) border
    return div().relative().min_w(0)
      .child(child)
      .children(this.lines(alpha(color, "aa"), { left: -12, top: first ? 0 : -3, mid: 12, last, into, bold: true }));
  }

  // Branches under an item: the line drops from under the item's status mark (15 px
  // in: 8 px padding + half the 14 px slot), from just below the mark, and meets
  // each kid at its middle. kids: [{ el, mid, into }]. Under a box with no mark (a
  // space with several tabs) the line starts at the box's bottom, under its text.
  fork(t, kids, { x = 15, from = -11 } = {}) {
    const pad = 28, c = alpha(this.lineColor ?? t.border, "66");
    return v_flex().pl(pad).pt(3).gap(3)
      .children(kids.map((k, i) => div().relative().min_w(0)
        .child(k.el)
        .children(this.lines(c, { left: x - pad, top: i === 0 ? from : -3, mid: k.mid, last: i === kids.length - 1, into: k.into ?? 0 }))));
  }


  row(key, bi, go) {
    this.nav.push({ key, board: bi, go });
    return key === this.sel;
  }

  // One terminal: a line (with its name and tab), then its sub-agents as pills.
  leaf(t, T, bi, x, name, tab, step = null) {
    const on = this.row(x.address, bi, () => this.goTerm(x));
    const sc = this.statusColor(t, x.status);
    const at = this.since(x);
    const age = x.app && !this.live(x) && at ? T.ago(Math.floor((Date.now() - at) / 60000)) : null;
    // working: how long it has been at it; waiting on you: how long it has waited
    const icon = this.showIcon(x);
    const runFor = x.app && at && (x.status === "working" || x.status === "blocked") ? T.ran(Math.floor((Date.now() - at) / 60000)) : null;
    // Only a waiting agent (red: it needs you) and the one you're in (accent) get a
    // box; working and done say so by
    // their mark and the color of their first words; resting ones by brightness.
    const blocked = x.status === "blocked" || x.status === "error";
    const fade = step == null ? null : [t.foreground, t.muted, t.dim, alpha(t.dim, "99")][step];
    const lead = x.status === "working" ? t.working : x.status === "done" ? t.done : fade ?? t.foreground;
    const line = h_flex().id(`am-${x.address}`).h(24).px(8).gap(6).items_center().rounded(6).min_w(0).cursor_pointer()
      .border_1().border_color(blocked ? alpha(t.blocked, "88") : this.here(x) ? alpha(t.accent, "aa") : t.background)
      .when(blocked, (el) => el.bg(alpha(t.blocked, "1a")))
      .when(!sc, (el) => el.text_color(fade ?? t.muted))
      // the keyboard's place, once the arrows are used
      .when(on && this.kb, (el) => el.border_color(t.accent).bg(t.hover))
      .hover((s) => s.bg(t.hover))
      .on_mouse_down("left", stop).on_click(() => this.go({ go: () => this.goTerm(x) }))
      .on_hover(this.hoverOn(x.address, [name, tab].filter(Boolean).join(" · ") || x.address, bi))
      // like the sidebar's agent list: the agent's icon first, its status mark last
      .child(icon ? this.appIcon(t, x, 14) : this.dot(t, x.status))
      .when(Boolean(name), (el) => el.child(div().flex_none().max_w(200).truncate().font_medium().text_color(lead).child(name)))
      .when(Boolean(tab), (el) => el.child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(name ? t.muted : lead).child(tab)))
      .when(!tab, (el) => el.child(div().flex_1()))
      .when(!x.app, (el) => el.child(div().flex_none().px(4).rounded(4).border_1().border_dashed().border_color(t.border).text_size(10).text_color(t.dim).child(T.shell)))
      // where you are: an eye that slowly blinks (no words)
      .when(Boolean(runFor), (el) => el.child(div().flex_none().text_size(10.5).text_color(x.status === "working" ? t.working : t.blocked).child(runFor)))
      .when(x.app && Boolean(CTX.get(x.address)), (el) => el.child(div().flex_none().text_size(10.5).text_color(CTX.get(x.address).pct >= 80 ? t.working : t.dim).child(`ctx ${CTX.get(x.address).pct}%`)))
      .when(x.app && (shared("snoozed") || {})[x.address] > Date.now(), (el) => el.child(div().flex_none().px(4).rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.dim).child("snoozed")))
      .when(this.here(x), (el) => el.child(svg("mods/map-tm/icons/eye.svg").size(13).flex_none().text_color(t.accent)
        .loop("opacity", { from: 1, to: 0.2, period: 1600 })))
      .when(Boolean(age) && !this.here(x), (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).child(age)))
      .when(icon, (el) => el.child(this.dot(t, x.status)));
    const shown = this.pop(t, T, x.address, [name, tab].filter(Boolean).join(" · ") || x.address, line, bi);
    if (!x.bg.length) return shown;
    // pills keep their own width: each in a row of its own
    return v_flex().child(shown).child(this.fork(t, x.bg.map((k) => ({ el: h_flex().child(this.pill(t, T, bi, k)), mid: 11 }))));
  }

  pill(t, T, bi, k) {
    const key = `${k.address}#bg`;
    // one with no tab: a peek over the current tab (with keep-as-tab there)
    // A parked terminal (running, no pane): Enter / click brings it back as a split right of the focused pane.
    const show = () => run(k.loose ? "terminal.keep" : "agent.focus", k.loose ? { terminal: k.address, place: "right" } : { terminal: k.address });
    if (k.loose) this.looseKeys.add(key);
    const on = this.row(key, bi, show);
    return this.pop(t, T, k.address, k.name, h_flex().id(`am-${key}`).h(22).px(7).gap(5).items_center().rounded(11).bg(t.raised).text_size(11).cursor_pointer()
      .when(on && this.kb, (el) => el.border_1().border_color(t.accent))
      .hover((s) => s.bg(t.hover))
      .on_mouse_down("left", stop).on_click(() => this.go({ go: show }))
      .on_hover(this.hoverOn(k.address, k.name, bi, key))
      .child(this.dot(t, k.status)).child(k.name)
      .when(k.alsoTab, (el) => el.child(div().text_color(t.dim).child(`· ${T.alsoTab}`)))
      .when(Boolean(k.loose && k.since), (el) => el.child(div().text_color(t.dim).child(T.ran(Math.floor((Date.now() - k.since) / 60000)))))
      // working / waiting: for how long, like the rows
      .when(!k.loose && (k.status === "working" || k.status === "blocked") && Boolean(SINCE.get(k.address)?.at), (el) =>
        el.child(div().text_color(k.status === "working" ? t.working : t.blocked).child(T.ran(Math.floor((Date.now() - SINCE.get(k.address).at) / 60000))))), bi, false, key);
  }

  // A space where everything rests: its head says so, its tabs are rows newest first,
  // dimmer in four steps (under 12 h, under a day, 1–3 days, older or unknown).
  folded(t, T, bi, sp, units) {
    const head = h_flex().h(24).px(8).gap(6).items_center().rounded(6).border_1().border_dashed().border_color(t.border).text_color(t.muted)
      .child(div().min_w(0).truncate().font_medium().text_color(t.foreground).child(sp.name))
      .child(div().flex_none().text_size(11).text_color(t.dim).child(`${units.length > 1 ? T.tabs(units.length) : T.terms(units[0].xs.length)} ${T.resting}`));
    const now = Date.now();
    const step = (at) => (!at ? 3 : now - at < QUIET ? 0 : now - at < DAY ? 1 : now - at < 3 * DAY ? 2 : 3);
    const items = units.flatMap((u) => u.xs.map((x) => ({ u, x, at: x.app ? this.since(x) : 0 }))).sort((a, b) => b.at - a.at);
    return v_flex().child(head).child(this.fork(t, items.map(({ u, x, at }) => ({ el: this.leaf(t, T, bi, x, null, u.tb.name, step(at)), mid: 12, into: 5 })), { x: 10, from: -3 }));
  }


  // Rested 12 h+ and alone in its space: a cell each, newest first; shells apart.
  cells(t, T, bi, quiet, ruled) {
    const now = Date.now();
    const agents = quiet.filter((c) => c.x.app).sort((a, b) => this.since(b.x) - this.since(a.x));
    const shells = quiet.filter((c) => !c.x.app);
    const age = (x) => { const at = this.since(x); return !at ? "old" : now - at < DAY ? "fresh" : now - at < 3 * DAY ? "mid" : "old"; };
    const cell = (c, kind) => {
      const on = this.row(c.x.address, bi, () => this.goTerm(c.x));
      const at = this.since(c.x);
      const tip = `${c.sp.name}${c.tb.name !== c.sp.name ? ` › ${c.tb.name}` : ""} · ${c.x.address}${at ? ` · ${T.ago(Math.floor((now - at) / 60000))}` : ""}`;
      const label = tip.split(" · ")[0] + (at ? ` · ${T.ago(Math.floor((now - at) / 60000))}` : "");
      // an agent with an icon: the icon, fainter the longer it has rested
      if (kind !== "shell" && c.x.program?.icon) {
        return this.pop(t, T, c.x.address, label, div().id(`am-${c.x.address}`).size(18).flex().items_center().justify_center().rounded(4).cursor_pointer()
          .when(on && this.kb, (el) => el.border_1().border_color(t.accent))
          .hover((s) => s.bg(t.hover))
          .on_mouse_down("left", stop).on_click(() => this.go({ go: () => this.goTerm(c.x) }))
          .on_hover(this.hoverOn(c.x.address, label, bi))
          .child(this.appIcon(t, c.x, 13)), bi, true);
      }
      return this.pop(t, T, c.x.address, label, div().id(`am-${c.x.address}`).size(12).rounded(3).cursor_pointer()
        .when(kind === "shell", (el) => el.border_1().border_dashed().border_color(t.border))
        .when(kind !== "shell", (el) => el.bg(this.cellColor(t, kind)).when(kind === "old", (e2) => e2.border_1().border_color(t.border)))
        .when(on && this.kb, (el) => el.border_1().border_color(t.accent))
        .hover((s) => s.border_1().border_color(t.foreground))
        .on_mouse_down("left", stop).on_click(() => this.go({ go: () => this.goTerm(c.x) }))
        .on_hover(this.hoverOn(c.x.address, label, bi)), bi, true);
    };
    return h_flex().items_start().gap(8).px(12).py(8).when(ruled, (el) => el.border_t(1).border_color(t.border)).text_size(11).text_color(t.dim)
      .child(v_flex().w(64).flex_none()
        .when(agents.length > 0, (el) => el.child(T.quiet(agents.length)))
        .when(shells.length > 0, (el) => el.child(T.shells(shells.length))))
      .child(h_flex().flex_1().flex_wrap().gap(3)
        .children(agents.map((c) => cell(c, age(c.x))))
        .when(shells.length > 0, (el) => el.child(div().w(6)))
        .children(shells.map((c) => cell(c, "shell"))));
  }
}
