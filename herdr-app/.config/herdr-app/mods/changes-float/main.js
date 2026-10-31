import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, v_virtual_list, TextView } from "gpui-base";
import { spaces, panes, agents, focused, exec, hc, readTextFile, watchFolder, theme, settings, run, props, closeOverlay, shared, setShared, pickFolder } from "herdr";

// Repo pinned to the active tab (else its space): the agents run in ~/workspace while the code lives elsewhere.
// Stored in shared("git-pins") as { [tabId | "space:"+spaceId]: [repo paths] }; Herdr saves shared state itself.
function pinOf() {
  const sp = spaces().find((s) => s.active);
  if (!sp || sp.machine) return null;
  const tab = sp.tabs.find((t) => t.active), pins = shared("git-pins") || {};
  const list = (tab && pins[tab.id]) || pins["space:" + sp.id];
  return Array.isArray(list) && list.length ? list : null;
}
function setPin(list) {
  const sp = spaces().find((s) => s.active), tab = sp?.tabs.find((t) => t.active);
  if (!tab) return;
  const pins = { ...(shared("git-pins") || {}) };
  if (list) pins[tab.id] = list; else delete pins[tab.id];
  setShared("git-pins", pins);
}
function location() {
  const pin = pinOf();
  if (pin) return { cwd: pin[0], on: null };
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());
// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie):
// the folder watch would see it, and every refresh would start the next one.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const TABS = [["dashboard", "Dashboard"], ["changes", "Changes"], ["open", "Open PRs"], ["merged", "Merged"]];
const MERGED_DAYS = 14;
// Survives closing the window (module scope), so reopening and revisiting a PR show at once and refresh behind.
const CACHE = { info: {}, details: new Map() };
const cacheFile = (top, n) => `/tmp/herdr-gitwin-cache/${(top + "_" + n).replace(/[^A-Za-z0-9]/g, "_")}.json`;
const remember = (key, value) => { CACHE.details.set(key, value); if (CACHE.details.size > 40) CACHE.details.delete(CACHE.details.keys().next().value); };
const ymd = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ago = (iso) => {
  const m = Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};
const checkState = (list) => {
  const bad = list.some((c) => ["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED"].includes(c.conclusion) || c.state === "FAILURE" || c.state === "ERROR");
  const wait = list.some((c) => (c.status && c.status !== "COMPLETED") || c.state === "PENDING");
  return bad ? "fail" : wait ? "wait" : list.length ? "pass" : "none";
};
const countLines = (text) => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;

// Numbers each diff line once, so a frame only draws the rows on screen.
function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, number: old++, text: line.slice(1) || " " };
    if (kind === "+") return { kind, number: next++, text: line.slice(1) || " " };
    if (kind === " ") { old++; return { kind, number: next++, text: line.slice(1) || " " }; }
    return { kind: "", text: line };
  });
}

export default class Changes extends View {
  init(_props, cx) {
    const want = shared("git-tab");
    if (want) cx.timer.after(50, () => setShared("git-tab", ""));
    this.tab = want || "dashboard";
    if (this.tab === "merged") cx.timer.after(50, () => setShared("merged-seen", Date.now())); this.info = shared("git-info") || {}; this.remote = shared("git-remote") || {}; this.remoteAt = 0; this.infoAt = 0; this.dsel = -1; this.acts = []; this.order = []; this.repos = null; this.cwdKey = null; this.prLoading = false; this.prAt = 0; this.sel = 0;
    this.files = []; this.rows = []; this.diffWidth = 0; this.message = ""; this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Commit message" });
    this.input.on("change", (_e, cx) => {
      const hadMessage = Boolean(this.message.trim());
      this.message = this.input.value();
      if (hadMessage !== Boolean(this.message.trim())) cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.commit(cx));
    this.detail = null;
    this.dInput = InputState.new({ placeholder: "Write your message, Enter to send" });
    this.dInput.on("submit", (_e, cx) => this.runAction(cx));
    this.dInput.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.dInput.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.handle.focus();
    cx.timer.after(400, () => { if (!this.typing) this.handle.focus(); });
    const fc = shared("git-files");
    if (fc && fc.context === key()) { this.context = fc.context; this.root = fc.root; this.hasHead = fc.hasHead; this.files = fc.files; this.open = null; }
    this.refresh(cx);
    this.loadPrs(cx);
    cx.timer.every(10000, (cx) => { if (this.on) this.refresh(cx); this.loadPrs(cx); if (this.tab === "dashboard") this.loadInfo(cx); });
  }

  // Open and recently merged PRs of the git repos the active tab's terminals sit in (read only, `gh pr list`).
  loadPrs(cx, force) {
    const sp = spaces().find((x) => x.active);
    const tabs = new Set((sp?.tabs ?? []).filter((x) => x.active).map((x) => x.id));
    const pin = pinOf();
    const cwds = pin ? pin.slice(0, 8) : [...new Set(panes().filter((p) => p.terminal && p.cwd && tabs.has(p.tab)).map((p) => p.cwd))].slice(0, 8);
    if (!cwds.length) { const c = location().cwd; if (c) cwds.push(c); }
    const cwdKey = cwds.join("|");
    if (cwdKey !== this.cwdKey) { this.cwdKey = cwdKey; this.repos = null; this.prAt = 0; }
    const c = shared("pr-data");
    if (c && c.at > this.prAt && cwds.every((w) => c.repos.some((r) => r.cwds?.includes(w)))) {
      this.repos = JSON.parse(JSON.stringify(c.repos.filter((r) => r.cwds.some((w) => cwds.includes(w))))); this.prAt = c.at; this.loadInfo(cx);
    }
    // The status bar already fetches every minute and shares it, so only a stale cache or R asks gh.
    if (this.prLoading || (!force && Date.now() - this.prAt < 120000)) return;
    this.prLoading = true;
    const script = 'cd "$1" 2>/dev/null && top=$(git rev-parse --show-toplevel 2>/dev/null) && echo "$top" && gh pr list --state all --limit 40 --json number,title,headRefName,author,isDraft,state,reviewDecision,reviewRequests,statusCheckRollup,createdAt,mergedAt,url 2>&1';
    cx.spawn(async (cx) => {
      const seen = new Map(); let failed = null;
      await Promise.all(cwds.map(async (cwd) => {
        try {
          const r = await hc(["exec", "sh", "-c", script, "sh", cwd]);
          if (r.code !== 0) return;
          const [top, ...rest] = r.stdout.split("\n");
          if (!top || seen.has(top)) return;
          const body = rest.join("\n");
          let list; try { list = JSON.parse(body || "[]"); } catch { failed = body.trim().split("\n")[0]; return; }
          const cut = Date.now() - MERGED_DAYS * 864e5;
          const me = shared("git-me");
          seen.set(top, {
            top, cwds: [cwd],
            name: top.split("/").pop(),
            open: list.filter((d) => d.state === "OPEN" && !d.isDraft).map((d) => ({ ...d, checks: checkState(d.statusCheckRollup ?? []), needsMe: Boolean(me) && ((d.reviewRequests ?? []).some((q) => q.login === me || (q.slug && (shared("git-teams") || []).includes(q.slug)))) })),
            merged: list.filter((d) => d.state === "MERGED" && Date.parse(d.mergedAt) > cut).sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt)),
          });
        } catch {}
      }));
      this.repos = [...seen.values()]; this.prError = this.repos.length ? null : failed || "No git repository with GitHub PRs in this tab";
      this.prAt = Date.now(); this.prLoading = false;
      if (this.cwdKey === cwdKey) this.loadInfo(cx);
      cx.notify();
    });
  }

  togglePin(cx) {
    if (pinOf()) { setPin(null); this.loadPrs(cx, true); cx.notify(); return; }
    cx.spawn(async (cx) => {
      try { const dir = await pickFolder({ prompt: "Pin this tab to repo" }); if (dir) { setPin([dir]); this.loadPrs(cx, true); } } catch {}
      cx.notify();
    });
  }

  setTab(tab, cx) {
    if (tab === this.tab) return;
    this.tab = tab; this.sel = 0; this.dsel = -1; this.detail = null;
    this.loadPrs(cx);
    if (tab === "merged") setShared("merged-seen", Date.now());
    cx.notify();
  }

  prList() {
    return (this.repos ?? []).flatMap((r) => (this.tab === "open" ? r.open : r.merged).map((d) => ({ ...d, repo: r.name, top: r.top })));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refresh(cx);
        }
      } catch { this.watched = null; }
    });
  }

  refresh(cx) {
    if (this.loading || this.busy) return;
    const { cwd, on } = location(), context = key();
    if (context !== this.context) {
      this.context = context; this.root = null; this.files = []; this.open = null;
      this.setLines([]); this.message = ""; if (this.input.value()) this.input.set_value(""); this.error = null; this.note = null; this.watched = null; this.closed = false; this.limited = false;
    }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (key() !== context) return;
        if (top.code !== 0) { this.root = null; this.files = []; this.setLines([]); this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        const status = await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
        if (status.code !== 0) throw new Error(status.stderr);
        const head = await git(["rev-parse", "--verify", "HEAD"]);
        const stats = {};
        const results = head.code === 0 ? [await git(["diff", "HEAD", "--numstat", "-z", "--no-renames"])] : [await git(["diff", "--cached", "--numstat", "-z", "--no-renames"]), await git(["diff", "--numstat", "-z", "--no-renames"])];
        for (const result of results) {
          if (result.code !== 0) throw new Error(result.stderr);
          for (const entry of result.stdout.split("\0")) {
            const [a, d, ...parts] = entry.split("\t");
            if (!parts.length) continue;
            const path = parts.join("\t"), old = stats[path] ?? { add: 0, del: 0 };
            stats[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0), binary: a === "-" };
          }
        }
        const files = [];
        const entries = status.stdout.split("\0").filter(Boolean);
        for (const entry of entries.slice(0, 1000)) {
          const xy = entry.slice(0, 2), path = entry.slice(3), fresh = xy === "??";
          const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
          const s = conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M";
          const stat = stats[path] ?? { add: 0, del: 0 };
          files.push({ path, status: s, fresh, ...stat });
        }
        if (key() !== context) return;
        this.root = root; this.on = on; this.hasHead = head.code === 0; this.files = files; this.limited = entries.length > 1000; this.error = null;
        this.watch(root, cx);
        const snap = { context, root, hasHead: this.hasHead, files };
        if (JSON.stringify(snap) !== JSON.stringify(shared("git-files"))) setShared("git-files", snap);
        if (this.open && !files.some((f) => f.path === this.open)) { this.open = null; this.setLines([]); }
        // The first file's diff shows until you pick another.
        if (!this.open && !this.closed && files.length) this.open = files[0].path;
        if (this.open) {
          try { await this.load(this.open, context); }
          catch { if (key() === context) this.setLines(["Cannot preview this diff (too large or unreadable)"]); }
        }
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  async load(path, context) {
    const file = this.files.find((f) => f.path === path), root = this.root, on = this.on;
    if (!file) return;
    let lines;
    if (file.fresh || (!this.hasHead && file.status === "A")) {
      const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
      if (text === null) lines = ["Cannot preview this file (binary, too large, or unreadable)"];
      else if (text.includes("\0")) lines = ["Binary file · no text diff"];
      else {
        file.add = countLines(text);
        lines = [`@@ -0,0 +1,${file.add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, 1500).map(l => `+${l}`)];
      }
    } else {
      const r = await exec("git", [...READ, "diff", ...(this.hasHead ? ["HEAD"] : []), "--no-ext-diff", "--no-textconv", "--no-color", "--", path], { cwd: root, on });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? "Binary file changed" : "No text diff available"] : all.slice(first);
    }
    if (key() === context && this.open === path) this.setLines(lines.slice(0, 1500).map(line => line.length > 4000 ? line.slice(0, 4000) + "… (line truncated)" : line));
  }

  setLines(lines) {
    this.rows = diffRows(lines);
    this.diffWidth = Math.max(300, ...lines.map(line => line.length * 7 + 50));
  }

  pick(path, cx) {
    this.open = this.open === path ? null : path; this.setLines([]); this.note = null;
    this.closed = !this.open;
    const context = this.context;
    if (this.open) cx.spawn(async (cx) => {
      try { await this.load(path, context); }
      catch (e) { if (key() === context && this.open === path) this.note = `Cannot preview this diff (too large or unreadable): ${e}`; }
      cx.notify();
    });
    cx.notify();
  }

  commit(cx) {
    if (!this.message.trim() || !this.root || this.busy || this.loading || this.context !== key()) return;
    const root = this.root, on = this.on, context = this.context, message = this.message.trim();
    this.busy = true; this.note = null;
    cx.spawn(async (cx) => {
      try {
        for (const args of [["add", "-A"], ["commit", "-m", message]]) {
          const r = await exec("git", args, { cwd: root, on });
          if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
        }
        if (key() === context) { this.message = ""; this.input.set_value(""); }
      } catch (e) { if (key() === context) this.note = `Commit failed: ${e}`; }
      finally { this.busy = false; this.refresh(cx); cx.notify(); }
    });
    cx.notify();
  }

  diffRow({ kind, number, text }, t) {
    if (kind === "f") return div().w_full().px(12).h(26).flex_none().flex().items_center().font_semibold().truncate().bg(t.raised).text_color(t.foreground).child(text);
    if (kind === "@") return div().w_full().px(12).h(20).flex_none().truncate().bg(t.raised).text_color(t.dim).child(text);
    return h_flex().w_full().h(20).flex_none().gap(10).when(kind === "+", (e) => e.bg(t.ansi2 + "18")).when(kind === "-", (e) => e.bg(t.ansi1 + "18"))
      .child(div().w(30).flex_none().text_right().text_color(t.dim).child(number === undefined ? "" : String(number)))
      .child(div().flex_1().min_w(0).truncate().child(text));
  }

  render(cx) {
    if (key() !== this.context) this.refresh(cx);
    const t = theme(), add = this.files.reduce((n, f) => n + f.add, 0), del = this.files.reduce((n, f) => n + f.del, 0);
    const enabled = Boolean(this.message.trim() && this.root && !this.busy && !this.loading);
    return v_flex().id("changes").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (this.detail && this.detailKey(e, cx)) { cx.stop_propagation(); return; }
        if (e.key === "escape" && this.typing) { this.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); return; }
        if (!this.typing) {
          if (e.key === "p") { this.togglePin(cx); cx.stop_propagation(); return; }
          const i = ["1", "2", "3", "4"].indexOf(e.key);
          if (i >= 0) { this.setTab(TABS[i][0], cx); cx.stop_propagation(); return; }
          if (e.key === "tab") { this.setTab(TABS[(TABS.findIndex(([k]) => k === this.tab) + (e.modifiers.shift ? TABS.length - 1 : 1)) % TABS.length][0], cx); cx.stop_propagation(); return; }
        }
        if (this.tab === "dashboard" && !this.typing) {
          const k = e.key, ord = this.order, pos = ord.indexOf(this.dsel);
          if (k === "down" || k === "j" || k === "right" || k === "l") this.dsel = ord[Math.min(ord.length - 1, pos + 1)] ?? this.dsel;
          else if (k === "up" || k === "k" || k === "left" || k === "h") this.dsel = ord[Math.max(0, pos - 1)] ?? this.dsel;
          else if ((k === "enter" || k === "o") && this.acts[this.dsel]) this.acts[this.dsel].fn(cx);
          if (["down", "j", "right", "l", "up", "k", "left", "h", "enter", "o"].includes(k)) { cx.stop_propagation(); cx.notify(); return; }
        }
        if (this.tab === "dashboard" && e.key === "r") { this.loadPrs(cx, true); this.loadInfo(cx, true); cx.stop_propagation(); return; }
        if (this.tab === "open" || this.tab === "merged") {
          const list = this.prList();
          if (e.key === "down" || e.key === "j") this.sel = Math.min(list.length - 1, this.sel + 1);
          else if (e.key === "up" || e.key === "k") this.sel = Math.max(0, this.sel - 1);
          else if (e.key === "enter" && list[this.sel]) this.openPr(list[this.sel], list[this.sel].top, cx);
          else if (e.key === "r") this.loadPrs(cx, true);
          else return;
          cx.stop_propagation(); cx.notify(); return;
        }
        if ((e.key === "enter" || e.key === "e") && !this.typing && this.open && this.root && !this.on) {
          const path = this.open;
          closeOverlay(props().overlay);
          run("terminal.open", { argv: ["vim", path], folder: this.root, place: "right", name: path.split("/").pop() });
          cx.stop_propagation();
          return;
        }
        // keyboard: Up/Down or J/K (plain, or with Ctrl) choose the file whose diff shows
        const ctrl = e.modifiers.control;
        const down = e.key === "down" || (e.key === "j" && (ctrl || !this.typing)), up = e.key === "up" || (e.key === "k" && (ctrl || !this.typing));
        if ((down || up) && this.files.length && (!this.typing || e.key === "up" || e.key === "down" || ctrl)) {
          const at = this.files.findIndex((f) => f.path === this.open);
          const next = this.files[Math.max(0, Math.min(this.files.length - 1, (at < 0 ? 0 : at) + (down ? 1 : -1)))];
          if (next) this.pick(next.path, cx);
          cx.stop_propagation();
        }
      })
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .children(TABS.map(([k, label], i) => div().id(`gtab-${k}`).px(10).py(4).rounded(6).cursor_pointer().text_size(12).when(this.tab === k, (e) => e.bg(t.selected).font_semibold()).when(this.tab !== k, (e) => e.text_color(t.muted).hover((s) => s.bg(t.hover))).on_click((_e, cx) => this.setTab(k, cx))
          .child(k === "changes" ? `${label} ${this.files.length}` : (k === "open" || k === "merged") && this.repos ? `${label} ${this.repos.reduce((n, r) => n + r[k].length, 0)}` : label)))
        .child(div().flex_1())
        .child(div().id("pin").px(8).py(3).rounded(6).border_1().border_color(pinOf() ? t.accent : t.border).cursor_pointer().text_size(11).text_color(pinOf() ? t.foreground : t.muted).hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.togglePin(cx))
          .child(pinOf() ? `pinned: ${pinOf()[0].split("/").pop()} (click to unpin)` : "Pin repo (P)"))
        .when(!this.detail && this.tab === "changes", (e) => e.child(div().text_size(11).text_color(t.dim).child("1-4 tabs · ↑↓ files · Enter edit in vim · Esc")).child(div().text_size(11).text_color(t.ansi2).child(`+${add}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${del}`)))
        .when(Boolean(this.detail), (e) => e.child(div().text_size(11).text_color(t.dim).child("Backspace back · D diff · A approve · C comment · X request changes · M merge · B browser")))
        .when(!this.detail && this.tab === "dashboard", (e) => e.child(div().text_size(11).text_color(t.dim).child("1-4 tabs · arrows/J K select · Enter open · R refresh · Esc")))
        .when(!this.detail && (this.tab === "open" || this.tab === "merged"), (e) => e.child(div().text_size(11).text_color(t.dim).child("1-4 tabs · ↑↓ select · Enter open PR · R refresh · Esc"))))
      .when(Boolean(this.detail), (e) => e.child(this.detailBody(t)))
      .when(!this.detail && this.tab === "dashboard", (e) => e.child(this.dashBody(t)))
      .when(!this.detail && (this.tab === "open" || this.tab === "merged"), (e) => e.child(this.prBody(t)))
      .when(!this.detail && this.tab === "changes", (e) => e.child(this.changesBody(t, enabled)))
  }

  // Per repo, slower (`gh`, at most once a minute): default-branch CI, merged local branches, open issues and
  // the ones assigned to you.
  loadRemote(cx) {
    if (!this.repos?.length || this.remoteLoading || Date.now() - this.remoteAt < 60000) return;
    this.remoteLoading = true; this.remoteAt = Date.now();
    const script = [
      'cd "$1" 2>/dev/null || exit 1',
      'def=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed "s@^origin/@@"); [ -n "$def" ] || def=main',
      'echo "def $def"',
      'echo "merged $(git branch --merged "$def" --format="%(refname:short)" 2>/dev/null | grep -v -x -e "$def" -e "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" | wc -l)"',
      'gh run list --branch "$def" --limit 1 --json status,conclusion --jq ".[]|\"ci \\(.status)|\\(.conclusion)\"" 2>/dev/null',
      'gh issue list --state open --limit 100 --json number --jq "\"issues \\(length)\"" 2>/dev/null',
      'gh issue list --assignee @me --state open --limit 6 --json number,title,url,updatedAt --jq ".[]|\"i \\(.number)|\\(.updatedAt)|\\(.url)|\\(.title)\"" 2>/dev/null',
    ].join("; ");
    const repos = this.repos;
    cx.spawn(async (cx) => {
      const next = {};
      await Promise.all(repos.map(async (r) => {
        try {
          const o = await hc(["exec", "sh", "-c", script, "sh", r.top]);
          if (o.code !== 0) return;
          const v = { mine: [] };
          for (const line of o.stdout.split("\n")) {
            const sp = line.indexOf(" "), k = line.slice(0, sp), val = line.slice(sp + 1);
            if (k === "def") v.def = val;
            else if (k === "merged") v.merged = Number(val) || 0;
            else if (k === "ci") { const [status, conclusion] = val.split("|"); v.ci = { status, conclusion }; }
            else if (k === "issues") v.issues = Number(val) || 0;
            else if (k === "i") { const [n, at, url, ...title] = val.split("|"); v.mine.push({ n: Number(n), at, url, title: title.join("|") }); }
          }
          next[r.top] = v;
        } catch {}
      }));
      this.remote = { ...this.remote, ...next }; this.remoteLoading = false;
      if (JSON.stringify(this.remote) !== JSON.stringify(shared("git-remote"))) setShared("git-remote", this.remote);
      cx.notify();
    });
  }

  // Per repo for the dashboard: branch, ahead/behind, last commit, change size, stashes, recent commits and
  // commits per day (one `sh` per repo, read only).
  loadInfo(cx, force) {
    if (!this.repos?.length || this.infoLoading || (!force && Date.now() - this.infoAt < 12000)) return;
    this.infoLoading = true; this.infoAt = Date.now();
    this.loadRemote(cx);
    const script = [
      'cd "$1" 2>/dev/null || exit 1',
      'echo "branch $(git rev-parse --abbrev-ref HEAD 2>/dev/null)"',
      'echo "ab $(git rev-list --left-right --count "@{u}...HEAD" 2>/dev/null | tr "\\t" " ")"',
      'echo "ct $(git log -1 --format=%ct 2>/dev/null)"',
      'echo "n $(git --no-optional-locks status --porcelain 2>/dev/null | wc -l)"',
      'echo "stat $(git --no-optional-locks diff HEAD --shortstat 2>/dev/null)"',
      'echo "stash $(git stash list 2>/dev/null | wc -l)"',
      'echo "remote $(git remote get-url origin 2>/dev/null)"',
      'git log -5 --format="c %h|%an|%ct|%s" 2>/dev/null',
      'git log --since="14 days ago" --format="d %cd" --date=format:%Y-%m-%d 2>/dev/null',
    ].join("; ");
    const repos = this.repos;
    cx.spawn(async (cx) => {
      const next = {};
      await Promise.all(repos.map(async (r) => {
        try {
          const o = await hc(["exec", "sh", "-c", script, "sh", r.top]);
          if (o.code !== 0) return;
          const v = { commits: [], days: {} };
          for (const line of o.stdout.split("\n")) {
            const sp = line.indexOf(" "), k = line.slice(0, sp), val = line.slice(sp + 1);
            if (k === "branch") v.branch = val;
            else if (k === "ab") { const [b, a] = val.split(" ").map(Number); v.behind = b || 0; v.ahead = a || 0; }
            else if (k === "ct") v.ct = Number(val) * 1000 || 0;
            else if (k === "n") v.changed = Number(val) || 0;
            else if (k === "stat") { v.add = Number(/(\d+) insertion/.exec(val)?.[1] ?? 0); v.del = Number(/(\d+) deletion/.exec(val)?.[1] ?? 0); }
            else if (k === "stash") v.stash = Number(val) || 0;
            else if (k === "remote") v.web = /github\.com[:/](.+?)(\.git)?$/.exec(val)?.[1] ? "https://github.com/" + /github\.com[:/](.+?)(\.git)?$/.exec(val)[1] : null;
            else if (k === "c") { const [h, an, ct, ...subj] = val.split("|"); v.commits.push({ h, an, ct: Number(ct) * 1000, subject: subj.join("|") }); }
            else if (k === "d") v.days[val] = (v.days[val] ?? 0) + 1;
          }
          next[r.top] = v;
        } catch {}
      }));
      this.info = { ...this.info, ...next }; this.infoLoading = false; if (JSON.stringify(this.info) !== JSON.stringify(shared("git-info"))) setShared("git-info", this.info); cx.notify();
    });
  }

  dashBody(t) {
    const tab = spaces().find((s) => s.active)?.tabs.find((x) => x.active);
    const mine = agents().filter((a) => a.tab === tab?.id);
    const count = (st) => mine.filter((a) => a.status === st).length;
    const serving = shared("serving") || [];
    const day = 864e5;
    const acts = [], reg = (fn, rank = null) => acts.push({ fn, rank }) - 1, web = (url) => (url ? () => hc(["exec", "xdg-open", url]).catch(() => {}) : () => {});
    const pickable = (i0, e) => e.when(this.dsel === i0, (x) => x.bg(t.selected));
    const label = (text, color) => div().px(2).text_size(11).font_semibold().text_color(color ?? t.muted).child(text);
    const chip = (text, color) => div().px(7).py(2).rounded(5).border_1().border_color(color ?? t.border).text_size(11).text_color(color ?? t.muted).child(text);
    const tile = (n, name, sub, color, fn) => { const i0 = reg(fn); return v_flex().id(`tile-${i0}`).cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.dsel = i0; fn(cx); cx.notify(); }).flex_1().min_w(0).gap(2).px(14).py(10).rounded(8).bg(t.background).border_1().border_color(this.dsel === i0 ? t.accent : n > 0 && color ? color + "55" : t.border)
      .child(div().text_size(24).font_semibold().text_color(n > 0 && color ? color : t.foreground).child(String(n)))
      .child(div().text_size(11).text_color(t.muted).child(name))
      .child(div().h(14).text_size(10).text_color(t.dim).truncate().child(sub ?? "")); };
    const link = (d, tail, top) => { const i0 = reg((cx) => this.openPr(d, top, cx), 0); return pickable(i0, h_flex().id(`d-${i0}`).h(30).flex_none().px(10).gap(10).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.dsel = i0; this.openPr(d, top, cx); }))
      .child(div().w(46).flex_none().text_color(t.dim).child(`#${d.number}`)).child(div().flex_1().min_w(0).truncate().child(d.title))
      .child(div().flex_none().text_size(11).text_color(t.dim).child(d.author?.login ?? "")).child(div().w(74).flex_none().text_right().text_size(11).text_color(t.dim).child(tail)); };
    const cards = (this.repos ?? []).map((r) => {
      const i = this.info[r.top], rm = this.remote[r.top], open = r.open, need = open.filter((d) => d.needsMe), fail = open.filter((d) => d.checks === "fail");
      const ok = open.filter((d) => d.reviewDecision === "APPROVED"), wait = open.filter((d) => d.checks === "wait");
      const onMain = Boolean(i) && /^(main|master)$/.test(i.branch) && i.changed > 0;
      const run = serving.filter((v) => v.cwd === r.top || v.cwd.startsWith(r.top + "/"));
      const oldest = open.length ? Math.max(...open.map((d) => Date.now() - Date.parse(d.createdAt))) : 0;
      const ciState = rm?.ci ? (rm.ci.status !== "COMPLETED" ? "wait" : rm.ci.conclusion === "SUCCESS" ? "pass" : ["FAILURE", "TIMED_OUT", "STARTUP_FAILURE"].includes(rm.ci.conclusion) ? "fail" : "none") : "none";
      const health = need.length || fail.length || onMain || ciState === "fail" ? t.blocked : wait.length || i?.changed ? t.working : t.done;
      const bars = [];
      for (let k = 13; k >= 0; k--) bars.push(i?.days?.[ymd(Date.now() - k * day)] ?? 0);
      const peak = Math.max(1, ...bars), total = bars.reduce((a, b) => a + b, 0);
      const needRows = need.slice(0, 5).map((d) => link(d, ago(d.createdAt) + " old", r.top));
      const openRows = open.filter((d) => !d.needsMe).slice(0, 5).map((d) => link(d, ago(d.createdAt) + " old", r.top));
      const issueRows = (rm?.mine ?? []).slice(0, 5).map((x) => { const i0 = reg(web(x.url), 0); return pickable(i0, h_flex().id(`is-${i0}`).h(30).flex_none().px(10).gap(10).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.dsel = i0; web(x.url)(); cx.notify(); }))
        .child(div().w(46).flex_none().text_color(t.dim).child(`#${x.n}`)).child(div().flex_1().min_w(0).truncate().child(x.title)).child(div().w(74).flex_none().text_right().text_size(11).text_color(t.dim).child(ago(x.at) + " ago")); });
      const mergedRows = r.merged.slice(0, 3).map((d) => link(d, ago(d.mergedAt) + " ago", r.top));
      return h_flex().id(`card-${r.top}`).items_stretch().flex_none().rounded(10).overflow_hidden().border_1().border_color(t.border).bg(t.raised)
        .child(div().w(5).flex_none().self_stretch().bg(health))
        .child(v_flex().flex_1().min_w(0).gap(14).p(16)
          .child(h_flex().gap(10).items_center()
            .child((() => { const i0 = reg(web(i?.web)); return pickable(i0, div().id(`repo-${i0}`).px(6).py(2).rounded(6).font_semibold().text_size(16).cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.dsel = i0; web(i?.web)(); cx.notify(); })).child(r.name); })())
            .when(Boolean(i), (e) => e.child(chip(i.branch, onMain ? t.blocked : null)))
            .when(Boolean(i) && (i.ahead > 0 || i.behind > 0), (e) => e.child(chip(`ahead ${i.ahead} | behind ${i.behind}`, t.working)))
            .when(ciState !== "none", (e) => e.child(chip(`${rm.def} CI ` + ({ pass: "passing", fail: "failing", wait: "running" })[ciState], ({ pass: t.done, fail: t.blocked, wait: t.working })[ciState])))
            .when(Boolean(rm?.merged), (e) => e.child(chip(`${rm.merged} merged branch${rm.merged === 1 ? "" : "es"}`)))
            .when(Boolean(i?.stash), (e) => e.child(chip(`${i.stash} stash${i.stash === 1 ? "" : "es"}`)))
            .when(run.length > 0, (e) => e.child(chip(run.map((v) => `:${v.port}`).join(" "), t.working)))
            .child(div().flex_1())
            .when(onMain, (e) => e.child(div().text_size(11).text_color(t.blocked).child("changes on " + i.branch + ", branch first")))
            .when(Boolean(i?.ct), (e) => e.child(div().text_size(11).text_color(t.dim).child(`last commit ${ago(new Date(i.ct).toISOString())} ago`))))
          .child(h_flex().gap(10)
            .child(tile(i?.changed ?? 0, "Changed files", i ? (i.changed ? `+${i.add}  -${i.del}` : "clean") : "", t.working, (cx) => this.setTab("changes", cx)))
            .child(tile(open.length, "Open PRs", oldest ? `oldest ${Math.round(oldest / day)}d` : "", null, (cx) => this.setTab("open", cx)))
            .child(tile(need.length, "Need your review", need.length ? "waiting on you" : "", t.blocked, (cx) => need[0] && this.openPr(need[0], r.top, cx)))
            .child(tile(fail.length, "Failing CI", wait.length ? `${wait.length} running` : "", t.blocked, (cx) => fail[0] && this.openPr(fail[0], r.top, cx)))
            .child(tile(rm?.mine?.length ?? 0, "Your issues", rm?.issues != null ? `${rm.issues} open` : "", t.working, () => rm?.mine?.[0] && web(rm.mine[0].url)()))
            .child(tile(ok.length, "Approved", ok.length ? "ready to merge" : "", t.done, (cx) => ok[0] && this.openPr(ok[0], r.top, cx))))
          .when(needRows.length > 0, (e) => e.child(v_flex().gap(2).child(label("Needs your review", t.blocked)).children(needRows)))
          .when(openRows.length > 0, (e) => e.child(v_flex().gap(2).child(label("Open PRs")).children(openRows)))
          .when(issueRows.length > 0, (e) => e.child(v_flex().gap(2).child(label("Your issues")).children(issueRows)))
          .when(mergedRows.length > 0, (e) => e.child(v_flex().gap(2).child(label("Recently merged", t.done)).children(mergedRows)))
          .when(!open.length && !r.merged.length, (e) => e.child(div().px(2).text_size(12).text_color(t.dim).child("No pull requests to show for this repo.")))
          .child(h_flex().gap(24).items_start()
            .child(v_flex().flex_1().min_w(0).gap(4).child(label("Recent commits"))
              .children((i?.commits ?? []).map((c, n) => { const i0 = reg(web(i.web && `${i.web}/commit/${c.h}`), 1); return pickable(i0, h_flex().id(`c-${i0}`).h(24).flex_none().px(10).gap(10).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.dsel = i0; web(i.web && `${i.web}/commit/${c.h}`)(); cx.notify(); }))
                .child(div().w(56).flex_none().text_size(11).text_color(t.accent).child(c.h))
                .child(div().flex_1().min_w(0).truncate().child(c.subject))
                .child(div().flex_none().text_size(11).text_color(t.dim).child(c.an))
                .child(div().w(48).flex_none().text_right().text_size(11).text_color(t.dim).child(ago(new Date(c.ct).toISOString()))); }))
              .when(!(i?.commits?.length), (e) => e.child(div().px(10).text_color(t.dim).child(i ? "No commits yet" : "..."))))
            .child(v_flex().w(280).flex_none().gap(6).child(label(`Commits, last 14 days (${total})`))
              .child(h_flex().h(54).gap(4).items_end().px(2).children(bars.map((n) => div().flex_1().h(n ? Math.max(4, Math.round((n / peak) * 52)) : 2).rounded(2).bg(n ? t.accent : t.border)))))));
    });
    this.acts = acts;
    this.order = acts.map((a, n) => [a.rank, n]).filter(([r]) => r !== null).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, n]) => n);
    if (!this.order.includes(this.dsel)) this.dsel = this.order[0] ?? -1;
    return v_flex().id("dash").flex_1().min_h(0).overflow_y_scrollbar().p(16).gap(14)
      .child(h_flex().gap(14).items_center().px(2).text_size(12).text_color(t.muted)
        .child(div().child(`${mine.length} agent${mine.length === 1 ? "" : "s"} in this tab`))
        .when(count("working") > 0, (e) => e.child(div().text_color(t.working).child(`${count("working")} working`)))
        .when(count("blocked") > 0, (e) => e.child(div().text_color(t.blocked).child(`${count("blocked")} need you`)))
        .when(count("done") > 0, (e) => e.child(div().text_color(t.done).child(`${count("done")} done`))))
      .children(cards)
      .when(!cards.length, (e) => e.child(div().p(8).text_color(t.dim).child(this.prError || (this.repos ? "No git repository in this tab. Press P to pin one." : "Loading..."))));
  }

  // ---- PR detail inside the window (read via `gh pr view` / `gh pr diff`; actions only after an explicit confirm) ----
  ghRun(det, args) {
    return hc(["exec", "sh", "-c", 'cd "$1" || exit 1; shift; exec gh "$@"', "sh", det.top, ...args]);
  }

  openPr(d, top, cx) {
    const hit = CACHE.details.get(`${top}#${d.number}`), diff = CACHE.details.get(`${top}#${d.number}#diff`);
    this.detail = { n: d.number, top, url: d.url, title: d.title, loading: !hit, view: "overview", data: hit ?? null, error: null, rows: diff?.rows ?? [], width: diff?.width ?? 300, diffState: diff ? "ready" : "none", confirm: null, note: null, busy: false };
    cx.notify();
    this.fetchDetail(cx);
    if (!hit) { // last time's copy from disk shows while the fresh one loads
      const det = this.detail;
      cx.spawn(async (cx) => {
        try {
          const text = await readTextFile(cacheFile(top, d.number));
          if (text && this.detail === det && !det.data) { det.data = JSON.parse(text); det.loading = false; cx.notify(); }
        } catch {}
      });
    }
  }

  fetchDetail(cx) {
    const det = this.detail;
    if (!det) return;
    cx.spawn(async (cx) => {
      try {
        const r = await this.ghRun(det, ["pr", "view", String(det.n), "--json", "number,title,body,author,state,isDraft,mergeable,reviewDecision,reviews,comments,statusCheckRollup,files,additions,deletions,headRefName,baseRefName,labels,createdAt,mergedAt,url"]);
        if (this.detail !== det) return;
        if (r.code !== 0) throw new Error((r.stderr || r.stdout || "gh pr view failed").trim().split("\n")[0]);
        det.data = JSON.parse(r.stdout); det.error = null; remember(`${det.top}#${det.n}`, det.data);
        { const json = JSON.stringify(det.data); if (json.length < 100000) hc(["exec", "sh", "-c", 'mkdir -p /tmp/herdr-gitwin-cache && printf %s "$1" > "$2"', "sh", json, cacheFile(det.top, det.n)]).catch(() => {}); }
      } catch (e) { if (this.detail === det) det.error = String(e); }
      if (this.detail === det) { det.loading = false; cx.notify(); }
    });
  }

  loadDiff(cx) {
    const det = this.detail;
    if (!det || det.diffState !== "none") return;
    det.diffState = "loading";
    cx.spawn(async (cx) => {
      try {
        const r = await this.ghRun(det, ["pr", "diff", String(det.n), "--color", "never"]);
        if (this.detail !== det) return;
        if (r.code !== 0) throw new Error((r.stderr || "gh pr diff failed").trim().split("\n")[0]);
        const lines = r.stdout.split("\n"), out = [];
        let old = 0, next = 0, hunk = false;
        for (const line of lines.slice(0, 8000)) {
          if (line.startsWith("diff --git ")) { hunk = false; out.push({ kind: "f", text: (/ b\/(.+)$/.exec(line) ?? [, line])[1] }); continue; }
          const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
          if (m) { hunk = true; old = +m[1]; next = +m[2]; out.push({ kind: "@", text: line }); continue; }
          if (!hunk) { if (line.startsWith("Binary files")) out.push({ kind: "", text: line }); continue; }
          const k = line[0];
          if (k === "-") out.push({ kind: k, number: old++, text: line.slice(1) || " " });
          else if (k === "+") out.push({ kind: k, number: next++, text: line.slice(1) || " " });
          else if (k === " ") { old++; out.push({ kind: k, number: next++, text: line.slice(1) || " " }); }
        }
        det.rows = out; det.width = Math.max(300, ...out.slice(0, 2000).map((x) => x.text.length * 7 + 60)); det.diffState = "ready"; remember(`${det.top}#${det.n}#diff`, { rows: det.rows, width: det.width });
      } catch (e) { if (this.detail === det) { det.diffState = "error"; det.diffError = String(e); } }
      if (this.detail === det) cx.notify();
    });
  }

  askAction(kind, cx) {
    const det = this.detail;
    if (!det || det.busy || !det.data) return;
    det.confirm = { kind, method: "merge" }; det.note = null;
    if (kind === "comment" || kind === "request") { this.dInput.set_value(""); this.dInput.focus(); }
    cx.notify();
  }

  cancelAction(cx) {
    if (!this.detail) return;
    this.detail.confirm = null; this.typing = false; this.dInput.set_value(""); this.handle.focus(); cx.notify();
  }

  runAction(cx) {
    const det = this.detail, c = det?.confirm;
    if (!det || !c || det.busy) return;
    const text = (this.dInput.value() ?? "").trim();
    let args;
    if (c.kind === "approve") args = ["pr", "review", String(det.n), "--approve"];
    else if (c.kind === "comment" && text) args = ["pr", "review", String(det.n), "--comment", "-b", text];
    else if (c.kind === "request" && text) args = ["pr", "review", String(det.n), "--request-changes", "-b", text];
    else if (c.kind === "merge") args = ["pr", "merge", String(det.n), "--" + c.method];
    else return;
    const done = { approve: "Approved", comment: "Comment posted on", request: "Changes requested on", merge: "Merged" }[c.kind];
    det.busy = true; det.confirm = null; this.typing = false; this.dInput.set_value(""); this.handle.focus();
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await this.ghRun(det, args);
        if (r.code !== 0) throw new Error((r.stderr || r.stdout || "gh failed").trim().split("\n")[0]);
        det.note = { ok: true, text: `${done} #${det.n}` };
        this.prAt = 0; this.loadPrs(cx, true); this.fetchDetail(cx);
      } catch (e) { det.note = { ok: false, text: String(e).replace(/^Error: /, "") }; }
      det.busy = false; cx.notify();
    });
  }

  detailKey(e, cx) {
    const det = this.detail, k = e.key;
    if (k === "escape" && det.confirm) { this.cancelAction(cx); return true; } // only reaches us from the comment box
    if (this.typing) return false; // the comment box has the keys
    if (k === "backspace" || k === "left" || k === "h") {
      if (det.confirm) this.cancelAction(cx); else { this.detail = null; this.handle.focus(); cx.notify(); }
      return true;
    }
    if (det.confirm) {
      if (det.confirm.kind === "merge" && ["1", "2", "3"].includes(k)) { det.confirm.method = ["merge", "squash", "rebase"][+k - 1]; cx.notify(); return true; }
      if (k === "enter" && det.confirm.kind !== "comment" && det.confirm.kind !== "request") { this.runAction(cx); return true; }
      return true;
    }
    if (k === "d") { det.view = det.view === "diff" ? "overview" : "diff"; if (det.view === "diff") this.loadDiff(cx); cx.notify(); return true; }
    if (k === "b") { hc(["exec", "xdg-open", det.url]).catch(() => {}); return true; }
    if (k === "a") { this.askAction("approve", cx); return true; }
    if (k === "c") { this.askAction("comment", cx); return true; }
    if (k === "x") { this.askAction("request", cx); return true; }
    if (k === "m") { this.askAction("merge", cx); return true; }
    return true;
  }

  detailBody(t) {
    const det = this.detail, d = det.data;
    const btn = (id, text, fn, color, hint) => div().id(id).px(10).py(4).rounded(6).border_1().border_color(color ?? t.border).cursor_pointer().text_size(12).text_color(color ?? t.foreground).hover((s) => s.bg(t.hover)).on_click((_e, cx) => fn(cx)).child(hint ? `${text} (${hint})` : text);
    const stateColor = d?.state === "MERGED" ? t.accent : d?.state === "CLOSED" ? t.blocked : t.done;
    const rv = { APPROVED: ["approved", t.done], CHANGES_REQUESTED: ["changes requested", t.blocked], REVIEW_REQUIRED: ["review needed", t.muted] }[d?.reviewDecision] ?? null;
    const section = (title, color) => div().px(2).pt(6).text_size(11).font_semibold().text_color(color ?? t.muted).child(title);
    const bar = h_flex().h(44).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
      .child(btn("pd-back", "Back", (cx) => { this.detail = null; cx.notify(); }, null, "Backspace"))
      .child(div().flex_1().min_w(0).truncate().font_semibold().child(`#${det.n}  ${det.title}`))
      .child(btn("pd-view", det.view === "diff" ? "Overview" : "Diff", (cx) => { det.view = det.view === "diff" ? "overview" : "diff"; if (det.view === "diff") this.loadDiff(cx); cx.notify(); }, null, "D"))
      .child(btn("pd-approve", "Approve", (cx) => this.askAction("approve", cx), t.done, "A"))
      .child(btn("pd-comment", "Comment", (cx) => this.askAction("comment", cx), null, "C"))
      .child(btn("pd-request", "Request changes", (cx) => this.askAction("request", cx), t.blocked, "X"))
      .child(btn("pd-merge", "Merge", (cx) => this.askAction("merge", cx), t.accent, "M"))
      .child(btn("pd-web", "Browser", () => hc(["exec", "xdg-open", det.url]).catch(() => {}), null, "B"));
    const c = det.confirm;
    const confirm = c && h_flex().flex_none().px(14).py(8).gap(10).items_center().border_b(1).border_color(t.border).bg(t.raised)
      .child(div().text_size(12).text_color(t.foreground).child(({ approve: `Approve #${det.n}?`, comment: `Comment on #${det.n}:`, request: `Request changes on #${det.n}:`, merge: `Merge #${det.n} with a ${c.method} commit?` })[c.kind]))
      .when(c.kind === "comment" || c.kind === "request", (e) => e.child(div().id("pd-input").flex_1().min_w(0).h(30).px(10).flex().items_center().rounded(8).border_1().border_color(this.typing ? t.accent : t.border).cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(this.dInput).h_full().text_size(12).text_color(t.foreground))))
      .when(c.kind === "merge", (e) => e.child(div().text_size(11).text_color(t.dim).child("1 merge | 2 squash | 3 rebase")).child(div().flex_1()))
      .when(c.kind === "approve", (e) => e.child(div().flex_1()))
      .child(btn("pd-go", "Confirm", (cx) => this.runAction(cx), t.accent, "Enter"))
      .child(btn("pd-cancel", "Cancel", (cx) => this.cancelAction(cx), null, "Backspace"));
    const note = det.note && div().flex_none().px(14).py(6).text_size(12).text_color(det.note.ok ? t.done : t.blocked).child(det.note.text);
    let body;
    if (det.view === "diff") {
      body = det.diffState === "ready"
        ? div().flex_1().min_h(0).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(11)
          .child(div().id("pr-diff-x").size_full().overflow_x_scrollbar().child(div().w_full().min_w(det.width).h_full().child(v_virtual_list("pr-diff", det.rows.length, 20, (i) => String(i), (range) => det.rows.slice(range.start, range.end).map((row) => this.diffRow(row, t))).size_full())))
          .child(Scrollbar.vertical("pr-diff").viewport_from_layout().absolute().inset_0())
        : div().p(16).text_color(t.dim).child(det.diffState === "error" ? det.diffError : "Loading diff...");
    } else if (!d) {
      body = div().p(16).text_color(t.dim).child(det.error ?? "Loading...");
    } else {
      const checks = (d.statusCheckRollup ?? []).map((x) => ({ name: x.name || x.context, st: x.conclusion || x.status || x.state || "" }));
      const cc = (st) => ["SUCCESS", "NEUTRAL", "SKIPPED"].includes(st) ? t.done : ["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED"].includes(st) ? t.blocked : t.working;
      const byAuthor = new Map();
      for (const r of d.reviews ?? []) if (r.state !== "COMMENTED" || !byAuthor.has(r.author?.login)) byAuthor.set(r.author?.login, r.state);
      body = v_flex().id("pr-detail").flex_1().min_h(0).overflow_y_scrollbar().p(16).gap(8)
        .child(h_flex().gap(8).items_center().flex_wrap()
          .child(div().px(8).py(2).rounded(5).border_1().border_color(stateColor).text_size(11).text_color(stateColor).child(d.isDraft ? "DRAFT" : d.state))
          .when(Boolean(rv), (e) => e.child(div().px(8).py(2).rounded(5).border_1().border_color(rv[1]).text_size(11).text_color(rv[1]).child(rv[0])))
          .when(d.mergeable === "CONFLICTING", (e) => e.child(div().px(8).py(2).rounded(5).border_1().border_color(t.blocked).text_size(11).text_color(t.blocked).child("merge conflicts")))
          .children((d.labels ?? []).map((l) => div().px(8).py(2).rounded(5).border_1().border_color(t.border).text_size(11).text_color(t.muted).child(l.name)))
          .child(div().text_size(12).text_color(t.muted).child(`${d.author?.login ?? ""} | ${d.headRefName} into ${d.baseRefName} | +${d.additions} -${d.deletions} in ${(d.files ?? []).length} files | opened ${ago(d.createdAt)} ago`)))
        .when(checks.length > 0, (e) => e.child(section(`Checks (${checks.length})`)).child(v_flex().gap(2).children(checks.slice(0, 14).map((x, i) => h_flex().id(`chk-${i}`).h(22).gap(8).items_center().px(4)
          .child(div().w(8).h(8).rounded(4).flex_none().bg(cc(x.st))).child(div().flex_1().min_w(0).truncate().child(x.name)).child(div().text_size(11).text_color(t.dim).child(x.st.toLowerCase().replace(/_/g, " ")))))))
        .when(byAuthor.size > 0, (e) => e.child(section("Reviews")).child(v_flex().gap(2).children([...byAuthor].map(([who, st], i) => h_flex().id(`rv-${i}`).h(22).gap(8).px(4).child(div().w(120).truncate().child(who ?? "")).child(div().text_color(st === "APPROVED" ? t.done : st === "CHANGES_REQUESTED" ? t.blocked : t.muted).child(st.toLowerCase().replace(/_/g, " ")))))))
        .child(section("Description"))
        .child(d.body?.trim() ? TextView.markdown("pr-body", d.body.slice(0, 20000)) : div().text_color(t.dim).child("No description."))
        .when((d.comments ?? []).length > 0, (e) => e.child(section(`Comments (${d.comments.length})`)).children(d.comments.slice(-5).map((cm, i) => v_flex().id(`cm-${i}`).gap(2).py(4).child(div().text_size(11).text_color(t.dim).child(`${cm.author?.login ?? ""} | ${ago(cm.createdAt)} ago`)).child(div().child((cm.body ?? "").slice(0, 700))))))
        .when((d.files ?? []).length > 0, (e) => e.child(section(`Files (${d.files.length})`)).child(v_flex().gap(1).children(d.files.slice(0, 40).map((f, i) => h_flex().id(`fl-${i}`).h(22).gap(8).px(4).items_center().child(div().flex_1().min_w(0).truncate().text_size(12).child(f.path)).child(div().text_size(11).text_color(t.ansi2).child(`+${f.additions}`)).child(div().text_size(11).text_color(t.ansi1).child(`-${f.deletions}`))))));
    }
    return v_flex().flex_1().min_h(0).child(bar).when(Boolean(c), (e) => e.child(confirm)).when(Boolean(note), (e) => e.child(note)).child(body);
  }

  prBody(t) {
    const list = this.prList();
    const col = { pass: t.done, fail: t.blocked, wait: t.working, none: t.dim };
    const mark = { pass: "✓", fail: "✗", wait: "…", none: "" };
    const review = (d) => d.reviewDecision === "APPROVED" ? ["approved", t.done] : d.reviewDecision === "CHANGES_REQUESTED" ? ["changes requested", t.blocked] : d.reviewDecision === "REVIEW_REQUIRED" ? ["review needed", t.muted] : ["", t.muted];
    const multi = (this.repos?.length ?? 0) > 1;
    return v_flex().id("pr-list").flex_1().min_h(0).overflow_y_scrollbar().p(6)
      .children(list.map((d, i) => {
        const [rv, rc] = review(d);
        return h_flex().id(`pr-${i}`).h(34).flex_none().px(10).gap(10).items_center().rounded(7).cursor_pointer().when(i === this.sel, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.openPr(d, d.top, cx))
          .child(div().w(46).flex_none().text_color(t.dim).child(`#${d.number}`))
          .when(this.tab === "open", (e) => e.child(div().w(14).flex_none().text_color(col[d.checks]).child(mark[d.checks])))
          .when(this.tab === "merged", (e) => e.child(div().w(14).flex_none().text_color(t.done).child("✓")))
          .child(div().flex_1().min_w(0).truncate().child(d.title))
          .when(multi, (e) => e.child(div().flex_none().text_size(11).text_color(t.dim).child(d.repo)))
          .child(div().max_w(180).truncate().flex_none().text_size(11).text_color(t.dim).child(d.headRefName))
          .when(this.tab === "open" && Boolean(rv), (e) => e.child(div().flex_none().text_size(11).text_color(rc).child(rv)))
          .child(div().w(60).flex_none().text_right().text_size(11).text_color(t.dim).child(this.tab === "merged" ? `merged ${ago(d.mergedAt)}` : ago(d.createdAt)));
      }))
      .when(!list.length, (e) => e.child(div().p(8).text_color(t.dim).child(this.prError || (this.repos ? (this.tab === "open" ? "No open PRs (drafts hidden)" : `Nothing merged in the last ${MERGED_DAYS} days`) : "Loading PRs…"))));
  }

  changesBody(t, enabled) {
    return v_flex().flex_1().min_h(0)
      .child(v_flex().id("changes-list").flex_none().h(Math.min(200, Math.max(44, this.files.length * 28 + 12))).overflow_y_scrollbar().p(6).border_b(1).border_color(t.border).children(this.files.map((f) => {
        const parts = f.path.split("/"), name = parts.pop();
        return h_flex().id(`change-${f.path}`).h(28).flex_none().px(8).gap(8).items_center().rounded(7).cursor_pointer().when(this.open === f.path, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.pick(f.path, cx))
          .child(div().w(14).text_size(11).text_color(f.status === "A" ? t.ansi2 : f.status === "D" ? t.ansi1 : f.status === "U" ? t.ansi1 : t.blocked).child(f.status))
          .child(h_flex().flex_1().min_w(0).child(div().text_color(t.dim).truncate().child(parts.length ? parts.join("/") + "/" : "")).child(div().max_w(260).min_w(0).truncate().child(name)))
          .when(f.add > 0, (e) => e.child(div().text_size(11).text_color(t.ansi2).child(`+${f.add}`))).when(f.del > 0, (e) => e.child(div().text_size(11).text_color(t.ansi1).child(`−${f.del}`)));
      })).when(!this.files.length, (e) => e.child(div().p(8).text_color(t.dim).child(this.error || (this.loading ? "Loading changes…" : this.root ? "No uncommitted changes" : "No folder")))))
      .when(this.limited, el => el.child(div().px(12).py(4).text_size(11).text_color(t.dim).child("Showing the first 1,000 changed files")))
      .child(div().flex_1().min_h(0).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(11)
        .child(div().id("changes-diff-x").size_full().overflow_x_scrollbar()
          .child(div().w_full().min_w(this.diffWidth).h_full().child(v_virtual_list("changes-diff", this.rows.length, 20, (i) => String(i),
            (range) => this.rows.slice(range.start, range.end).map((row) => this.diffRow(row, t))).size_full())))
        .child(Scrollbar.vertical("changes-diff").viewport_from_layout().absolute().inset_0())
        .when(!this.open && this.files.length > 0, (e) => e.child(div().absolute().top(6).px(12).text_color(t.dim).child("Select a file to view its changes"))))
      .when(Boolean(this.note), (e) => e.child(div().px(10).pb(8).text_size(11).text_color(t.ansi1).child(this.note)))
      .child(h_flex().flex_none().p(10).gap(8).border_t(1).border_color(t.border)
        .child(div().id("commit-message").flex_1().min_w(0).h(32).px(10).flex().items_center().rounded(8).border_1().border_color(this.typing ? t.accent : t.border).cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(this.input).h_full().text_size(12).text_color(t.foreground)))
        .child(div().id("commit").h(32).px(14).flex().items_center().rounded(8).bg(enabled ? t.solid : t.raised).text_color(enabled ? t.solid_foreground : t.dim).text_size(12).when(enabled, (e) => e.cursor_pointer()).on_click((_e, cx) => this.commit(cx)).child(this.busy ? "Committing…" : "Commit")));
  }
}
