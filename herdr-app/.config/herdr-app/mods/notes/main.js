// Notes: one notes/notes.md per project (nearest folder up with a CLAUDE.md), to-dos and ideas in one checklist.
// Opens on the focused pane's project; Ctrl+R switches to every notes file under ~/workspace.
// Opens in list mode (vim keys): J/K move, Space/X tick, Enter/L expand, E edit, N new form, I quick-add, D delete (twice),
// Tab filter, R scope, O open file, gg/G ends. In the quick-add input: Enter adds, Esc/Down/Tab back to the list.
// Ctrl+J/K/T/E/N/D/L/R/O work from both. Form: Tab next field, Ctrl+Enter save, Ctrl+T task/note, Esc cancel.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea, TextView } from "gpui-base";
import { exec, focused, run, theme, props, closeOverlay, readTextFile, writeTextFile, home } from "herdr";

// ---- notes/notes.md format ----
// One idea or to-do per line, optional two-space meta line under it ("added 2026-11-01 · done 2026-11-02"); other lines untouched.
const ITEM = /^- (?:\[( |x|X)\] )?(.*)$/;
const META = /^ {2}(?:added|done) /;
const HEADER = "# Notes\n\n";

function parse(text) {
  const lines = (text ?? "").split("\n");
  const items = [];
  const seen = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = ITEM.exec(lines[i]);
    if (!m) continue;
    const it = { line: i, meta: -1, task: m[1] !== undefined, done: m[1] === "x" || m[1] === "X", text: m[2], added: null, doneOn: null };
    const next = lines[i + 1];
    if (next !== undefined && META.test(next)) {
      it.meta = i + 1;
      for (const part of next.trim().split(" · ")) {
        const [k, v] = part.split(" ");
        if (k === "added") it.added = v ?? null;
        if (k === "done") it.doneOn = v ?? null;
      }
    }
    let j = it.meta >= 0 ? i + 2 : i + 1;
    const body = [];
    for (;;) {
      if (lines[j] !== undefined && lines[j].startsWith("  ")) { body.push(lines[j].slice(2)); j++; continue; }
      let k = j;
      while (lines[k] !== undefined && lines[k].trim() === "") k++;
      if (k > j && lines[k] !== undefined && lines[k].startsWith("  ")) { while (j < k) { body.push(""); j++; } continue; }
      break;
    }
    it.span = j - i; // head + meta + body lines
    it.body = body.join("\n").replace(/\s+$/, "");
    const base = `${it.text}|${it.added ?? ""}`;
    it.nth = seen.get(base) ?? 0; // identical text and date: told apart by order
    seen.set(base, it.nth + 1);
    it.key = `${base}|${it.nth}`;
    items.push(it);
  }
  return { lines, items };
}

const metaText = (it) => [it.added && `added ${it.added}`, it.doneOn && `done ${it.doneOn}`].filter(Boolean).join(" · ");

function rewrite(parsed, it) {
  const head = it.task ? `- [${it.done ? "x" : " "}] ${it.text}` : `- ${it.text}`;
  const meta = metaText(it);
  const out = meta ? [head, "  " + meta] : [head];
  if (it.body) for (const l of it.body.split("\n")) out.push(l ? "  " + l : "");
  parsed.lines.splice(it.line, it.span, ...out);
}

const join = (lines) => lines.join("\n").replace(/\n*$/, "\n");
const find = (parsed, key) => parsed.items.find((i) => i.key === key);

const bodyLines = (body) => (body ? body.replace(/\s+$/, "").split("\n").map((l) => (l ? "  " + l : "")).join("\n") + "\n" : "");
function add(text, entry, today) {
  const base = text && text.trim() ? text.replace(/\n*$/, "\n") : HEADER;
  const head = entry.task ? `- [ ] ${entry.text}` : `- ${entry.text}`;
  return `${base}${head}\n  added ${today}\n${bodyLines(entry.body)}`;
}

function toggle(text, key, today) {
  const p = parse(text);
  const it = find(p, key);
  if (!it || !it.task) return null;
  it.done = !it.done;
  it.doneOn = it.done ? today : null;
  rewrite(p, it);
  return join(p.lines);
}

function edit(text, key, next, body, task) {
  const p = parse(text);
  const it = find(p, key);
  if (!it) return null;
  it.text = next;
  if (body !== undefined) it.body = body.replace(/\s+$/, "");
  if (task !== undefined) { it.task = task; if (!task) { it.done = false; it.doneOn = null; } }
  rewrite(p, it);
  return join(p.lines);
}

function remove(text, key) {
  const p = parse(text);
  const it = find(p, key);
  if (!it) return null;
  p.lines.splice(it.line, it.span);
  return join(p.lines);
}

const tagsOf = (s) => [...s.matchAll(/(?:^|\s)#([\w-]+)/g)].map((m) => m[1]);
const stripTags = (s) => s.replace(/(^|\s)#[\w-]+/g, " ").replace(/\s+/g, " ").trim() || s;
// ---- view ----

const EDITOR = ["vim"];
const FILTERS = [["open", "Open"], ["done", "Done"], ["all", "All"]];
const ROOT_SH = 'd="$1"; while [ -n "$d" ] && [ "$d" != / ]; do [ -f "$d/CLAUDE.md" ] && { printf %s "$d"; exit 0; }; d=$(dirname "$d"); done; git -C "$1" rev-parse --show-toplevel 2>/dev/null';
const FILE = (dir) => `${dir}/notes/notes.md`;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const age = (s) => {
  if (!s) return "";
  const n = Math.round((Date.parse(today()) - Date.parse(s)) / 86400000);
  return n <= 0 ? "today" : `${n}d`;
};

const keyChip = (text, t) => div().px(6).h(18).min_w(18).flex().items_center().justify_center().flex_none().rounded(5).border_1().border_color(t.input ?? t.border).bg(t.raised).text_size(11).font_medium().text_color(t.muted).child(text);
const keyHints = (text, t) => h_flex().gap(14).items_center().min_w(0).overflow_hidden().children(text.split(" · ").map((seg) => {
  const w = seg.split(" "); let n = 1;
  while (n < w.length && /^[A-Z]$/.test(w[n])) n++;
  const label = w.slice(n).join(" ");
  return h_flex().gap(6).items_center().flex_none().child(keyChip(w.slice(0, n).join(" "), t)).when(Boolean(label), (e) => e.child(div().text_size(12).text_color(t.dim).child(label)));
}));

const FIELDS = ["title", "tags", "body"];

export default class Notes extends View {
  init(_props, cx) {
    this.ws = home() + "/workspace";
    this.here = focused()?.cwd ?? null;
    this.root = null; // project folder (nearest CLAUDE.md)
    this.scope = "project";
    this.filter = "open";
    this.tag = null;
    this.at = 0;
    this.groups = [];
    this.loaded = false;
    this.armed = null; // row key waiting for a second delete press
    this.status = "";
    this.busy = false;
    this.kind = "all"; // all | tasks | notes
    this.pvFocus = false; // keyboard on the preview: j/k scroll
    this.pvOff = 0; // preview scroll, in 22px steps
    this.pvMax = 0;
    this.pvH = 300; // measured height of the preview text area
    this.pvKey = null; // entry the preview shows (scroll resets when it changes)
    this.top = 0; // first visual row drawn (the list scrolls itself so the selection stays in view)
    this.listH = 400;
    this.follow = true; // keep the selected row on screen at the next render
    this.gPending = false; // first g of gg
    // Quick capture (one line, Enter adds a task) and the full form (title, tags, details, type).
    this.input = InputState.new({ placeholder: "Quick add a task… (Enter)" });
    this.input.on("submit", (_e, cx) => this.quickAdd(cx));
    this.title = InputState.new({ placeholder: "Title" });
    this.tagsIn = InputState.new({ placeholder: "design, urgent" });
    this.body = TextareaState.new({ placeholder: "Details, anything you want to keep with this entry…", rows: 10 });
    this.title.on("submit", () => this.focusField("body"));
    this.tagsIn.on("submit", () => this.focusField("body"));
    this.field = "title"; // which form field has the keyboard
    this.form = null; // null = list; { path?, key?, task } = form (edit when key is set)
    for (const f of FIELDS) {
      const st = f === "title" ? this.title : f === "tags" ? this.tagsIn : this.body;
      st.on("focus", (_e, cx) => { this.field = f; cx.notify(); });
    }
    this.listMode = true; // keys act on the list (vim-style); false while the quick-add input has the keyboard
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.input.on("focus", (_e, cx) => { this.listMode = false; cx.notify(); });
    cx.timer.after(300, () => { if (!this.form && this.listMode) this.handle.focus(); });
    cx.spawn(async (cx) => {
      try {
        if (this.here) {
          const r = await exec("sh", ["-c", ROOT_SH, "sh", this.here]);
          if (r.code === 0 && r.stdout.trim()) this.root = r.stdout.trim();
        }
      } catch {}
      await this.load(cx);
    });
    cx.timer.every(2500, (cx) => { if (!this.busy) cx.spawn(async (cx) => { await this.load(cx); }); });
  }

  label(dir) {
    return dir === this.ws ? "workspace" : dir.startsWith(this.ws + "/") ? dir.slice(this.ws.length + 1) : dir.replace(/^\/home\/[^/]+/, "~");
  }

  async load(cx) {
    let dirs = [];
    if (this.scope === "project") {
      if (this.root) dirs = [this.root];
    } else {
      try {
        const r = await exec("fd", ["--type", "f", "--no-ignore", "--exclude", "node_modules", "--exclude", ".git", "--full-path", "/notes/notes\\.md$", this.ws]);
        dirs = r.stdout.split("\n").filter(Boolean).map((p) => p.replace(/\/notes\/notes\.md$/, ""));
      } catch (e) { this.status = "fd failed: " + String(e); }
      dirs.sort((a, b) => (a === this.root ? -1 : b === this.root ? 1 : this.label(a).localeCompare(this.label(b))));
    }
    const groups = [];
    for (const dir of dirs) {
      let text = null;
      try { text = await readTextFile(FILE(dir)); } catch {}
      groups.push({ dir, path: FILE(dir), label: this.label(dir), text, items: parse(text).items });
    }
    this.groups = groups;
    this.loaded = true;
    cx.notify();
  }

  // Re-read the file, apply fn(text) -> new text (null = entry vanished), write only if unchanged since the read.
  async mutate(path, fn, cx) {
    this.busy = true;
    try {
      for (let tries = 0; tries < 2; tries++) {
        const text = await readTextFile(path);
        const next = fn(text);
        if (next === null) { this.status = "Entry changed on disk, reloaded."; break; }
        try { await writeTextFile(path, next, text ?? null); this.status = ""; break; }
        catch { this.status = "File changed while saving, retried."; }
      }
    } catch (e) { this.status = "Failed: " + String(e); }
    this.busy = false;
    await this.load(cx);
  }

  addEntry(entry, cx) {
    if (!this.root) { this.status = "No project for this pane (no CLAUDE.md above it)."; cx.notify(); return; }
    const path = FILE(this.root);
    this.at = 0;
    this.top = 0;
    this.follow = true;
    cx.spawn(async (cx) => {
      try { await exec("mkdir", ["-p", `${this.root}/notes`]); } catch {}
      await this.mutate(path, (t) => add(t, entry, today()), cx);
    });
  }

  quickAdd(cx) {
    const text = this.input.value().trim();
    if (!text) return;
    this.input.set_value("");
    this.addEntry({ text, task: true }, cx);
  }

  // ---- form ----
  openForm(r, cx) {
    if (r && !r.it) return;
    this.form = r ? { path: r.g.path, key: r.it.key, task: r.it.task } : { task: true };
    this.title.set_value(r ? stripTags(r.it.text) : this.input.value().trim());
    this.tagsIn.set_value(r ? tagsOf(r.it.text).join(", ") : "");
    this.body.set_value(r?.it.body ?? "");
    if (!r) this.input.set_value("");
    this.armed = null;
    this.focusField("title");
    cx.notify();
  }

  toList() {
    this.listMode = true;
    this.handle.focus();
  }

  closeForm(cx) {
    this.form = null;
    this.toList();
    cx.notify();
  }

  focusField(f) {
    this.field = f;
    (f === "title" ? this.title : f === "tags" ? this.tagsIn : this.body).focus();
  }

  nextField(back) {
    const i = FIELDS.indexOf(this.field);
    this.focusField(FIELDS[(i + (back ? FIELDS.length - 1 : 1)) % FIELDS.length]);
  }

  saveForm(cx) {
    const title = this.title.value().trim();
    if (!title) { this.status = "Title is required."; this.focusField("title"); cx.notify(); return; }
    const tags = [...new Set(this.tagsIn.value().split(/[\s,#]+/).filter(Boolean))];
    const text = [title, ...tags.map((x) => "#" + x)].join(" ");
    const body = this.body.value().replace(/\s+$/, "");
    const f = this.form;
    this.form = null;
    this.status = "";
    this.toList();
    if (f.key) cx.spawn(async (cx) => { await this.mutate(f.path, (t) => edit(t, f.key, text, body, f.task), cx); });
    else this.addEntry({ text, task: f.task, body }, cx);
    cx.notify();
  }

  // ---- list ----
  rows() {
    const out = [];
    for (const g of this.groups) {
      const items = g.items.filter((it) => {
        if (this.filter === "open" && it.task && it.done) return false;
        if (this.filter === "done" && !(it.task && it.done)) return false;
        if (this.kind === "tasks" && !it.task) return false;
        if (this.kind === "notes" && it.task) return false;
        return !this.tag || tagsOf(it.text).includes(this.tag);
      }).reverse(); // newest first
      if (!items.length && this.scope !== "project") continue;
      out.push({ head: g });
      for (const it of items) out.push({ g, it, id: `${g.path}::${it.key}` });
    }
    return out;
  }

  tagCounts() {
    const m = new Map();
    for (const g of this.groups) for (const it of g.items) for (const t of tagsOf(it.text)) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  setScope(scope, cx) {
    if (scope === this.scope) return;
    this.scope = scope;
    this.at = 0;
    this.groups = [];
    cx.spawn(async (cx) => { await this.load(cx); });
  }

  cycleFilter() {
    const i = FILTERS.findIndex((f) => f[0] === this.filter);
    this.filter = FILTERS[(i + 1) % FILTERS.length][0];
    this.at = 0;
  }

  tick(r, cx) {
    if (!r?.it?.task) return;
    cx.spawn(async (cx) => { await this.mutate(r.g.path, (t) => toggle(t, r.it.key, today()), cx); });
  }

  cycleKind() {
    this.kind = this.kind === "all" ? "tasks" : this.kind === "tasks" ? "notes" : "all";
    this.at = 0;
    this.top = 0;
  }

  scrollPv(n) {
    this.pvOff = Math.max(0, Math.min(this.pvMax, this.pvOff + n));
  }

  del(r, cx) {
    if (!r?.it) return;
    if (this.armed !== r.id) { this.armed = r.id; return; }
    this.armed = null;
    cx.spawn(async (cx) => { await this.mutate(r.g.path, (t) => remove(t, r.it.key), cx); });
  }

  openFile() {
    const dir = this.scope === "project" ? this.root : this.sel?.g?.dir ?? this.root;
    if (!dir) return;
    closeOverlay(props().overlay);
    run("terminal.open", { argv: [...EDITOR, FILE(dir)], folder: dir, place: "right", name: "notes" });
  }

  onKey(e, cx, sel) {
    const k = e.key;
    const ctrl = e.modifiers.control;
    if (k === "escape") {
      if (this.form) { this.closeForm(cx); cx.stop_propagation(); return; }
      if (this.pvFocus) { this.pvFocus = false; cx.stop_propagation(); cx.notify(); return; }
      if (!this.listMode) { this.toList(); cx.stop_propagation(); cx.notify(); return; }
      return closeOverlay(props().overlay);
    }
    if (this.form) {
      if (ctrl && k === "enter") this.saveForm(cx);
      else if (k === "tab") this.nextField(e.modifiers.shift);
      else if (ctrl && k === "t") this.form = { ...this.form, task: !this.form.task };
      else return;
      cx.stop_propagation();
      cx.notify();
      return;
    }
    this.follow = true;
    const key = k === " " ? "space" : k;
    const g = this.gPending;
    this.gPending = false;
    if (!this.listMode) {
      // Quick-add input has the keyboard: Esc or Down hands it back to the list; Ctrl keys work everywhere.
      if (k === "down" || k === "tab" || (ctrl && k === "j")) {
        this.toList();
        if (k !== "tab" && sel.length) this.at = Math.min(this.at + 1, sel.length - 1);
      } else if (k === "up" || (ctrl && k === "k")) this.toList();
      else if (ctrl && k === "n") return (this.openForm(null, cx), cx.stop_propagation());
      else if (ctrl && k === "r") this.setScope(this.scope === "project" ? "all" : "project", cx);
      else return;
      cx.stop_propagation();
      cx.notify();
      return;
    }
    const shift = e.modifiers.shift;
    if (this.pvFocus) {
      // Preview has the keyboard: scroll like a pager; h, q, Ctrl+H or Esc go back to the list.
      if (key === "j" || key === "down" || (ctrl && key === "j")) this.scrollPv(1);
      else if (key === "k" || key === "up" || (ctrl && key === "k")) this.scrollPv(-1);
      else if (key === "d" || (ctrl && key === "d")) this.scrollPv(12);
      else if (key === "u" || (ctrl && key === "u")) this.scrollPv(-12);
      else if (key === "space" || key === "pagedown" || (ctrl && key === "f")) this.scrollPv(24);
      else if (key === "pageup" || (ctrl && key === "b")) this.scrollPv(-24);
      else if (key === "G" || (key === "g" && shift) || key === "end") this.pvOff = 1e9;
      else if (key === "g") { if (g) this.pvOff = 0; else this.gPending = true; }
      else if (key === "home") this.pvOff = 0;
      else if (key === "e") { if (this.sel) return (this.openForm(this.sel, cx), cx.stop_propagation()); }
      else if (key === "h" || key === "q" || (ctrl && key === "h")) this.pvFocus = false;
      else return;
      cx.stop_propagation();
      cx.notify();
      return;
    }
    if (this.armed && key !== "d") this.armed = null;
    if (key === "j" || key === "down" || (ctrl && key === "j")) { if (sel.length) this.at = Math.min(this.at + 1, sel.length - 1); }
    else if (key === "k" || key === "up" || (ctrl && key === "k")) { if (sel.length) this.at = Math.max(this.at - 1, 0); }
    else if (key === "G" || (key === "g" && shift)) this.at = Math.max(0, sel.length - 1);
    else if (key === "g") { if (g) this.at = 0; else this.gPending = true; }
    else if (key === "space" || key === "x" || (ctrl && key === "t")) this.tick(this.sel, cx);
    else if (key === "enter" || key === "l" || (ctrl && key === "l")) { if (this.sel) this.pvFocus = true; }
    else if (key === "t") this.cycleKind();
    else if (key === "e" || (ctrl && key === "e")) { if (this.sel) return (this.openForm(this.sel, cx), cx.stop_propagation()); }
    else if (key === "n" || (ctrl && key === "n")) return (this.openForm(null, cx), cx.stop_propagation());
    else if (key === "i" || key === "a" || key === "/") { this.input.focus(); }
    else if (key === "d" || (ctrl && key === "d")) this.del(this.sel, cx);
    else if (key === "tab") this.cycleFilter();
    else if (key === "r" || (ctrl && key === "r")) this.setScope(this.scope === "project" ? "all" : "project", cx);
    else if (key === "o" || (ctrl && key === "o")) return (this.openFile(), cx.stop_propagation());
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  preview(t, button, chip) {
    const r = this.sel;
    const card = (el) => el.flex_1().min_w(0).min_h(0).h_full().rounded(10).overflow_hidden().border_1().border_color(this.pvFocus ? t.accent : t.border).bg(t.raised);
    if (!r) return card(v_flex().items_center().justify_center().child(div().text_size(12).text_color(t.dim).child("Select an entry to preview it.")));
    const it = r.it;
    const done = it.task && it.done;
    const meta = [it.task ? (done ? "Task, done" : "Task") : "Note", it.added && `added ${it.added}`, it.doneOn && `done ${it.doneOn}`, this.scope === "all" ? r.g.label : null].filter(Boolean).join(" · ");
    return card(
      v_flex().size_full().min_h(0)
        .child(
          v_flex().flex_none().p(14).gap(8).border_b(1).border_color(t.border)
            .child(h_flex().gap(10).items_start()
              .child(it.task
                ? div().w(16).h(16).mt(2).flex_none().flex().items_center().justify_center().rounded(4).border_1().border_color(done ? t.accent : t.border).when(done, (e) => e.bg(t.accent).text_color(t.accent_foreground).text_size(11).child("✓"))
                : div().w(16).flex_none().text_center().text_color(t.dim).child("•"))
              .child(div().flex_1().min_w(0).whitespace_normal().text_size(15).font_semibold().text_color(done ? t.dim : t.foreground).when(done, (e) => e.line_through()).child(stripTags(it.text))))
            .when(tagsOf(it.text).length > 0, (e) => e.child(h_flex().gap(6).flex_wrap().children(tagsOf(it.text).map((tg) => div().flex_none().h(18).px(7).flex().items_center().rounded(9).bg(t.background).border_1().border_color(t.border).text_size(11).text_color(t.dim).child("#" + tg)))))
            .child(h_flex().gap(8).items_center()
              .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(meta))
              .child(chip("pv-edit", "Edit", false, (cx) => { this.openForm(r, cx); }))
              .child(chip("pv-del", this.armed === r.id ? "Delete?" : "Delete", this.armed === r.id, (cx) => { this.del(r, cx); cx.notify(); }))),
        )
        .child(
          it.body
            ? div().id("npv").flex_1().min_h(0).overflow_hidden().relative()
                .on_size_change((size, cx) => { if (Math.abs(size.height - this.pvH) > 1) { this.pvH = size.height; cx.notify(); } })
                .on_scroll_wheel((e, cx) => { const dy = e.delta_lines?.y ?? e.delta.y; if (dy) { this.scrollPv(dy < 0 ? 3 : -3); cx.notify(); } })
                .child(div().absolute().top(-this.pvOff * 22).left(0).w_full().px(14).py(8).child(TextView.markdown("np-" + r.id, it.body)))
            : div().flex_1().px(14).py(12).text_size(12).text_color(t.dim).child(it.task ? "No details. Press E to add some." : "This note has no details yet. Press E to write them."),
        ),
    );
  }

  render(cx) {
    const t = theme();
    const rows = this.rows();
    const sel = rows.filter((r) => r.it);
    this.at = Math.max(0, Math.min(this.at, sel.length - 1));
    this.sel = sel[this.at];
    const tags = this.tagCounts();
    // Windowed list: estimate each visual row's height, then move `top` so the selected row fits in the viewport.
    const rowH = (r) => (r.head ? (this.scope === "all" ? 30 : 0) : 29);
    this.top = Math.max(0, Math.min(this.top, rows.length - 1));
    if (this.follow && this.sel) {
      this.follow = false;
      let vi = rows.findIndex((r) => r.id === this.sel.id);
      if (vi > 0 && rows[vi - 1].head && this.at === 0) vi -= 1; // first item: show its heading too
      if (vi < this.top) this.top = vi;
      else {
        let sum = 0;
        for (let i = this.top; i <= vi; i++) sum += rowH(rows[i]);
        while (sum > this.listH && this.top < vi) { sum -= rowH(rows[this.top]); this.top++; }
      }
    }
    if ((this.sel?.id ?? null) !== this.pvKey) { this.pvKey = this.sel?.id ?? null; this.pvOff = 0; this.pvFocus = false; }
    const pvBody = this.sel?.it.body ?? "";
    if (pvBody) {
      let px = 16;
      for (const l of pvBody.split("\n")) {
        if (!l.trim()) px += 10;
        else if (/^#{1,6}\s/.test(l)) px += 40;
        else if (/^\s*\|/.test(l)) px += /^\s*\|[\s:|-]+$/.test(l) ? 0 : 36;
        else px += Math.ceil(l.length / 90) * 23;
      }
      this.pvMax = Math.max(0, Math.round((px * 1.05 - this.pvH) / 22));
    } else this.pvMax = 0;
    this.pvOff = Math.min(this.pvOff, this.pvMax);
    const openCount = this.groups.reduce((n, g) => n + g.items.filter((i) => !(i.task && i.done)).length, 0);
    const tab = (id, text, on, fn) => div().id(id).h_full().px(12).flex().items_center().cursor_pointer().text_size(12).when(on, (e) => e.font_medium().text_color(t.accent)).when(!on, (e) => e.text_color(t.dim).hover((x) => x.text_color(t.muted))).on_click((_e, cx) => fn(cx)).child(text);
    const chip = (id, text, on, fn) => div().id(id).h(22).px(9).flex().items_center().rounded(11).cursor_pointer().text_size(11).border_1().border_color(on ? t.accent : t.border).bg(on ? t.selected : t.raised).text_color(on ? t.accent : t.muted).hover((x) => x.bg(t.hover)).on_click((_e, cx) => fn(cx)).child(text);
    const button = (id, text, primary, fn) => div().id(id).h(30).px(14).flex().items_center().rounded(8).cursor_pointer().text_size(12).font_medium().border_1().border_color(primary ? t.accent : t.border).bg(primary ? t.accent : t.raised).text_color(primary ? t.accent_foreground : t.muted).hover((x) => x.bg(primary ? t.accent : t.hover)).on_click((_e, cx) => fn(cx)).child(text);
    const shell = (header, body) => v_flex().id("notes").track_focus(this.handle).on_key_down((e, cx) => this.onKey(e, cx, sel))
      .size_full().min_h(0).rounded(10).overflow_hidden().border_1().border_color(t.border).bg(t.background).text_size(13)
      .child(header).child(body);

    if (this.form) {
      const f = this.form;
      const label = (text) => div().text_size(11).font_semibold().text_color(t.muted).child(text);
      const frame = (name, el) => el.border_1().border_color(this.field === name ? t.accent : t.border).bg(t.raised).rounded(9).text_size(12.8).text_color(t.foreground);
      return shell(
        h_flex().h(30).flex_none().pr(10).items_center().border_b(1).border_color(t.border)
          .child(div().h_full().pl(12).pr(6).flex().items_center().flex_none().text_size(12).font_medium().text_color(t.accent).child(f.key ? "Edit entry" : "New entry"))
          .child(div().flex_1().min_w(0).truncate().px(10).text_size(12).text_color(t.dim).child(this.root ? this.label(this.root) : ""))
          .child(keyHints("Tab next field · Ctrl Enter save · Esc cancel", t)),
        v_flex().flex_1().min_h(0).p(14).gap(12)
          .child(
            h_flex().gap(8).items_center()
              .child(label("Type"))
              .child(chip("nf-type-task", "Task", f.task, (cx) => { this.form = { ...f, task: true }; cx.notify(); }))
              .child(chip("nf-type-note", "Note", !f.task, (cx) => { this.form = { ...f, task: false }; cx.notify(); }))
              .child(div().flex_1())
              .child(div().text_size(11).text_color(t.dim).child(f.task ? "A to-do you can tick off" : "A note or idea, no checkbox")),
          )
          .child(v_flex().gap(5).child(label("Title")).child(frame("title", Input.new(this.title).h(36).px(10))))
          .child(v_flex().gap(5).child(label("Tags (optional, comma or space separated)")).child(frame("tags", Input.new(this.tagsIn).h(36).px(10))))
          .child(v_flex().flex_1().min_h(0).gap(5).child(label("Details")).child(frame("body", Textarea.new(this.body).flex_1().min_h(120).px(10).py(8))))
          .child(
            h_flex().gap(8).items_center()
              .child(div().flex_1().text_size(11).text_color(t.blocked).child(this.status))
              .child(button("nf-cancel", "Cancel", false, (cx) => this.closeForm(cx)))
              .child(button("nf-save", f.key ? "Save changes" : "Add entry", true, (cx) => this.saveForm(cx))),
          ),
      );
    }

    const empty = !this.loaded ? "Loading…" : this.scope === "project" && !this.root ? "No project for this pane (no CLAUDE.md above it). Ctrl R shows the whole workspace." : sel.length ? "" : this.tag || this.filter !== "open" ? "Nothing matches this filter." : "Nothing here. Press N for a full entry, or I to quick-add a task.";
    return shell(
      h_flex().h(30).flex_none().pr(10).items_center().border_b(1).border_color(t.border)
        .children(FILTERS.map(([id, text]) => tab("nf-" + id, text, this.filter === id, (cx) => { this.filter = id; this.at = 0; cx.notify(); })))
        .child(div().id("nf-scope").h_full().pl(12).pr(6).flex().items_center().cursor_pointer().text_size(12).text_color(t.dim).hover((x) => x.text_color(t.muted)).on_click((_e, cx) => { this.setScope(this.scope === "project" ? "all" : "project", cx); cx.notify(); }).child(this.scope === "project" ? "Project" : "Workspace"))
        .child(div().id("nf-kind").h_full().pl(8).pr(6).flex().items_center().cursor_pointer().text_size(12).text_color(this.kind === "all" ? t.dim : t.accent).hover((x) => x.text_color(t.muted)).on_click((_e, cx) => { this.cycleKind(); cx.notify(); }).child(this.kind === "all" ? "All kinds" : this.kind === "tasks" ? "Tasks" : "Notes"))
        .child(div().flex_1().min_w(0).truncate().px(10).text_size(12).text_color(t.dim).child((this.scope === "project" ? (this.root ? this.label(this.root) : "") : `${this.groups.length} files`) + ` · ${openCount} open`))
        .child(keyHints(this.listMode ? (this.pvFocus ? "J K scroll · D U half · H back · E edit · Esc back" : "J K move · Space tick · Enter preview · E edit · N new · T kind · I add · Esc close") : "Enter add · Down list · Esc list", t)),
      h_flex().flex_1().min_h(0).p(14).gap(12).items_stretch()
        .child(v_flex().w(440).flex_shrink(0).min_h(0).h_full().gap(10)
        .child(
          h_flex().gap(8).items_center()
            .child(Input.new(this.input).flex_1().h(36).px(10).rounded(9).border_1().border_color(this.listMode ? t.border : t.accent).bg(t.raised).text_size(12.8).text_color(t.foreground))
            .child(button("nf-new", "New", true, (cx) => this.openForm(null, cx))),
        )
        .when(tags.length > 0, (e) => e.child(h_flex().gap(6).items_center().flex_wrap().children(tags.slice(0, 14).map(([name, n]) => chip("nt-" + name, `#${name} ${n}`, this.tag === name, (cx) => { this.tag = this.tag === name ? null : name; this.at = 0; cx.notify(); })))))
        .child(
          v_flex().id("nlist").flex_1().min_h(0).gap(1).overflow_hidden()
            .on_size_change((size, cx) => { if (Math.abs(size.height - this.listH) > 1) { this.listH = size.height; this.follow = true; cx.notify(); } })
            .on_scroll_wheel((e, cx) => { const dy = e.delta_lines?.y ?? e.delta.y; if (dy) { this.top = Math.max(0, Math.min(rows.length - 1, this.top + (dy < 0 ? 3 : -3))); cx.notify(); } })
            .children(
              rows.slice(this.top).map((r, i0) => {
                const i = i0 + this.top;
                if (r.head) {
                  return this.scope === "all"
                    ? div().id("nh-" + i).pt(i ? 12 : 0).pb(4).px(10).text_size(11).font_semibold().text_color(t.muted).child(r.head.label)
                    : div().id("nh-" + i).h(0);
                }
                const { it } = r;
                const on = this.sel && this.sel.id === r.id;
                const done = it.task && it.done;
                const row = h_flex().id("nr-" + r.id).h(28).flex_none().px(10).gap(10).items_center().rounded(7)
                  .bg(on ? t.selected : "#00000000").hover((s) => s.bg(on ? t.selected : t.hover))
                  .on_click(() => { this.at = sel.findIndex((x) => x.id === r.id); cx.notify(); })
                  .child(
                    it.task
                      ? div().id("nc-" + r.id).w(16).h(16).flex_none().flex().items_center().justify_center().rounded(4).border_1().border_color(done ? t.accent : t.border).when(done, (e) => e.bg(t.accent).text_color(t.accent_foreground).text_size(11).child("✓")).cursor_pointer().on_click((_e, cx) => { cx.stop_propagation(); this.tick(r, cx); })
                      : div().w(16).flex_none().text_center().text_color(t.dim).child("•"),
                  )
                  .child(div().flex_1().min_w(0).truncate().text_color(done ? t.dim : t.foreground).when(done, (e) => e.line_through()).child(stripTags(it.text)))
                  .when(Boolean(it.body), (e) => e.child(div().flex_none().text_size(11).text_color(t.dim).child("¶")))
                  .children(tagsOf(it.text).slice(0, 2).map((tg) => div().flex_none().h(18).px(7).flex().items_center().rounded(9).bg(t.raised).border_1().border_color(t.border).text_size(11).text_color(t.dim).child("#" + tg)))
                  .child(div().flex_none().w(44).text_right().text_size(11).text_color(t.dim).child(age(done ? it.doneOn : it.added)));
                return row;
              }).concat(empty ? [div().px(10).py(6).text_color(t.dim).child(empty)] : []),
            ),
        )
        .when(Boolean(this.status), (e) => e.child(div().flex_none().text_size(11).text_color(t.dim).child(this.status))))
        .child(this.preview(t, button, chip)),
    );
  }
}
