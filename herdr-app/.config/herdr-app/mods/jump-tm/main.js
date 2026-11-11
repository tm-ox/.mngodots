// Agent switcher: every agent (blocked first, then done, working, idle) with a filter box.
// Enter jumps to the agent, Ctrl+R switches the box to a reply that is sent to it (hc send --force, so it can answer a
// blocked prompt), Ctrl+Z snoozes 30 min (shared "snoozed", used by pane-parking and the status bar), Esc closes.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { hc, agents, run, props, closeOverlay, openOverlay, theme, shared, setShared, notify, settings, exec, terminals, panes } from "herdr";

const keyChip = (text, t) => div().px(6).h(18).min_w(18).flex().items_center().justify_center().flex_none().rounded(5).border_1().border_color(t.input ?? t.border).bg(t.raised).text_size(11).font_medium().text_color(t.muted).child(text);
const keyHints = (text, t) => h_flex().gap(14).items_center().min_w(0).overflow_hidden().children(text.split(" · ").map((seg) => {
  const w = seg.split(" "); let n = 1;
  while (n < w.length && /^[A-Z]$/.test(w[n])) n++;
  const label = w.slice(n).join(" ");
  return h_flex().gap(6).items_center().flex_none().child(keyChip(w.slice(0, n).join(" "), t)).when(Boolean(label), (e) => e.child(div().text_size(12).text_color(t.dim).child(label)));
}));
const header = (title, hint, t) => h_flex().h(30).flex_none().pr(10).items_center().border_b(1).border_color(t.border)
  .child(div().h_full().pl(12).pr(6).flex().items_center().flex_none().text_size(12).font_medium().text_color(t.accent).child(title))
  .child(div().flex_1()).child(keyHints(hint, t));

const ORDER = { blocked: 0, done: 1, working: 2, idle: 3, parked: 4 };
const plabel = (r) => r.labels?.pname || r.program?.name || r.agent || r.address;

export default class JumpTm extends View {
  init(_props, cx) {
    this.q = ""; this.sel = 0; this.reply = false;
    // Parked terminals (running, no pane) are a last group, shown as "parked". Ctrl+Shift+U opens the switcher with props.filter "parked".
    const first = props()?.filter === "parked" ? "parked" : "";
    this.q = first;
    this.input = InputState.new({ value: first });
    this.input.on("change", (_e, cx) => { this.q = this.input.value(); if (!this.reply) { this.sel = 0; this.selAddr = null; } cx.notify(); });
    this.input.on("submit", () => this.enter());
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
    this.screens = new Map(); this.ctx = new Map(); this.busy = false; this.tick = 0;
    cx.timer.every(1500, (cx) => { this.poll(cx); cx.notify(); });
    for (const [k, v] of Object.entries(shared("agent-ctx") || {})) this.ctx.set(k, v);
    cx.timer.after(50, (cx) => { for (const a of agents()) this.readInto(a, cx); });
  }

  list() {
    const q = this.reply ? "" : this.q.trim().toLowerCase();
    return [...agents(), ...this.parked()].map((a) => ({ a, hay: `${a.space_name} ${a.tab_name} ${a.title} ${a.app ?? ""} ${a.status}`.toLowerCase() }))
      .filter((x) => !q || q.split(/\s+/).every((w) => x.hay.includes(w)))
      .sort((x, y) => (ORDER[x.a.status] ?? 9) - (ORDER[y.a.status] ?? 9) || y.a.seq - x.a.seq).map((x) => x.a);
  }

  parked() {
    const shown = new Set(panes().map((p) => p.terminal).filter(Boolean));
    return terminals().filter((x) => (x.state ?? "live") === "live" && !x.parent && !shown.has(x.address) && !agents().some((a) => a.address === x.address))
      .map((x) => ({ address: x.address, space_name: "parked", tab_name: plabel(x), title: (x.cwd ?? "").replace(/^\/home\/[^/]+/, "~"), status: "parked", seq: 0, parked: true }));
  }

  // Parked rows: Enter brings it back as a split right of the focused pane, Ctrl+T as a tab, Ctrl+O peeks, Ctrl+X kills (after a confirmation).
  unpark(a, place) { this.close(); run("terminal.keep", { terminal: a.address, place }); }

  // Screen of the highlighted agent (hc read, last lines), refreshed every 1.5 s, one request at a time.
  // Reads one agent's screen: stores its last lines and, if its status line has one, its context figure (kept in
  // shared "agent-ctx" so a reopened switcher shows it at once).
  readInto(a, cx) {
    return hc(["read", a.address]).then((r) => {
      if (r.code !== 0) return;
      const cm = [...String(r.stdout ?? "").matchAll(/ctx:\s*(\d+)%(?:\(([\d.]+k?)\))?/g)].pop();
      if (cm) { this.ctx.set(a.address, { pct: Number(cm[1]), tok: cm[2] ?? "" }); setShared("agent-ctx", Object.fromEntries(this.ctx)); }
      const FOOT = /⏵⏵|ctx:\d|shift\+tab to cycle|esc to interrupt|\? for shortcuts|Update installed|bypass permissions|auto-accept|\bwk:\d|session:\d+m/;
      const lines = String(r.stdout ?? "").split("\n")
        .map((x) => x.replace(/^\s*[│┃║]\s?/, "").replace(/\s?[│┃║]\s*$/, "").replace(/[╭╮╰╯┌┐└┘├┤]/g, "").replace(/[─━═]{2,}/g, "").replace(/\s+$/, ""))
        .filter((x) => x.trim() && !FOOT.test(x) && !/^[\s\-_=·.]+$/.test(x) && !/^\s*[❯>]\s*$/.test(x)).slice(-40);
      this.screens.set(a.address, lines); cx.notify();
    }).catch(() => {});
  }

  // Every 3rd poll reads another agent in turn (context figures); the others read the highlighted one.
  poll(cx) {
    const all = agents();
    let a = this.reply ? this.target : this.list()[this.sel];
    if (++this.tick % 3 === 0 && all.length) { this.rr = ((this.rr ?? -1) + 1) % all.length; a = all[this.rr]; }
    if (!a || this.busy) return;
    this.busy = true;
    this.readInto(a, cx).then(() => { this.busy = false; }, () => { this.busy = false; });
  }

  // Numbered choices on the agent's screen (permission prompts: "1. Yes", "2. No, ..."), from its last 14 lines.
  options(a) {
    if (a?.status !== "blocked") return [];
    const out = [], lines = (this.screens.get(a.address) ?? []).slice(-14);
    for (const l of lines) { const m = l.match(/^\s*[❯>›]?\s*(\d)\.\s+(.+?)\s*$/); if (m) out.push({ n: m[1], text: m[2] }); }
    return out;
  }

  answer(a, n, cx) {
    hc(["keys", a.address, n]).then(() => { cx.timer.after(700, (cx) => this.poll(cx)); });
  }

  close() { closeOverlay(props().overlay); }

  enter() {
    const l = this.list(), a = this.target ?? l[Math.min(this.sel, l.length - 1)];
    if (!a) return;
    if (this.reply) {
      const text = this.q.trim();
      if (!text) return;
      this.close();
      hc(["send", "--force", a.address, text]).then((r) => { if (r.code !== 0) notify({ title: "Reply failed", body: String(r.stderr ?? "").slice(0, 120), level: "warning", timeout: 4000 }); });
    } else if (a.parked) this.unpark(a, "right");
    else { this.close(); run("agent.focus", { terminal: a.address }); }
  }

  render() {
    const t = theme(), l = this.list(), snz = shared("snoozed") || {}, now = Date.now();
    // The list re-sorts as agents change, so keep the highlight on the same agent rather than the same row.
    if (this.selAddr) { const i = l.findIndex((a) => a.address === this.selAddr); if (i >= 0) this.sel = i; }
    if (this.sel >= l.length) this.sel = Math.max(0, l.length - 1);
    this.selAddr = l[this.sel]?.address ?? null;
    const since = shared("agent-since") || {}, ago = (a) => { const at = since[a.address]?.at; if (!at) return ""; const m = Math.floor((now - at) / 60000); return m < 1 ? "<1m" : m < 60 ? m + "m" : Math.floor(m / 60) + "h" + (m % 60 ? (m % 60) + "m" : ""); };
    const col = (s) => (s === "blocked" ? t.blocked : s === "done" ? t.done : s === "working" ? t.working : t.dim);
    const cur = l[this.sel];
    return v_flex().id("jump-tm").track_focus(this.handle)
      .on_key_down((e, cx) => {
        const k = e.key, ctrl = e.modifiers.control;
        // Ctrl+Shift+V (what the voice-input script sends to herdr-app, which it treats as a terminal): the box only knows Ctrl+V.
        if (ctrl && e.modifiers.shift && String(k).toLowerCase() === "v") {
          exec("wl-paste", ["-n"]).then((r) => { if (r.code === 0 && r.stdout) { this.input.replace(String(r.stdout).replace(/\r?\n/g, " ")); this.input.focus(); } });
          cx.stop_propagation(); return;
        }
        if (k === "escape") { if (this.reply) { this.reply = false; this.target = null; this.input.set_value(""); this.q = ""; this.input.focus(); cx.stop_propagation(); cx.notify(); return; } return this.close(); }
        if (this.reply) return;
        if (k === "down" || (ctrl && (k === "j" || k === "n"))) { this.selAddr = null; this.sel = l.length ? (this.sel + 1) % l.length : 0; cx.stop_propagation(); cx.notify(); }
        else if (k === "up" || (ctrl && (k === "k" || k === "p"))) { this.selAddr = null; this.sel = l.length ? (this.sel + l.length - 1) % l.length : 0; cx.stop_propagation(); cx.notify(); }
        else if (ctrl && k === "r" && cur) { this.reply = true; this.target = cur; this.q = ""; this.input.set_value(""); this.input.focus(); cx.stop_propagation(); cx.notify(); }
        else if (ctrl && cur?.parked && (k === "t" || k === "o" || k === "x")) {
          if (k === "t") this.unpark(cur, "tab");
          else if (k === "o") { this.close(); run("terminal.peek", { terminal: cur.address }); }
          else { this.close(); openOverlay({ mod: "confirm", kind: "dialog", width: 420, props: { title: "Kill " + cur.tab_name + "?", detail: "Ends the terminal and whatever is running in it.", command: { name: "terminal.kill", args: { terminal: cur.address } } } }); }
          cx.stop_propagation();
        }
        else if (ctrl && k === "z" && cur && !cur.parked) {
          const s = { ...(shared("snoozed") || {}) };
          if (s[cur.address] > Date.now()) delete s[cur.address]; else s[cur.address] = Date.now() + 30 * 60 * 1000;
          setShared("snoozed", s); cx.stop_propagation(); cx.notify();
        }
      })
      .w_full().h_full().min_h(0).rounded(10).overflow_hidden().border_1().border_color(t.border).bg(t.background).text_size(13).text_color(t.foreground)
      .child(header(this.reply ? `Reply to ${this.target?.tab_name ?? "agent"}` : "Agents", this.reply ? "Enter send · Esc back" : (cur?.parked ? "Enter split · Ctrl T tab · Ctrl O peek · Ctrl X kill · Esc" : "Enter jump · Ctrl N P move · Ctrl R reply · Ctrl Z snooze · Esc"), t))
      .child(v_flex().flex_1().min_h(0).p(14).gap(10)
        .child(Input.new(this.input).h(36).px(10).rounded(9).border_1().border_color(t.accent).bg(t.raised).text_size(12.8).text_color(t.foreground))
        .child(v_flex().flex_1().min_h(0).overflow_hidden().gap(2).children(this.reply
          ? [div().text_size(11).text_color(t.dim).child(`Sent to ${this.target?.space_name} / ${this.target?.tab_name} (${this.target?.status}). A reply to a blocked prompt is typed even if the program is waiting.`)]
          : l.length === 0 ? [div().text_size(12).text_color(t.dim).child("No agents match.")]
          : l.slice(0, 8).map((a, i) => {
            const sn = snz[a.address] > now;
            return h_flex().id("ag-" + a.address).h(28).flex_none().px(10).gap(10).items_center().rounded(7)
              .bg(i === this.sel ? t.selected : t.background).hover((s) => s.bg(i === this.sel ? t.selected : t.hover)).cursor_pointer()
              .on_click(() => { this.sel = i; this.selAddr = null; this.enter(); })
              .child(div().size(7).rounded(4).flex_none().bg(col(a.status)))
              .child(div().w(230).flex_none().truncate().child(`${a.address.includes("/") ? "⇄ " : ""}${a.space_name} / ${a.tab_name}`))
              .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(a.title ?? ""))
              .child(div().text_size(11).w(50).flex_none().text_color((this.ctx.get(a.address)?.pct ?? 0) >= 70 ? t.blocked : (this.ctx.get(a.address)?.pct ?? 0) >= 50 ? t.working : t.dim).child(this.ctx.has(a.address) ? `ctx ${this.ctx.get(a.address).pct}%` : ""))
              .child(div().text_size(11).w(96).flex_none().text_color(sn ? t.dim : col(a.status)).child((sn ? "snoozed" : a.status) + (ago(a) ? " " + ago(a) : "")));
          })))
        .child(this.detail(cur, t, snz)));
  }

  detail(a, t, snz) {
    a = this.reply ? this.target : a;
    if (!a) return div();
    const lines = (this.screens.get(a.address) ?? []).slice(-16), opts = this.reply ? [] : this.options(a);
    const col = a.status === "blocked" ? t.blocked : a.status === "done" ? t.done : t.dim;
    return v_flex().flex_none().gap(8).pt(10).border_t(1).border_color(t.border)
      .child(h_flex().gap(8).items_center().child(div().text_size(11).font_semibold().text_color(t.muted).child(`${a.space_name} / ${a.tab_name}`)).child(div().text_size(11).text_color(col).child(a.status))
        .child(div().flex_1()).child(div().text_size(10).text_color(t.dim).child(`${this.ctx.has(a.address) ? `ctx ${this.ctx.get(a.address).pct}%${this.ctx.get(a.address).tok ? " (" + this.ctx.get(a.address).tok + ")" : ""}  ·  ` : ""}${a.address}`)))
      .child(v_flex().flex_none().h(220).overflow_hidden().justify_end().gap(2).rounded(7).border_1().border_color(t.border).bg(t.raised).px(10).py(8)
        .font_family(settings().font_family ?? "JetBrains Mono").text_size(11).text_color(t.muted)
        .children(lines.length ? lines.map((l) => { const x = l.trim(), opt = /^[❯>›]?\s*\d\.\s/.test(x), sel = /^[❯›]/.test(x), user = /^[❯>]\s/.test(x) && !opt, bot = /^[●•]/.test(x), dim = /^[⎿✻✽✶·]/.test(x);
          return div().flex_none().min_h(15).pl(dim ? 10 : 0).text_color(sel || user ? t.accent : opt || bot ? t.foreground : dim ? t.dim : t.muted).when(bot, (e) => e.font_medium()).child(x); }) : [div().text_color(t.dim).child("Reading screen…")]))
      .when(opts.length > 0, (e) => e.child(h_flex().gap(8).flex_wrap().children(opts.map((o) =>
        div().id("opt-" + o.n).h(26).px(10).rounded(7).flex().items_center().cursor_pointer().border_1().border_color(t.input ?? t.border).text_size(12).text_color(t.foreground)
          .hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.answer(a, o.n, cx)).child(`${o.n}  ${o.text}`)))));
  }
}
