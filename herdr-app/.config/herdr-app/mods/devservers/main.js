// Dev servers: what is listening on this computer (grouped by project) plus bookmarked start commands.
// Bookmarks: Enter / Go starts one in the background (a hidden herdr-core terminal running your interactive shell, so PATH
// and version managers apply). Output shows the live output in a peek (with keep-as-tab); Stop ends it.
// Running rows: Enter opens http://localhost:<port>, r restarts, s stops, b bookmarks it.
// Keys: Up/Down or j/k move, n new bookmark, o output, d remove bookmark, Esc closes. Styling mirrors file-find / changes-float.
const DEFAULT_CMD = "npm run dev";

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { exec, hc, run, theme, props, closeOverlay, focused, terminals, shared, setShared, notify, home, pickFolder, spaces } from "herdr";

const REFRESH_MS = 4000;
const SHARED_KEY = "devservers.bookmarks";
const MARK = "devservers:";
const tilde = (p) => (p ?? "").replace(/^\/home\/[^/]+/, "~");
const base = (p) => (p ?? "").replace(/\/$/, "").split("/").pop();

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

// Command without the project's own path and node_modules/.bin, so "astro dev" reads as "astro dev".
const short = (l) => {
  let c = l.cmd || l.comm || "";
  for (const d of [l.root, l.cwd]) if (d && d !== "/") c = c.split(d + "/").join("");
  return c.replace(/^node (\S*\/)?(node_modules\/\.bin\/)?/, "").replace(/node_modules\/\.bin\//g, "").trim();
};
const age = (s) => (s >= 86400 ? `${Math.floor(s / 86400)}d` : s >= 3600 ? `${Math.floor(s / 3600)}h` : s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`);
const sleep = (ms) => exec("sleep", [String(ms / 1000)]);

export default class DevServers extends View {
  init(_props, cx) {
    this.listeners = [];
    this.loaded = false;
    this.at = 0;
    this.form = null; // { fields: [InputState x3], at }
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.refresh(cx);
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
  }

  bookmarks() {
    const v = shared(SHARED_KEY);
    return Array.isArray(v) ? v : [];
  }

  // Live hidden terminals started by Go, labelled devservers=<bookmark id>.
  terminalFor(id) {
    return terminals().find((t) => (t.state ?? "live") === "live" && (t.labels?.devservers === id || JSON.stringify(t.argv ?? []).includes(MARK + id)));
  }

  started() {
    return new Set(this.bookmarks().filter((b) => this.terminalFor(b.id)).map((b) => b.id));
  }

  refresh(cx) {
    if (this.busy) return Promise.resolve();
    this.busy = true;
    return (async () => {
      try {
        const r = await exec("sh", ["-c", PROBE]);
        this.listeners = parse(r.stdout);
        this.error = null;
      } catch (e) { this.error = String(e.message ?? e); }
      this.loaded = true; this.busy = false; cx.notify();
    })();
  }

  // Flat, selectable rows: bookmarks first, then other listeners grouped by project.
  items() {
    const bms = this.bookmarks(), up = this.started(), items = [];
    const owned = new Set();
    for (const b of bms) {
      const ls = this.listeners.filter((l) => l.bm === b.id);
      ls.forEach((l) => owned.add(l));
      items.push({ kind: "bm", b, ls, state: ls.length ? "running" : up.has(b.id) ? "starting" : "stopped" });
    }
    const rest = this.listeners.filter((l) => !owned.has(l));
    const groups = new Map();
    for (const l of rest) {
      const home = /^\/home\/[^/]+\/?$/.test(l.cwd ?? "");
      const key = l.root || (!l.cwd || l.cwd === "/" || home ? "" : l.cwd);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    }
    const keys = [...groups.keys()].sort((a, b) => (a === "") - (b === "") || a.localeCompare(b));
    const rows = [];
    for (const k of keys) groups.get(k).forEach((l, i) => rows.push({ kind: "ls", l, group: k, first: i === 0 }));
    return { bms: items, rows };
  }

  flat() {
    const { bms, rows } = this.items();
    return [...bms, ...rows];
  }

  // Actions
  open(l) { exec("xdg-open", [`http://localhost:${l.port}`]).catch(() => {}); }

  async launch(folder, cmd, name, id) {
    const args = ["run", "--bg", "--json", "--no-parent", "--name", name, "--cwd", folder];
    if (id) args.push("--label", "devservers=" + id);
    // The marker is also an argument of the shell itself, and `; exit` stops sh from exec-ing into it: the probe finds a
    // bookmark's servers by walking their parents for it.
    args.push("--", "sh", "-c", '"${SHELL:-zsh}" -ic "$1" "$0"; exit $?', MARK + (id ?? "adhoc"), cmd);
    try {
      const r = await hc(args);
      if (r.code !== 0) notify({ title: "Couldn't start " + name, body: (r.stderr || r.stdout).trim().split("\n")[0], level: "error" });
    } catch (e) { notify({ title: "Couldn't start " + name, body: String(e.message ?? e), level: "error" }); }
  }

  start(b) { return this.launch(b.folder, b.cmd, "dev-" + b.id, b.id); }

  startRaw(folder, cmd) { return this.launch(folder, cmd, "dev-" + Math.random().toString(36).slice(2, 8), null); }

  output(b) {
    const t = this.terminalFor(b.id);
    if (t) run("terminal.peek", { terminal: t.address });
    else notify({ title: b.name + " isn't running", level: "error" });
  }

  // Only signals the pid while it still runs the command the scan saw (pids get reused).
  async kill(l) {
    const r = await exec("sh", ["-c", 'c=$(tr "\\0" " " </proc/$1/cmdline 2>/dev/null); [ "${c% }" = "$2" ] && kill "$1"', "sh", String(l.pid), l.cmd]).catch(() => null);
    if (r && r.code !== 0) notify({ title: "Not stopped", body: `:${l.port} changed since the last scan. Refresh and try again.`, level: "error" });
  }

  async stopBookmark(b, ls) {
    const t = this.terminalFor(b.id);
    if (t) await hc(["kill", t.address]).catch(() => {});
    else for (const l of ls) await this.kill(l);
  }

  restartBookmark(b, cx) {
    cx.spawn(async (cx) => {
      const ls = this.listeners.filter((l) => l.bm === b.id);
      await this.stopBookmark(b, ls);
      for (let i = 0; i < 12; i++) {
        await sleep(300);
        await this.refresh(cx);
        if (!this.listeners.some((l) => l.bm === b.id) && !this.terminalFor(b.id)) break;
      }
      await this.start(b);
      await sleep(800); await this.refresh(cx);
    });
  }

  restartListener(l, cx) {
    if (this.askRs !== l.pid) {
      this.askRs = l.pid;
      return notify({ title: `Restart :${l.port}?`, body: "This re-runs its command line without the original quoting, which can differ from what you started. Bookmark it for a reliable restart. Press r (or Restart) again to confirm.", level: "warning" });
    }
    this.askRs = null;
    const folder = l.cwd || l.root, cmd = l.cmd;
    if (!folder || !cmd) return notify({ title: "Can't restart", body: "No working folder or command for this process", level: "error" });
    cx.spawn(async (cx) => {
      await this.kill(l);
      for (let i = 0; i < 12; i++) { await sleep(300); await this.refresh(cx); if (!this.listeners.some((x) => x.pid === l.pid)) break; }
      await this.startRaw(folder, cmd);
      await sleep(800); await this.refresh(cx);
    });
  }

  // Bookmarks
  openForm(preset, cx) {
    const mk = (placeholder, value) => InputState.new({ placeholder, value: value ?? "" });
    const fields = [mk("Name (storybook)", preset?.name), mk("Command (npm run dev)", preset?.cmd ?? DEFAULT_CMD), mk("Folder", preset?.folder ?? focused()?.cwd ?? "")];
    fields.forEach((f, i) => f.on("submit", (_e, cx) => (i < 2 ? this.focusField(i + 1) : this.saveForm(cx))));
    this.form = { fields, at: 0 };
    cx.timer.after(50, () => this.focusField(0));
    cx.notify();
  }

  focusField(i) { this.form.at = i; this.form.fields[i].focus(); }

  async saveForm(cx) {
    const [name, cmd, folder] = this.form.fields.map((f) => f.value().trim());
    if (!name || !cmd || !folder) return notify({ title: "Bookmark needs a name, command and folder", level: "error" });
    const id = Math.random().toString(36).slice(2, 8);
    setShared(SHARED_KEY, [...this.bookmarks(), { id, name, cmd, folder: folder.replace(/^~(?=\/|$)/, home()) }]);
    this.closeForm(cx);
  }

  // Sets the form's folder (and the name, when empty) from a picked or suggested folder.
  setFolder(dir, cx) {
    const [name, , folder] = this.form.fields;
    folder.set_value(dir);
    if (!name.value().trim()) name.set_value(base(dir));
    cx.notify();
  }

  browse(cx) {
    cx.spawn(async (cx) => {
      const dir = await pickFolder({ prompt: "Project folder" });
      if (dir && this.form) this.setFolder(dir, cx);
      cx.notify();
    });
  }

  // Folders of the open spaces, to pick from without typing.
  suggestions() {
    return [...new Set(spaces().map((sp) => sp.folder).filter(Boolean))].slice(0, 8);
  }

  closeForm(cx) { this.form = null; this.handle.focus(); cx.notify(); }

  bookmarkListener(l, cx) {
    this.openForm({ name: base(l.root || l.cwd), cmd: DEFAULT_CMD, folder: l.root || l.cwd }, cx);
  }

  removeBookmark(b) { setShared(SHARED_KEY, this.bookmarks().filter((x) => x.id !== b.id)); }

  primary(it, cx) {
    if (!it) return;
    if (it.kind === "bm") { if (it.state === "stopped") this.start(it.b); else if (it.ls[0]) this.open(it.ls[0]); }
    else this.open(it.l);
    cx.notify();
  }

  key(e, cx) {
    const k = e.key;
    if (this.form) {
      if (k === "escape") { this.closeForm(cx); cx.stop_propagation(); }
      else if (k === "tab") { this.focusField((this.form.at + 1) % 3); cx.stop_propagation(); }
      return;
    }
    const items = this.flat(), it = items[this.at];
    if (k === "escape") return closeOverlay(props().overlay);
    if (k === "down" || k === "j") this.at = Math.min(items.length - 1, this.at + 1);
    else if (k === "up" || k === "k") this.at = Math.max(0, this.at - 1);
    else if (k === "enter") this.primary(it, cx);
    else if (k === "n") this.openForm(null, cx);
    else if (k === "o" && it?.kind === "bm") this.output(it.b);
    else if (k === "r" && it) it.kind === "bm" ? this.restartBookmark(it.b, cx) : this.restartListener(it.l, cx);
    else if (k === "s" && it) it.kind === "bm" ? this.stopBookmark(it.b, it.ls) : this.kill(it.l);
    else if (k === "b" && it?.kind === "ls") this.bookmarkListener(it.l, cx);
    else if (k === "d" && it?.kind === "bm") this.removeBookmark(it.b);
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  render(cx) {
    const t = theme();
    const { bms, rows } = this.items(), items = [...bms, ...rows];
    this.at = Math.max(0, Math.min(this.at, items.length - 1));
    const sel = items[this.at];

    // Key chip: a little keycap, readable on the header's dark strip.
    const chip = (text) => div().px(6).h(18).min_w(18).flex().items_center().justify_center().flex_none().rounded(5).border_1().border_color(t.input ?? t.border).bg(t.raised).text_size(11).font_medium().text_color(t.muted).child(text);
    const hints = (list) => h_flex().gap(14).items_center().flex_none().children(list.map(([key, text]) => h_flex().gap(6).items_center().child(chip(key)).child(div().text_size(12).text_color(t.dim).child(text))));
    const act = (id, text, fn, color) => div().id(id).px(7).h(22).flex().items_center().flex_none().rounded(6).cursor_pointer().text_size(11).text_color(color ?? t.muted)
      .hover((s) => s.bg(t.raised)).on_click((_e, cx) => { fn(cx); cx.stop_propagation(); cx.notify(); }).child(text);
    const dot = (color) => div().size(7).flex_none().rounded(4).bg(color);
    const row = (id, i, kids) => h_flex().id(id).h(28).px(10).gap(10).items_center().flex_none().rounded(7)
      .bg(i === this.at ? t.selected : "#00000000").hover((s) => s.bg(i === this.at ? t.selected : t.hover)).on_click(() => { this.at = i; cx.notify(); }).children(kids);
    const label = (text, sub) => h_flex().h(26).px(10).mt(8).gap(10).items_center().flex_none()
      .child(div().text_size(12).font_semibold().text_color(t.muted).child(String(text).toUpperCase()))
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(sub ?? ""));

    const nodes = [];
    nodes.push(label("Bookmarks", bms.length ? "" : "None yet. Press n, or b on a running server."));
    bms.forEach((it, i) => {
      const b = it.b, color = it.state === "running" ? t.ansi2 : it.state === "starting" ? t.blocked : t.dim;
      nodes.push(row(`bm-${b.id}`, i, [
        dot(color),
        div().w(170).flex_none().truncate().text_color(i === this.at ? t.foreground : t.muted).child(b.name),
        div().flex_none().w(120).truncate().text_size(12).text_color(t.accent).child(it.ls.map((l) => `:${l.port}`).join(" ") || (it.state === "starting" ? "starting…" : "")),
        h_flex().flex_1().min_w(0).gap(10).overflow_hidden().child(div().min_w(0).truncate().text_color(t.muted).child(b.cmd)).child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(tilde(b.folder))),
        ...(it.state === "stopped"
          ? [act(`go-${b.id}`, "Go", () => this.start(b), t.accent)]
          : [act(`open-${b.id}`, "Open", () => it.ls[0] && this.open(it.ls[0])), act(`out-${b.id}`, "Output", () => this.output(b)), act(`rs-${b.id}`, "Restart", (cx) => this.restartBookmark(b, cx)), act(`st-${b.id}`, "Stop", () => this.stopBookmark(b, it.ls))]),
        act(`del-${b.id}`, "Remove", () => this.removeBookmark(b)),
      ]));
    });
    rows.forEach((it, j) => {
      const i = bms.length + j, l = it.l;
      if (it.first) nodes.push(label(it.group ? base(it.group) : "Other", it.group ? tilde(it.group) : "no project folder"));
      nodes.push(row(`ls-${l.pid}-${l.port}`, i, [
        dot(t.ansi2),
        div().w(64).flex_none().text_size(12).text_color(t.accent).child(`:${l.port}`),
        div().flex_1().min_w(0).truncate().text_color(i === this.at ? t.foreground : t.muted).child(short(l)),
        div().flex_none().w(48).text_right().text_size(11).text_color(t.dim).child(age(l.up)),
        act(`o-${l.pid}-${l.port}`, "Open", () => this.open(l)),
        act(`r-${l.pid}-${l.port}`, "Restart", (cx) => this.restartListener(l, cx)),
        act(`s-${l.pid}-${l.port}`, "Stop", () => this.kill(l)),
        act(`b-${l.pid}-${l.port}`, "Bookmark", (cx) => this.bookmarkListener(l, cx)),
      ]));
    });
    if (this.loaded && !rows.length) nodes.push(div().px(10).py(8).text_size(12).text_color(t.dim).child(this.error ?? "Nothing else is listening."));
    if (!this.loaded) nodes.push(div().px(10).py(8).text_size(12).text_color(t.dim).child("Looking…"));

    const hint = this.form ? [["Enter", "next"], ["Tab", "switch"], ["Esc", "cancel"]]
      : sel?.kind === "bm" ? [["Enter", "go / open"], ["o", "output"], ["r", "restart"], ["s", "stop"], ["d", "remove"], ["n", "new"], ["Esc", "close"]]
      : [["Enter", "open"], ["r", "restart"], ["s", "stop"], ["b", "bookmark"], ["n", "new"], ["Esc", "close"]];

    return v_flex().id("devservers").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().min_h(0).rounded(10).overflow_hidden().border_1().border_color(t.border).bg(t.background).text_size(13)
      .child(
        h_flex().h(30).flex_none().pr(10).items_center().border_b(1).border_color(t.border)
          .child(div().id("ds-title").h_full().pl(12).pr(6).flex().items_center().text_size(12).font_medium().text_color(t.accent).child("Servers"))
          .child(div().id("ds-new").h_full().pl(12).pr(6).flex().items_center().cursor_pointer().text_size(12).text_color(t.dim).hover((x) => x.text_color(t.muted))
            .on_click((_e, cx) => this.openForm(null, cx)).child(h_flex().gap(6).items_center().child(chip("n")).child("New bookmark")))
          .child(div().flex_1().min_w(0).truncate().px(10).text_size(12).text_color(t.dim).child(`${this.listeners.length} listening · ${bms.length} bookmarked`))
          .child(hints(hint)),
      )
      .child(
        v_flex().flex_1().min_h(0).p(14).gap(10)
          .when(Boolean(this.form), (e) => e.child(
            h_flex().gap(8).items_center().flex_none()
              .child(Input.new(this.form.fields[0]).w(180).h(36).px(10).rounded(9).border_1().border_color(this.form.at === 0 ? t.accent : t.border).bg(t.raised).text_size(12.8).text_color(t.foreground))
              .child(Input.new(this.form.fields[1]).flex_1().min_w(0).h(36).px(10).rounded(9).border_1().border_color(this.form.at === 1 ? t.accent : t.border).bg(t.raised).text_size(12.8).text_color(t.foreground))
              .child(Input.new(this.form.fields[2]).w(280).h(36).px(10).rounded(9).border_1().border_color(this.form.at === 2 ? t.accent : t.border).bg(t.raised).text_size(12.8).text_color(t.foreground))))
          .when(Boolean(this.form), (e) => e.child(
            h_flex().gap(6).items_center().flex_none().flex_wrap()
              .child(div().text_size(12).text_color(t.dim).mr(4).child("Folder"))
              .child(act("pick-browse", "Browse…", (cx) => this.browse(cx), t.accent))
              .children(this.suggestions().map((d, n) => act(`pick-${n}`, tilde(d), (cx) => this.setFolder(d, cx))))))
          .child(v_flex().flex_1().min_h(0).gap(1).overflow_y_scrollbar().children(nodes)),
      );
  }
}
