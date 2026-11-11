// Inbox: side panel of the PRs that need you, from status-git's shared("inbox") (no polling of its own).
// Sections (a PR appears once, first match wins): To fix, To review, Re-review, New comments, Ready to merge.
// Click a row: opens the git window straight on that PR (shared "git-open"). The header title opens the full Inbox.
// Section headers fold (state kept in localStorage). Keyboard: mod.json is focusable, so Alt+L (pane.go right) from the
// pane beside the panel focuses it; j/k or arrows move, Left/Right (h/l) fold and unfold, Enter opens or toggles,
// r refreshes, o opens the full Inbox; Alt+H/J/K/L or Esc leaves (pane.go).
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { run, theme, shared, setShared, nextCommand, exec, hc, home, terminals, notify, focused } from "herdr";

// Leave a side panel. A panel focused by handle.focus() (keys, toggle) leaves the host's focus context on the terminal pane it
// came from, so pane.go left would be relative to that pane and do nothing: focus that pane directly. When the host itself
// moved onto the panel (pane.go), `focused().pane` is null and pane.go works as usual.
const leavePanel = (direction) => { const f = focused(); if (direction === "left" && f?.pane) run("pane.focus", { pane: f.pane }); else run("pane.go", { direction }); };
const REV_HOST = "tm-serve";
// Ctrl+Shift+V (what voice-input.sh sends to herdr-app, which it treats as a terminal): a text box only knows Ctrl+V, so paste the clipboard in here.
const dictate = (e, cx, box, single = true) => {
  if (!(e.modifiers?.control && e.modifiers?.shift && String(e.key).toLowerCase() === "v") || !box) return false;
  exec("wl-paste", ["-n"]).then((r) => { if (r.code === 0 && r.stdout) { box.replace(single ? String(r.stdout).replace(/\r?\n/g, " ") : String(r.stdout)); box.focus(); } });
  cx.stop_propagation(); return true;
};
const LS = "inbox-folded";
const loadFolded = () => { try { return new Set(JSON.parse(localStorage.getItem(LS) ?? "[]")); } catch { return new Set(); } };
const saveFolded = (s) => { try { localStorage.setItem(LS, JSON.stringify([...s])); } catch {} };

const DAY = 864e5;
const SHOW_READY = false; // approved PRs of mine: off while tm does not merge; turn on for repos where tm merges
const LABEL = { fix: "to fix", review: "to review", rerev: "re-review", talk: "comments", wait: "waiting", ready: "ready", overdue: "overdue", today: "today", running: "running", stopped: "stopped", on: "on", pending: "pending" };
const HCRON = async (args) => { const r = await exec("sh", ["-c", '"$HOME/.local/bin/hcron" "$@"', "hcron", ...args], { on: "tm-serve", timeout: 20000 }); if (r.code !== 0) throw new Error("hcron failed"); return JSON.parse(r.stdout); };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const nextWhen = (ts) => { const d = new Date(ts * 1000), diff = (d - Date.now()) / 1000, p = (n) => String(n).padStart(2, "0"); return diff < 3600 ? `in ${Math.max(1, Math.round(diff / 60))}m` : diff < 86400 ? `in ${Math.floor(diff / 3600)}h` : `${DOW[d.getDay()]} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const PINNED = ["sched", "dev"]; // occasional sections: pinned under a divider at the bottom of the panel
const WAIT_DAYS = 3; // a waiting item older than this turns the group count amber
const AUTO_FOLD = ["dev", "sched", "wait"]; // occasional sections: folded on load and again when the panel loses focus
const MARK = "devservers:";
const BM_KEY = "devservers.bookmarks";
// Command without the project's own path and node_modules/.bin, so "astro dev" reads as "astro dev".
const short = (l) => {
  let c = l.cmd || l.comm || "";
  for (const d of [l.root, l.cwd]) if (d && d !== "/") c = c.split(d + "/").join("");
  return c.replace(/^node (\S*\/)?(node_modules\/\.bin\/)?/, "").replace(/node_modules\/\.bin\//g, "").trim();
};
// One listener per line: port, pid, comm, address, cwd, git root, seconds up, bookmark id (an ancestor started by
// Go), full command (last, may contain anything).
const PROBE = `
ss -ltnpH 2>/dev/null | while read -r _ _ _ local _ users; do
  pid=$(printf '%s' "$users" | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2); [ -n "$pid" ] || continue
  port=\${local##*:}; addr=\${local%:*}
  cwd=$(readlink /proc/$pid/cwd 2>/dev/null); cmd=$(tr '\\0' ' ' </proc/$pid/cmdline 2>/dev/null)
  comm=$(cat /proc/$pid/comm 2>/dev/null); up=$(ps -o etimes= -p $pid 2>/dev/null | tr -d ' ')
  root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)
  bm=""; p=$pid; i=0
  while [ "$p" -gt 1 ] && [ $i -lt 12 ]; do
    c=$(tr '\\0' ' ' </proc/$p/cmdline 2>/dev/null)
    case "$c" in *${MARK}*) bm=$(printf '%s' "$c" | grep -o '${MARK}[a-z0-9]*' | head -1 | cut -d: -f2); break;; esac
    p=$(ps -o ppid= -p $p 2>/dev/null | tr -d ' '); [ -n "$p" ] || break; i=$((i+1))
  done
  printf '%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$port" "$pid" "$comm" "$addr" "$cwd" "$root" "$up" "$bm" "$cmd"
done
`;

function parse(out) {
  const seen = new Set(), list = [];
  for (const line of out.split("\n")) {
    const f = line.split("\t");
    if (f.length < 9) continue;
    const [port, pid, comm, addr, cwd, root, up, bm] = f, cmd = f.slice(8).join("\t").trim();
    if (seen.has(port + ":" + pid)) continue;
    seen.add(port + ":" + pid);
    list.push({ port: Number(port), pid: Number(pid), comm, addr, cwd, root, up: Number(up) || 0, bm, cmd });
  }
  return list.sort((a, b) => a.port - b.port);
}

const tidy = (l) => short(l).split(/\s+/).map((w) => (w.includes("/") ? w.replace(/\/$/, "").split("/").pop() : w)).filter(Boolean).slice(0, 4).join(" ");
const sleep = (ms) => exec("sleep", [String(ms / 1000)]);
const dage = (s) => (s >= 86400 ? `${Math.floor(s / 86400)}d` : s >= 3600 ? `${Math.floor(s / 3600)}h` : s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const api = async (req) => { try { const r = await exec(home() + "/workspace/.tools/rcal", ["api", "--json", JSON.stringify(req)]); return JSON.parse(r.stdout); } catch { return { error: "rcal unavailable" }; } };
const isDone = (i) => i.status === "COMPLETED" || i.status === "CANCELLED";
const MAX_TASKS = 12;
const age = (iso) => { const s = (Date.now() - Date.parse(iso)) / 1000; return s >= 86400 ? `${Math.floor(s / 86400)}d` : s >= 3600 ? `${Math.floor(s / 3600)}h` : `${Math.max(1, Math.floor(s / 60))}m`; };
const seenAt = (d) => (shared("pr-seen") || {})[d.url] || 0;

function sections(inb) {
  const take = new Set(), pick = (list, f) => list.filter((d) => !take.has(d.url) && f(d)).map((d) => (take.add(d.url), d));
  const real = (l) => (l ?? []).filter((d) => !d.draft);
  const mine = real(inb.mine), waiting = real(inb.waiting), review = real(inb.review);
  const fix = pick(mine, (d) => d.decision === "CHANGES_REQUESTED" || d.ci === "fail");
  const toReview = pick(review, (d) => !d.covered).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const rerev = pick(waiting, (d) => Boolean(d.flag));
  const talk = pick([...waiting, ...mine], (d) => d.act > seenAt(d));
  const ready = !SHOW_READY ? [] : pick(mine, (d) => d.ci !== "wait" && (d.appr.length > 0 || d.decision === "APPROVED"));
  const covered = review.filter((d) => d.covered && !take.has(d.url)).length;
  // Nothing for tm to do: own PRs with nothing to fix, PRs tm reviewed with no new commits, threads where tm spoke last
  // (act is 0 then). Approved own PRs that are ready to merge stay out: that is tm's move, not a wait.
  const wait = [...pick(waiting, () => true), ...pick(mine, (d) => !(d.decision === "APPROVED" || (d.appr.length > 0 && d.ci !== "wait" && d.ci !== "fail")))].sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
  return { fix, toReview, rerev, talk, ready, wait, covered };
}

// dev-server and throwaway-mongo on tm-serve, from status-git's shared("broker") probe (plain status lines). Ids are
// validated here too: they end up in a command line.
const serveRows = (bk) => {
  const out = [];
  for (const l of bk?.dev ?? []) { const m = /^(\d{4,5}) (running|dead)(?:: (.*))?$/.exec(l); if (m) out.push({ type: "dev", id: m[1], up: m[2] === "running", text: m[3] ?? "" }); }
  for (const l of bk?.mongo ?? []) { const m = /^([A-Za-z0-9][A-Za-z0-9._-]*) (running|dead)(?: (.*))?$/.exec(l); if (m) out.push({ type: "mongo", id: m[1], up: m[2] === "running", text: m[3] ?? "" }); }
  return out;
};

export default class InboxPanel extends View {
  init(_props, cx) {
    this.cxRef = cx;
    this.inb = shared("inbox") || null; this.err = shared("inbox-error") || "";
    this.drafts = new Set(); this.loadDrafts(cx); cx.timer.every(30000, (cx) => this.loadDrafts(cx));
    this.adding = false; this.cal = "tm"; this.addState = InputState.new({ placeholder: "New task…   @today  @tomorrow  @2026-11-20" });
    this.addState.on("submit", (_e, cx) => this.submitAdd(cx));
    this.addState.on("blur", (_e, cx) => { if (this.adding && !this.addState.value().trim()) { this.adding = false; cx.notify(); } });
    this.tasks = null; this.loadTasks(cx); cx.timer.every(60000, (cx) => this.loadTasks(cx));
    this.devs = null; this.armed = null; this.scanDevs(cx); cx.timer.every(8000, (cx) => this.scanDevs(cx));
    this.folded = loadFolded(); AUTO_FOLD.forEach((k) => this.folded.add(k)); this.devOpenAt = 0;
    this.jobs = null; this.loadJobs(cx); cx.timer.every(60000, (cx) => this.loadJobs(cx));
     /* dev servers start collapsed */ this.sel = null; this.handle = cx.focus_handle();
    cx.spawn(async (cx) => { for (;;) { const c = await nextCommand(); if (c === "focus") { this.handle.focus(); cx.timer.after(150, (cx) => { this.handle.focus(); cx.notify(); }); /* a panel that was just shown may not be in the focus tree yet: take it again */ if (!this.sel) this.sel = this.items()[0]?.id ?? null; cx.notify(); } } });
    if (!this.inb || Date.now() - this.inb.at > 45000) setShared("inbox-ask", Date.now());
    // No blur event exists: watch the handle, so the focus border follows the keyboard within 0.25 s.
    this.wasFocused = false;
    cx.timer.every(250, (cx) => { const f = this.handle.is_focused(); if (f !== this.wasFocused) { this.wasFocused = f; setShared("pf:inbox-tm", f); if (!f) this.collapseAuto(); cx.notify(); } });
    cx.timer.every(3000, (cx) => {
      const b = shared("inbox"), er = shared("inbox-error") || "";
      if ((b && b.at !== this.inb?.at) || er !== this.err) { if (b) this.inb = b; this.err = er; }
      const ask = shared("inbox-open-dev") || 0; // the status-bar servers chip: unfold Dev servers
      if (ask > (this.devAsk ?? Date.now())) { this.folded.delete("dev"); this.devOpenAt = Date.now(); saveFolded(this.folded); }
      this.devAsk = Math.max(ask, this.devAsk ?? 0);
      if (!this.handle.is_focused() && AUTO_FOLD.some((k) => !this.folded.has(k)) && Date.now() - this.devOpenAt > 60000) this.collapseAuto();
      cx.notify(); // also keeps the relative ages and "new" marks current
    });
  }

  // Reviews Rev has drafted (tm-serve ~/workspace/rev/docs/<date>-<repo>-<n>-review.md) plus final texts on this machine
  // (docs/drafts/<repo>-pr-<n>.md): same sources as the git window's DRAFT mark. Keys are "<repo>#<n>".
  loadDrafts(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await exec("sh", ["-c", 'ls "$HOME"/workspace/rev/docs/ 2>/dev/null'], { on: REV_HOST });
        if (r.code !== 0) return;
        const set = new Set();
        for (const f of r.stdout.split("\n")) { const m = /^\d{4}-\d{2}-\d{2}-(.+)-(\d+)-review\.md$/.exec(f.trim()); if (m) set.add(m[1] + "#" + m[2]); }
        try {
          const l = await hc(["exec", "sh", "-c", 'find "$HOME/workspace" "$HOME/repos" -maxdepth 8 -path "*/docs/drafts/*-pr-*.md" 2>/dev/null']);
          if (l.code === 0) for (const f of l.stdout.split("\n")) { const m = /^(.+)-pr-(\d+)\.md$/.exec(f.trim().split("/").pop()); if (m) set.add(m[1] + "#" + m[2]); }
        } catch {}
        if ([...set].sort().join() !== [...this.drafts].sort().join()) { this.drafts = set; cx.notify(); }
      } catch {}
    });
  }

  // Quick add: n (or +) opens a row at the top; Enter saves, Tab / the chip cycles TM, YNK, WRK, Esc cancels. A trailing
  // @today, @tomorrow or @YYYY-MM-DD sets the due date.
  startAdd(cx) {
    this.adding = true; this.folded.delete("tasks"); this.addState.set_value(""); cx.notify();
    cx.timer.after(40, () => this.addState.focus());
  }

  endAdd(cx) { this.adding = false; this.addState.set_value(""); this.handle.focus(); cx.notify(); }

  cycleCal(cx) { this.cal = { tm: "ynk", ynk: "wrk", wrk: "tm" }[this.cal]; cx.notify(); cx.timer.after(20, () => this.addState.focus()); }

  async submitAdd(cx) {
    let title = this.addState.value().trim(), due = "";
    const m = /\s@(\S+)$/.exec(" " + title);
    if (m) {
      const w = m[1].toLowerCase(), d = new Date();
      if (w === "today") due = ymd(d); else if (w === "tomorrow") { d.setDate(d.getDate() + 1); due = ymd(d); } else if (/^\d{4}-\d{2}-\d{2}$/.test(w)) due = w;
      if (due) title = title.slice(0, title.length - m[0].length + 1).trim();
    }
    if (!title) return this.endAdd(cx);
    const cal = this.cal;
    this.endAdd(cx);
    const r = await api({ op: "create", kind: "task", cal, title });
    if (!r.item) return notify({ title: "Task not added", body: r.error ?? "rcal failed", level: "error" });
    let item = r.item;
    if (due) { const u = await api({ op: "save", id: item.id, etag: item.etag, raw: item.raw, fields: { due } }); if (u.item) item = u.item; }
    // The cx of this async method may be dead after the awaits: show the task now, and reload through the long-lived one.
    this.tasks = [...(this.tasks ?? []), item].sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
    this.cxRef.notify();
    this.cxRef.timer.after(300, (c) => this.loadTasks(c));
  }

  // Open tasks from the Memo calendars (rcal), earliest due first, undated last.
  loadTasks(cx) {
    cx.spawn(async (cx) => {
      const l = await api({ op: "list" });
      if (l.error || !l.items) return;
      const t = l.items.filter((i) => i.kind === "task" && !isDone(i));
      t.sort((a, b) => ((a.due || "9999").localeCompare(b.due || "9999")) || ((a.prio || 10) - (b.prio || 10)));
      this.tasks = t; cx.notify();
    });
  }

  // Everything listening on this computer: bookmarked first, then project servers, then the rest.
  scanDevs(cx) {
    if (this.scanning) return; this.scanning = true;
    cx.spawn(async (cx) => {
      try { const r = await exec("sh", ["-c", PROBE]); const bms = Array.isArray(shared(BM_KEY)) ? shared(BM_KEY) : [], rank = (l) => (l.bm ? 0 : l.root ? 1 : 2);
        this.devs = parse(r.stdout).sort((a, b) => rank(a) - rank(b) || a.port - b.port); this.bms = bms; cx.notify(); } catch {}
      this.scanning = false;
    });
  }

  bmName(l) { const b = (Array.isArray(shared(BM_KEY)) ? shared(BM_KEY) : []).find((x) => x.id === l.bm); return b?.name || (l.root ? l.root.split("/").pop() : l.comm || short(l)); }

  // d deletes the task for good: needs a second press within 3 s.
  async remove(k, cx) {
    const mark = "del" + k.id;
    if (this.armed !== mark) { this.armed = mark; cx.notify(); cx.timer.after(3000, (cx) => { if (this.armed === mark) { this.armed = null; cx.notify(); } }); return; }
    this.armed = null;
    const items = this.items(), i = items.findIndex((x) => x.id === "t:" + k.id);
    this.tasks = this.tasks.filter((x) => x.id !== k.id);
    const next = this.items(); this.sel = next[Math.min(Math.max(i, 0), next.length - 1)]?.id ?? null; cx.notify();
    const r = await api({ op: "delete", id: k.id });
    if (r.error) { notify({ title: "Task not deleted", body: r.error, level: "error" }); this.cxRef.timer.after(0, (c) => this.loadTasks(c)); }
  }

  async complete(k, cx) {
    const items = this.items(), i = items.findIndex((x) => x.id === "t:" + k.id);
    this.tasks = this.tasks.filter((x) => x.id !== k.id);
    const next = this.items(); this.sel = next[Math.min(Math.max(i, 0), next.length - 1)]?.id ?? null; cx.notify();
    const r = await api({ op: "save", id: k.id, etag: k.etag, raw: k.raw, fields: { status: "COMPLETED" } });
    if (!r.item) this.loadTasks(cx);
  }

  terminalFor(id) { return terminals().find((t) => (t.state ?? "live") === "live" && (t.labels?.devservers === id || JSON.stringify(t.argv ?? []).includes(MARK + id))); }

  async launch(folder, cmd, name, id) {
    const args = ["run", "--bg", "--json", "--no-parent", "--name", name, "--cwd", folder];
    if (id) args.push("--label", "devservers=" + id);
    args.push("--", "sh", "-c", '"${SHELL:-zsh}" -ic "$1" "$0"; exit $?', MARK + (id ?? "adhoc"), cmd);
    try { const r = await hc(args); if (r.code !== 0) notify({ title: "Couldn't start " + name, body: (r.stderr || r.stdout).trim().split("\n")[0], level: "error" }); }
    catch (e) { notify({ title: "Couldn't start " + name, body: String(e.message ?? e), level: "error" }); }
  }

  // Only signals the pid while it still runs the command the scan saw (pids get reused).
  kill(l) { return exec("sh", ["-c", 'c=$(tr "\\0" " " </proc/$1/cmdline 2>/dev/null); [ "${c% }" = "$2" ] && kill "$1"', "sh", String(l.pid), l.cmd]).catch(() => null); }

  startBm(b, cx) {
    if (this.terminalFor(b.id)) return;
    cx.spawn(async (cx) => { await this.launch(b.folder, b.cmd, "dev-" + b.id, b.id); await sleep(800); this.scanDevs(cx); });
  }

  // Stop and restart need a second press (or click) within 3 s.
  act(l, what, cx) {
    const id = "d:" + l.pid + ":" + l.port, mark = what + id;
    if (this.armed !== mark) { this.armed = mark; cx.notify(); cx.timer.after(3000, (cx) => { if (this.armed === mark) { this.armed = null; cx.notify(); } }); return; }
    this.armed = null; cx.notify();
    cx.spawn(async (cx) => {
      const b = l.bm ? (this.bms ?? []).find((x) => x.id === l.bm) : null, t = b ? this.terminalFor(b.id) : null;
      if (t) await hc(["kill", t.address]).catch(() => {}); else await this.kill(l);
      if (what === "stop") { await sleep(500); return this.scanDevs(cx); }
      const folder = b?.folder || l.cwd || l.root, cmd = b?.cmd || l.cmd;
      if (!folder || !cmd) return notify({ title: "Can't restart", body: "No working folder or command for this process", level: "error" });
      for (let i = 0; i < 12; i++) { await sleep(300); const r = await exec("sh", ["-c", 'kill -0 "$1" 2>/dev/null && echo up', "sh", String(l.pid)]); if (!r.stdout.includes("up")) break; }
      await this.launch(folder, cmd, b ? "dev-" + b.id : "dev-" + Math.random().toString(36).slice(2, 8), b?.id ?? null);
      await sleep(800); this.scanDevs(cx);
    });
  }

  // tm-serve rows: stop needs a second press within 3 s; the tunnel is a visible tab that tm closes. Nothing here starts a server.
  stopServe(x, cx) {
    const mark = "srv" + x.type + x.id;
    if (this.armed !== mark) { this.armed = mark; cx.notify(); cx.timer.after(3000, (cx) => { if (this.armed === mark) { this.armed = null; cx.notify(); } }); return; }
    this.armed = null; cx.notify();
    if (!(x.type === "dev" ? /^\d{4,5}$/ : /^[A-Za-z0-9][A-Za-z0-9._-]*$/).test(x.id)) return;
    exec("sh", ["-c", '"$HOME/.local/bin/$1" stop "$2"', "sh", x.type === "dev" ? "dev-server" : "throwaway-mongo", x.id], { on: REV_HOST, timeout: 20000 })
      .then((r) => { if (r.code !== 0) notify({ title: "Not stopped", body: (r.stderr || r.stdout).trim().split("\n")[0], level: "error" }); setShared("broker-ask", Date.now()); })
      .catch((e) => notify({ title: "Not stopped", body: String(e.message ?? e), level: "error" }));
  }

  tunnel(x) {
    if (x.type !== "dev" || !x.up || !/^\d{4,5}$/.test(x.id) || Number(x.id) < 1024 || Number(x.id) > 65535) return notify({ title: "Tunnel is for a running dev server", level: "info" });
    run("terminal.open", { argv: ["ssh", "-N", "-L", `${x.id}:127.0.0.1:${x.id}`, REV_HOST], place: "tab", name: "tunnel-" + x.id });
    notify({ title: `Tunnel :${x.id} opened in a tab`, body: `Browse http://localhost:${x.id}. Close that tab to end it.`, level: "info" });
  }

  // Flat list of what is on screen: one header per thing (so far: Pull requests), then its rows unless folded.
  items() {
    const out = [];
    const push = (key, name, n, counts, rows, force) => { if (!n && !force) return; out.push({ id: "h:" + key, head: true, key, name, n, counts }); if (!this.folded.has(key)) out.push(...rows); };
    const inb = this.inb, bk = shared("broker");
    // Broker requests waiting for tm on tm-serve (read only; tm answers in gb-ok) plus the broker health line.
    if (bk) push("appr", "Approvals", bk.queue.length, [["pending", bk.queue.length]].filter(([, c]) => c), [...bk.queue.map((q) => ({ id: "q:" + q.id, key: "appr", kind: "appr", q })), { id: "k:health", key: "appr", kind: "health", bk }], true);
    if (inb) {
      const s = sections(inb);
      const cats = [["fix", s.fix], ["review", s.toReview], ["rerev", s.rerev], ["talk", s.talk], ["ready", s.ready]];
      const n = cats.reduce((a, [, l]) => a + l.length, 0);
      push("prs", "Pull requests", n, cats.filter(([, l]) => l.length).map(([k, l]) => [k, l.length]), cats.flatMap(([cat, list]) => list.map((d) => ({ id: "r:" + d.url, key: "prs", kind: "pr", cat, d }))));
    }
    if (this.tasks?.length || this.adding) {
      this.tasks ??= [];
      const td = ymd(new Date()), late = this.tasks.filter((k) => k.due && k.due.slice(0, 10) < td).length, tod = this.tasks.filter((k) => k.due && k.due.slice(0, 10) === td).length;
      push("tasks", "Tasks", this.tasks.length, [["overdue", late], ["today", tod]].filter(([, c]) => c), [...(this.adding ? [{ id: "a:add", key: "tasks", kind: "add" }] : []), ...this.tasks.slice(0, MAX_TASKS).map((k) => ({ id: "t:" + k.id, key: "tasks", kind: "task", k }))], this.adding);
      if (this.tasks.length > MAX_TASKS && !this.folded.has("tasks")) out.push({ id: "m:tasks", key: "tasks", kind: "more", text: `+${this.tasks.length - MAX_TASKS} more in Memo` });
    }
    if (inb) {
      const w = sections(inb).wait;
      push("wait", "Waiting on others", w.length, [["wait", w.length]], w.map((d) => ({ id: "w:" + d.url, key: "wait", kind: "pr", cat: "wait", d })));
    }
    if (this.jobs?.length) push("sched", "Schedules", this.jobs.length, [["on", this.jobs.filter((j) => j.enabled).length]].filter(([, c]) => c), this.jobs.map((j) => ({ id: "j:" + j.name, key: "sched", kind: "job", j })));
    if (this.devs) {
      const bms = (Array.isArray(shared(BM_KEY)) ? shared(BM_KEY) : []).filter((b) => !this.devs.some((l) => l.bm === b.id));
      const srv = serveRows(bk), up = this.devs.length + srv.filter((x) => x.up).length;
      push("dev", "Dev servers", this.devs.length + bms.length + srv.length, [["running", up], ["stopped", bms.length + srv.filter((x) => !x.up).length]].filter(([, c]) => c),
        [...bms.map((b) => ({ id: "b:" + b.id, key: "dev", kind: "bm", b })), ...this.devs.map((l) => ({ id: "d:" + l.pid + ":" + l.port, key: "dev", kind: "dev", l })), ...srv.map((x) => ({ id: "v:" + x.type + x.id, key: "dev", kind: "srv", x }))]);
    }
    return out;
  }

  foldAll(cx) {
    const heads = this.items().filter((x) => x.head).map((x) => x.key), all = heads.every((k) => this.folded.has(k));
    for (const k of heads) all ? this.folded.delete(k) : this.folded.add(k);
    this.sel = heads[0] ? "h:" + heads[0] : null; saveFolded(this.folded); cx.notify();
  }

  // Dev servers and Schedules are for an occasional look: fold them again when the panel loses focus (or 60 s after a mouse open).
  collapseAuto() {
    for (const k of AUTO_FOLD) this.folded.add(k);
    saveFolded(this.folded);
    if (/^(d|j):/.test(this.sel ?? "")) this.sel = this.sel.startsWith("d:") ? "h:dev" : "h:sched";
  }

  loadJobs(cx) {
    cx.spawn(async (cx) => { try { this.jobs = await HCRON(["list"]); cx.notify(); } catch {} });
  }

  fold(key, cx) {
    if (this.folded.has(key)) this.folded.delete(key); else this.folded.add(key);
    if (AUTO_FOLD.includes(key)) this.devOpenAt = Date.now();
    saveFolded(this.folded); cx.notify();
  }

  key(e, cx) {
    const k = e.key, items = this.items();
    if (this.adding && dictate(e, cx, this.addState)) return;
    if (this.adding) { if (k === "escape") this.endAdd(cx); else if (k === "tab") this.cycleCal(cx); else return; cx.stop_propagation(); return; }
    if (e.modifiers?.alt && ["h", "j", "k", "l"].includes(k)) { leavePanel({ h: "left", j: "down", k: "up", l: "right" }[k]); cx.timer.after(150, (cx) => cx.notify()); cx.stop_propagation(); return; }
    if (k === "escape") { leavePanel("left"); cx.timer.after(150, (cx) => cx.notify()); cx.stop_propagation(); return; }
    if (k === "n") { this.startAdd(cx); cx.stop_propagation(); return; }
    let i = items.findIndex((x) => x.id === this.sel); if (i < 0) i = 0;
    const cur = items[i];
    if (k === "down" || k === "j") this.sel = items[(i + 1) % items.length]?.id ?? null; // wraps: last row -> first
    else if (k === "up" || k === "k") this.sel = items[(i - 1 + items.length) % items.length]?.id ?? null; // first row -> last (e.g. Dev servers)
    else if (k === "G" || (k === "g" && e.modifiers?.shift)) this.sel = items[items.length - 1]?.id ?? null;
    else if (k === "g") this.sel = items[0]?.id ?? null;
    else if ((k === "left" || k === "h") && cur) {
      if (cur.head) { if (!this.folded.has(cur.key)) this.fold(cur.key, cx); }
      else this.sel = "h:" + cur.key; // from a row: up to its header
    } else if ((k === "right" || k === "l") && cur?.head) { if (this.folded.has(cur.key)) this.fold(cur.key, cx); }
    else if ((k === "enter" || k === "space") && cur) { if (cur.head) this.fold(cur.key, cx); else this.activate(cur); }
    else if (k === "d" && cur?.kind === "task") { this.remove(cur.k, cx); return cx.stop_propagation(); }
    else if (k === "x" && cur?.kind === "task") { this.complete(cur.k, cx); return cx.stop_propagation(); }
    else if ((k === "s" || k === "r") && cur?.kind === "bm") { this.startBm(cur.b, cx); }
    else if ((k === "s" || k === "r") && cur?.kind === "dev") { this.act(cur.l, k === "s" ? "stop" : "restart", cx); }
    else if (k === "s" && cur?.kind === "srv") { this.stopServe(cur.x, cx); }
    else if (k === "t" && cur?.kind === "srv") { this.tunnel(cur.x); }
    else if (k === "e" && cur?.key === "dev") { run("mod.open", { name: "devservers" }); }
    else if (k === "a") this.foldAll(cx);
    else if (k === "r") { setShared("inbox-ask", Date.now()); setShared("broker-ask", Date.now()); }
    else if (k === "o") { setShared("git-tab", "inbox"); run("mod.open", { name: "changes-float" }); }
    else return;
    cx.stop_propagation(); cx.notify();
  }

  after150(cmd) { this.cxRef?.timer.after(150, () => run(cmd)); }

  activate(it) {
    if (it.kind === "pr") this.open(it.d);
    else if (it.kind === "appr") this.openGbOk();
    else if (it.kind === "health") setShared("broker-ask", Date.now());
    else if (it.kind === "srv") this.tunnel(it.x);
    else if (it.kind === "dev") exec("xdg-open", [`http://localhost:${it.l.port}`]).catch(() => {});
    else if (it.kind === "job") { run("layout.select", { stack: "panel-body", child: "sched" }); this.after150("sched-tm.focus"); }
    else if (it.kind === "bm") this.startBm(it.b, this.cxRef);
    else { if (it.k) setShared("memo-open", it.k.id); run("mod.open", { name: "memo-tm" }); }
  }

  // Opens gb-ok on tm-serve in a new tab of tm's own terminal: the tty there is the approval boundary, so the mod never approves.
  openGbOk() {
    if (terminals().some((t) => (t.state ?? "live") === "live" && t.name === "gb-ok")) return notify({ title: "gb-ok is already open", body: "Answer it in its tab", level: "info" });
    run("terminal.open", { argv: ["ssh", "-t", "tm-serve", "exec ~/.local/bin/gb-ok"], place: "tab", name: "gb-ok" });
    this.cxRef?.timer.after(20000, () => setShared("broker-ask", Date.now()));
  }

  open(d) {
    setShared("git-open", { repo: d.repo, n: d.n, url: d.url, title: d.title });
    run("mod.open", { name: "changes-float" });
  }

  render(cx) {
    const t = theme(), inb = this.inb, s = inb ? sections(inb) : null, focused = this.handle.is_focused();
    const total = s ? s.fix.length + s.toReview.length + s.rerev.length + s.talk.length + s.ready.length : 0;
    const lateN = (this.tasks ?? []).filter((k) => k.due && k.due.slice(0, 10) <= ymd(new Date())).length;
    const iconBtn = (id, text, onClick) => div().id(id).w(24).h(24).flex().items_center().justify_center().flex_none().rounded(6).cursor_pointer().text_size(13).text_color(t.muted).hover((x) => x.bg(t.hover)).on_click(onClick).child(text);
    const chip = (text, color) => div().flex_none().h(16).px(6).flex().items_center().rounded(5).border_1().border_color(t.border).text_size(11).text_color(color).child(text);
    const colorOf = { fix: t.blocked, review: t.blocked, rerev: t.blocked, talk: t.working, ready: t.done, overdue: t.blocked, today: t.working, running: t.done, stopped: t.dim, on: t.done, pending: t.blocked, wait: s && s.wait.some((d) => Date.now() - Date.parse(d.updatedAt) > WAIT_DAYS * DAY) ? t.working : t.dim };
    const ciTail = (d) => (d.ci === "fail" ? "CI failing" : d.decision === "CHANGES_REQUESTED" ? "changes asked" : "");
    const tailOf = { fix: ciTail, review: (d) => (Date.now() - Date.parse(d.createdAt) > 3 * DAY ? "waiting" : ""), rerev: (d) => d.flag, wait: (d) => (Date.now() - Date.parse(d.updatedAt) > WAIT_DAYS * DAY ? "stale" : "") };
    const row = (it) => {
      const d = it.d, short = d.repo.split("/")[1] ?? d.repo, fresh = d.act > seenAt(d), on = focused && this.sel === it.id, tail = tailOf[it.cat]?.(d);
      return v_flex().id(it.id).flex_none().px(10).py(5).gap(2).rounded(7).cursor_pointer().bg(on ? t.selected : t.background).hover((x) => x.bg(on ? t.selected : t.hover))
        .on_click(() => this.open(d))
        .child(div().min_w(0).truncate().text_color(on ? t.foreground : t.muted).child(d.title))
        .child(h_flex().gap(6).items_center().min_w(0)
          .child(div().flex_none().text_size(11).text_color(t.accent).child(`${short} #${d.n}`))
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(d.author)))
        .child(h_flex().gap(5).items_center().min_w(0)
          .when(it.cat === "review" && !d.my && this.drafts.has(`${short}#${d.n}`), (el) => el.child(chip("drafted", t.accent)))
          .child(chip(LABEL[it.cat], it.cat === "wait" ? t.dim : colorOf[it.cat]))
          .when(fresh && it.cat !== "talk", (el) => el.child(chip("new", t.working)))
          .when(Boolean(tail), (el) => el.child(chip(tail, t.dim)))
          .child(chip(age(d.createdAt), t.dim)));
    };
    const todayS = ymd(new Date());
    const trow = (it) => {
      const k = it.k, on = focused && this.sel === it.id, due = (k.due || "").slice(0, 10), late = due && due < todayS, tod = due === todayS;
      const box = div().id("cb:" + it.id).flex_none().w(14).h(14).rounded(5).border_1().border_color(on ? t.accent : t.dim).cursor_pointer().hover((x) => x.bg(t.hover))
        .on_click((_e, cx) => { cx.stop_propagation(); this.complete(k, cx); });
      return h_flex().id(it.id).flex_none().px(10).py(4).gap(7).items_center().rounded(7).cursor_pointer().bg(on ? t.selected : t.background).hover((x) => x.bg(on ? t.selected : t.hover))
        .on_click(() => this.activate(it))
        .child(box)
        .child(chip((k.cal || "").toUpperCase(), t.accent))
        .child(div().flex_1().min_w(0).truncate().text_color(on ? t.foreground : t.muted).child(k.title))
        .when(k.prio === 1, (el) => el.child(div().flex_none().text_size(11).font_semibold().text_color(t.blocked).child("!")))
        .when(this.armed === "del" + k.id, (el) => el.child(div().flex_none().text_size(11).text_color(t.blocked).child("press d again to delete")))
        .when(Boolean(due) && this.armed !== "del" + k.id, (el) => el.child(div().flex_none().text_size(11).text_color(late ? t.blocked : tod ? t.working : t.dim).child(late ? `overdue ${due.slice(5)}` : tod ? "today" : due.slice(5))));
    };
    const drow = (it) => {
      const l = it.l, on = focused && this.sel === it.id, id = "d:" + l.pid + ":" + l.port, ask = this.armed === "stop" + id ? "press s again to stop" : this.armed === "restart" + id ? "press r again to restart" : "";
      const btn = (key, glyph, what) => div().id(key + it.id).flex_none().w(20).h(20).flex().items_center().justify_center().rounded(5).cursor_pointer().text_size(12).text_color(t.dim).hover((x) => x.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => { cx.stop_propagation(); this.act(l, what, cx); }).child(glyph);
      return v_flex().id(it.id).flex_none().px(10).py(4).gap(1).rounded(7).cursor_pointer().bg(on ? t.selected : t.background).hover((x) => x.bg(on ? t.selected : t.hover))
        .on_click(() => this.activate(it))
        .child(h_flex().gap(4).items_center().min_w(0)
          .child(div().flex_1().min_w(0).truncate().text_color(on ? t.foreground : t.muted).child(this.bmName(l)))
          .child(btn("rs", "↻", "restart")).child(btn("st", "✕", "stop")))
        .child(h_flex().gap(6).items_center().min_w(0)
          .child(div().flex_none().text_size(11).text_color(t.accent).child(`:${l.port}`))
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(ask ? "" : tidy(l)))
          .when(Boolean(ask), (el) => el.child(div().flex_1().text_size(11).text_color(t.blocked).child(ask)))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(dage(l.up))));
    };
    const vrow = (it) => {
      const x = it.x, on = focused && this.sel === it.id, mark = "srv" + x.type + x.id, ask = this.armed === mark ? "press s again to stop" : "";
      const btn = (key, glyph, fn) => div().id(key + it.id).flex_none().w(20).h(20).flex().items_center().justify_center().rounded(5).cursor_pointer().text_size(12).text_color(t.dim).hover((y) => y.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => { cx.stop_propagation(); fn(cx); }).child(glyph);
      return v_flex().id(it.id).flex_none().px(10).py(4).gap(1).rounded(7).cursor_pointer().bg(on ? t.selected : t.background).hover((y) => y.bg(on ? t.selected : t.hover))
        .on_click(() => this.activate(it))
        .child(h_flex().gap(4).items_center().min_w(0)
          .child(div().w(7).h(7).flex_none().rounded(4).bg(x.up ? t.done : t.dim))
          .child(div().flex_1().min_w(0).truncate().text_color(on ? t.foreground : t.muted).child(x.type === "dev" ? (x.up ? x.text || "dev server" : "dev server (dead)") : `mongo ${x.id}`))
          .when(x.type === "dev" && x.up, (el) => el.child(btn("tn", "⇄", () => this.tunnel(x))))
          .child(btn("ss", "✕", (cx) => this.stopServe(x, cx))))
        .child(h_flex().gap(6).items_center().min_w(0)
          .child(div().flex_none().text_size(11).text_color(t.accent).child(x.type === "dev" ? `:${x.id}` : x.id))
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(ask ? t.blocked : t.dim).child(ask || `tm-serve${x.type === "mongo" && x.up ? " · " + x.text : ""}`)));
    };
    const jrow = (it) => {
      const j = it.j, on = focused && this.sel === it.id, nx = j.enabled && j.next?.[0], bad = j.last && j.last.code !== 0;
      return h_flex().id(it.id).flex_none().px(10).py(4).gap(7).items_center().rounded(7).cursor_pointer().bg(on ? t.selected : t.background).hover((x) => x.bg(on ? t.selected : t.hover))
        .on_click(() => this.activate(it))
        .child(div().w(7).h(7).flex_none().rounded(4).bg(j.enabled ? t.done : t.border))
        .child(div().flex_1().min_w(0).truncate().text_color(on ? t.foreground : j.enabled ? t.muted : t.dim).child(j.name))
        .when(bad, (el) => el.child(div().flex_none().text_size(11).text_color(t.blocked).child("failed")))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(nx ? nextWhen(nx) : "off"));
    };
    const brow = (it) => {
      const b = it.b, on = focused && this.sel === it.id, starting = Boolean(this.terminalFor(b.id));
      return v_flex().id(it.id).flex_none().px(10).py(4).gap(1).rounded(7).cursor_pointer().bg(on ? t.selected : t.background).hover((x) => x.bg(on ? t.selected : t.hover))
        .on_click(() => this.activate(it))
        .child(h_flex().gap(4).items_center().min_w(0)
          .child(div().flex_1().min_w(0).truncate().text_color(on ? t.foreground : t.dim).child(b.name))
          .child(div().flex_none().h(20).px(8).flex().items_center().rounded(5).border_1().border_color(t.border).text_size(11).text_color(starting ? t.dim : t.accent).child(starting ? "starting…" : "Start")))
        .child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(`stopped · ${(b.folder ?? "").replace(/^\/home\/[^/]+/, "~")}`));
    };
    const arow = (it) => {
      const q = it.q, on = focused && this.sel === it.id, where = (q.repo ?? "").split("/").pop() + (q.pr ? ` #${q.pr}` : q.branch ? ` ${q.branch}` : "");
      return v_flex().id(it.id).flex_none().px(10).py(5).gap(2).rounded(7).cursor_pointer().bg(on ? t.selected : t.background).hover((x) => x.bg(on ? t.selected : t.hover))
        .on_click(() => this.activate(it))
        .child(div().min_w(0).truncate().text_color(on ? t.foreground : t.muted).child(q.title || `${q.kind} ${where}`))
        .child(h_flex().gap(6).items_center().min_w(0)
          .child(chip(q.kind + (q.mode ? " " + q.mode.replace(/^--/, "") : ""), t.blocked))
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.accent).child(where))
          .child(chip(age(new Date(q.at).toISOString()), t.dim)));
    };
    const hrow = (it) => {
      const b = it.bk, stale = !b.syncAt || Date.now() - b.syncAt > 2 * 3600e3, bad = !b.ok || stale;
      const text = !b.ok ? "tm-serve not reachable" : b.syncAt ? `broker: last sync ${age(new Date(b.syncAt).toISOString())} ago${stale ? " (stale)" : ""}` : "broker: no sync logged";
      return h_flex().id(it.id).flex_none().px(10).py(3).gap(6).items_center().child(div().w(7).h(7).flex_none().rounded(4).bg(bad ? t.blocked : t.done)).child(div().min_w(0).truncate().text_size(11).text_color(bad ? t.blocked : t.dim).child(text));
    };
    const more = (it) => div().id(it.id).px(10).py(4).text_size(11).text_color(t.dim).child(it.text);
    const head = (it) => {
      const on = focused && this.sel === it.id, open = !this.folded.has(it.key);
      return h_flex().id(it.id).flex_none().mt(4).px(10).h(26).gap(6).items_center().rounded(7).cursor_pointer().bg(on ? t.selected : t.background).hover((x) => x.bg(on ? t.selected : t.hover))
        .on_click((_e, cx) => { this.sel = it.id; this.fold(it.key, cx); })
        .child(div().w(10).flex_none().text_size(10).text_color(t.dim).child(open ? "▾" : "▸"))
        .child(div().flex_none().text_size(12).font_semibold().text_color(t.muted).child(it.name.toUpperCase()))
        .child(div().flex_none().text_size(12).font_semibold().text_color(t.foreground).child(String(it.n)))
        .child(h_flex().pl(6).gap(8).items_center().min_w(0).overflow_hidden().children(it.counts.map(([k, n]) => h_flex().gap(3).items_center().flex_none().child(div().text_size(11).font_semibold().text_color(colorOf[k]).child(String(n))).child(div().text_size(11).text_color(t.dim).child(LABEL[k])))));
    };
    const items = this.items();
    // Explicit height (a scroll container will not shrink to its content): headers 31px, schedule rows 29px, server rows 47px, capped.
    const pinH = Math.min(520, 10 + items.filter((it) => PINNED.includes(it.key)).reduce((a, it) => a + (it.head ? 31 : it.kind === "dev" || it.kind === "bm" || it.kind === "srv" ? 47 : 29), 0));
    const addRow = h_flex().id("inbox-add-row").flex_none().px(6).py(4).gap(6).items_center().rounded(7).border_1().border_color(t.accent).bg(t.raised)
      .child(div().id("inbox-add-cal").flex_none().h(18).px(6).flex().items_center().rounded(5).border_1().border_color(t.border).cursor_pointer().text_size(11).text_color(t.accent)
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => this.cycleCal(cx)).child(this.cal.toUpperCase()))
      .child(Input.new(this.addState).flex_1().min_w(0).h(24).text_size(12.8).text_color(t.foreground));
    const draw = (it) => (it.head ? head(it) : it.kind === "add" ? addRow : it.kind === "appr" ? arow(it) : it.kind === "health" ? hrow(it) : it.kind === "task" ? trow(it) : it.kind === "dev" ? drow(it) : it.kind === "srv" ? vrow(it) : it.kind === "bm" ? brow(it) : it.kind === "job" ? jrow(it) : it.kind === "more" ? more(it) : row(it));
    return v_flex().id("inbox-panel").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx)).size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(focused ? t.accent : t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(30).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().id("inbox-title").font_semibold().cursor_pointer().on_click(() => { setShared("git-tab", "inbox"); run("mod.open", { name: "changes-float" }); }).child("Inbox"))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim).child(s ? (total + lateN ? `${total + lateN} need you` : "all clear") : ""))
        .child(iconBtn("inbox-add", "+", (_e, cx) => this.startAdd(cx)))
        .child(iconBtn("inbox-refresh", "↻", () => setShared("inbox-ask", Date.now()))))
      .child(v_flex().id("inbox-body").flex_1().min_h(0).overflow_y_scrollbar().p(8).gap(1).children(items.filter((it) => !PINNED.includes(it.key)).map(draw))
        .when(this.err && !s, (el) => el.child(div().p(8).text_size(12).text_color(t.blocked).child(this.err)))
        .when(!s && !this.err, (el) => el.child(div().p(8).text_size(12).text_color(t.dim).child("Loading…")))
        .when(Boolean(s) && items.length === 0, (el) => el.child(div().p(8).text_size(12).text_color(t.dim).child("Nothing needs you right now.")))
        .when(Boolean(s) && s.covered > 0, (el) => el.child(div().px(10).pt(10).text_size(11).text_color(t.dim).child(`${s.covered} more already approved by others`)))
        .when(Boolean(this.err && s), (el) => el.child(div().px(10).pt(8).text_size(11).text_color(t.blocked).child(this.err))))
      .when(items.some((it) => PINNED.includes(it.key)), (el) => el.child(v_flex().id("inbox-pinned").flex_none().h(pinH).overflow_y_scrollbar().px(8).pb(6).pt(2).gap(1).border_t(1).border_color(t.border).children(items.filter((it) => PINNED.includes(it.key)).map(draw))))
      .when(focused, (el) => el.child(div().flex_none().px(14).py(6).border_t(1).border_color(t.border).truncate().text_size(11).text_color(t.dim).child("j k move (wraps) · g G first / last · ← → fold · a fold all · Enter open (approval: gb-ok · schedule: manage) · n new task · x tick · d delete task · s stop · t tunnel (tm-serve) · e servers · r restart / start (server) or refresh · Esc leave")));
  }
}
