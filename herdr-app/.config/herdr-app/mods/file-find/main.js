// Fuzzy find under the focused terminal's repo (git root, else its folder), with a preview pane.
// Files mode: Enter edits in vim in a split to the right, Ctrl+T in a new tab.
// Dirs mode: Enter opens a shell there in a split, Ctrl+T in a new tab.
// Ctrl+F files, Ctrl+D dirs, Ctrl+R repo/here scope, Up/Down or Ctrl+J/K move, Esc closes.
// Header shows only the core actions; `?` opens a help panel with every key (works while the preview has focus,
// because in the search box `?` is typed text; any key closes the panel, Esc still closes the mod).
// Preview: Ctrl+L (or Tab) moves the keyboard to the preview: Ctrl+J/K or j/k scroll, d/u or space page,
// Ctrl+D/U half page, PgUp/PgDn or Space/Ctrl+F/B page, gg/G ends, Enter opens, Ctrl+T new tab; Ctrl+H (or Tab, i, /) goes back to the search. Ctrl+E toggles rendered/raw markdown (rendered scrolls by wheel/scrollbar only; raw has the keys).
// The script engine has a tight time budget, so listing and fuzzy matching run natively
// (fd + fzf --filter through `hc exec`); this file only draws the results.
// .gitignore is respected, except .env* files, which are always included.

import { View, div, list } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView, Scrollbar } from "gpui-base";
import { hc, focused, run, exec, theme, props, closeOverlay, readTextFile, settings, spaces, panes } from "herdr";

// Ctrl+Shift+V (what voice-input.sh sends to herdr-app, which it treats as a terminal): a text box only knows Ctrl+V, so paste the clipboard in here.
const dictate = (e, cx, box, single = true) => {
  if (!(e.modifiers?.control && e.modifiers?.shift && String(e.key).toLowerCase() === "v") || !box) return false;
  exec("wl-paste", ["-n"]).then((r) => { if (r.code === 0 && r.stdout) { box.replace(single ? String(r.stdout).replace(/\r?\n/g, " ") : String(r.stdout)); box.focus(); } });
  cx.stop_propagation(); return true;
};

// Header hints as key chips ("Enter open · Esc" -> [Enter] open [Esc]); same look as the devservers mod.
const keyChip = (text, t) => div().px(6).h(18).min_w(18).flex().items_center().justify_center().flex_none().rounded(5).border_1().border_color(t.input ?? t.border).bg(t.raised).text_size(11).font_medium().text_color(t.muted).child(text);
const keyHints = (text, t) => h_flex().gap(14).items_center().min_w(0).overflow_hidden().children(text.split(" · ").map((seg) => {
  const w = seg.split(" "); let n = 1;
  while (n < w.length && /^[A-Z]$/.test(w[n])) n++;
  const label = w.slice(n).join(" ");
  return h_flex().gap(6).items_center().flex_none().child(keyChip(w.slice(0, n).join(" "), t)).when(Boolean(label), (e) => e.child(div().text_size(12).text_color(t.dim).child(label)));
}));

const HELP = [
  ["Search", [
    ["Type", "Fuzzy-filter the list (fzf) under the repo root, or the terminal's folder in Here scope."],
    ["Ctrl+J · Ctrl+K · ↑ · ↓", "Move the selection (wraps around)."],
    ["Enter", "Files: edit in vim in a split to the right (pdf, docx, svg, png, jpg open in the default app). Dirs: open a shell there in a split."],
    ["Ctrl+T", "Same as Enter, but in a new tab."],
    ["Ctrl+O", "Files: flip the choice for this open (default app files go to vim, others to the default app)."],
    ["Ctrl+F · Ctrl+D", "Switch to Files or Dirs mode."],
    ["Ctrl+R", "Switch scope between the repo root and the terminal's current folder."],
    ["PgUp · PgDn", "Scroll the preview a page."],
    ["Ctrl+L · Tab", "Move the keyboard to the preview."],
    ["Ctrl+E", "Markdown files: toggle rendered and raw preview."],
    ["Esc", "Close."],
  ]],
  ["Preview", [
    ["?", "Open this help (only while the preview has focus)."],
    ["Ctrl+H · Tab · i · /", "Back to the search box."],
    ["Ctrl+J · Ctrl+K · j · k · ↓ · ↑", "Scroll a line."],
    ["d · u · Ctrl+D · Ctrl+U", "Scroll half a page."],
    ["Space · PgDn · Ctrl+F", "Scroll a page down."],
    ["PgUp · Ctrl+B", "Scroll a page up."],
    ["gg · Home", "Jump to the top."],
    ["G · End", "Jump to the bottom."],
    ["Enter", "Open the file or folder like Enter in the search."],
    ["Ctrl+T", "Open in a new tab."],
    ["o · Ctrl+O", "Open with the other app (see Ctrl+O in Search)."],
    ["e", "Markdown files: toggle rendered and raw preview."],
  ]],
  ["Dirs preview", [
    ["Ctrl+L", "In Dirs mode, the preview is a folder listing you can browse."],
    ["Ctrl+J · Ctrl+K · j · k · ↓ · ↑", "Move the selection in the listing."],
    ["d · u · Ctrl+D · Ctrl+U", "Move half a page."],
    ["Space · PgDn · Ctrl+F · PgUp · Ctrl+B", "Move a page down or up."],
    ["gg · G", "Select the first or last entry."],
    ["Enter · l", "Folder: go into it. File: edit in vim in a split."],
    ["h · Backspace · -", "Go up one folder."],
    ["Ctrl+T", "Open the selected file or folder in a new tab (folders get a shell)."],
    ["o · Ctrl+O", "Open the selected file with the other app."],
  ]],
  ["Markdown", [
    ["Ctrl+E · e", "Toggle rendered and raw. Raw uses the preview scroll keys."],
    ["Wheel · scrollbar", "Rendered markdown scrolls only this way; the scroll keys do nothing there."],
  ]],
];

const EDITOR = ["vim"];
// Files with these extensions open in the default app (xdg-open) on Enter; Ctrl+O flips the choice for one open
// (external -> vim, anything else -> default app). Add extensions here.
const EXTERNAL = new Set(["pdf", "docx", "svg", "png", "jpg", "jpeg"]);
const isExternal = (name, alt) => EXTERNAL.has((name.split(".").pop() || "").toLowerCase()) !== Boolean(alt);
const openExternal = (abs) => { exec("setsid", ["-f", "xdg-open", abs]).catch(() => {}); };
const MAX_SHOWN = 100;
const PV_HALF = 15, PV_PAGE = 30;
const PV_LINES = 1000, PV_SHOWN = 90; // lines read / lines drawn from the scroll offset
const listFile = (base, mode) => `/tmp/herdr-ff-${mode}-${(base ?? ".").replace(/[^A-Za-z0-9]/g, "_")}.list`;
const LIST_SH = 'umask 077; cd "$1" || exit 1; { fd --type "$2" --hidden --exclude .git; [ "$2" = f ] && fd --type f --hidden --no-ignore --glob ".env*" --exclude .git --exclude node_modules; } | awk \'!s[$0]++\' > "$3.new" && mv "$3.new" "$3"';
const QUERY_SH = 'if [ ! -f "$2" ]; then :; elif [ -z "$1" ]; then head -n ' + MAX_SHOWN + ' "$2"; else fzf -f "$1" < "$2" | head -n ' + MAX_SHOWN + '; fi';

export default class FileFind extends View {
  init(_props, cx) {
    this.rows = [];
    this.q = "";
    this.at = 0;
    this.seq = 0;
    this.pvSeq = 0;
    this.mode = "files";
    this.scope = "repo";
    this.status = "Searching…";
    this.pv = new Map(); // "mode:base/item" -> lines, kept while the window is open
    this.pvKey = null;
    this.pvLines = [];
    this.pvOff = 0; // first preview line shown; the mod scrolls itself (keys + wheel)
    this.pvVis = 12; // rows kept on screen at the end of a file (fixed: the window-size estimate broke scrolling)
    this.gPending = false; // first g of gg
    this.dsub = ""; // dirs mode: folder inside the highlighted dir being browsed in the preview ("a/b/")
    this.dsel = 0; // dirs mode: selected entry in the preview
    this.pvItem = null;
    this.pfocus = false; // keyboard on the preview: j/k scroll
    this.raw = false;
    this.helpOpen = false;
    // Where the focused terminal lives: a server space (or a server agent terminal) runs every command there (--on), not here.
    const sp = spaces().find((s) => s.active), f = focused(), pn = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
    this.on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : sp?.machine ?? null;
    this.hcx = (a) => hc(["exec", ...(this.on ? ["--on", this.on] : []), ...a]);
    this.here = pn?.cwd || f?.cwd || sp?.folder || null;
    this.root = this.here;
    this.input = InputState.new({ placeholder: "Find…" });
    this.input.on("change", (_e, cx) => { this.q = this.input.value(); this.at = 0; this.query(cx); });
    this.input.on("submit", () => this.open(false));
    this.input.focus();
    cx.timer.after(600, () => { if (!this.pfocus) this.input.focus(); });
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => {
      try {
        const r = await this.hcx(["git", "-C", this.here ?? ".", "rev-parse", "--show-toplevel"]);
        if (r.code === 0 && r.stdout.trim()) this.root = r.stdout.trim();
      } catch {}
      await this.load(cx);
    });
  }

  base() {
    return this.scope === "repo" ? this.root : this.here;
  }

  async load(cx) {
    const seq = ++this.seq;
    const list = listFile(this.base(), this.mode);
    this.list = list;
    this.listed = false;
    this.rows = [];
    this.status = "Searching…";
    await this.fill(cx, seq); // last run's list for this folder shows at once, the fresh one replaces it
    if (seq !== this.seq) return;
    try {
      await this.hcx(["sh", "-c", LIST_SH, "sh", this.base() ?? ".", this.mode === "files" ? "f" : "d", list]);
    } catch (e) {
      if (seq === this.seq) { this.status = "fd failed: " + String(e); cx.notify(); }
      return;
    }
    this.listed = true;
    await this.fill(cx, seq);
  }

  reload(cx) {
    this.rows = [];
    this.status = "Searching…";
    this.at = 0;
    cx.spawn(async (cx) => { await this.load(cx); });
  }

  query(cx) {
    const seq = ++this.seq;
    cx.spawn(async (cx) => { await this.fill(cx, seq); });
  }

  async fill(cx, seq) {
    try {
      const r = await this.hcx(["sh", "-c", QUERY_SH, "sh", this.q, this.list]);
      if (seq !== this.seq) return;
      this.rows = r.stdout.split("\n").filter(Boolean);
      this.status = this.rows.length ? "" : this.listed ? "No match." : "Searching…";
      this.at = Math.max(0, Math.min(this.at, this.rows.length - 1));
      this.syncPreview(cx);
    } catch (e) {
      if (seq !== this.seq) return;
      this.status = "search failed: " + String(e);
    }
    cx.notify();
  }

  // Preview of the highlighted row. Files are read natively (no exec); dirs list via `ls`.
  // Cached per path. Must be started from an event/task context (never from render).
  syncPreview(cx) {
    const item = this.rows[this.at];
    if (item !== this.pvItem) { this.pvItem = item; this.dsub = ""; this.dsel = 0; }
    const dirPath = item ? `${this.base()}/${item.replace(/\/$/, "")}/${this.dsub}` : null;
    const key = item ? (this.mode === "dirs" ? `dirs:${dirPath}` : `files:${this.base()}/${item}`) : null;
    if (key === this.pvKey) return;
    this.pvKey = key;
    this.pvOff = 0;
    if (!key) { this.pvLines = []; return; }
    const hit = this.pv.get(key);
    if (hit) { this.pvLines = hit; return; }
    const seq = ++this.pvSeq;
    cx.spawn(async (cx) => {
      let lines;
      const path = this.mode === "dirs" ? dirPath : `${this.base()}/${item}`;
      try {
        if (this.mode === "files") {
          const text = await readTextFile(path, { on: this.on });
          if (text === null || text === undefined) lines = ["Cannot preview (unreadable or too large)"];
          else if (text.includes("\0")) lines = ["Binary file"];
          else {
            lines = text.slice(0, 200000).replace(/\n$/, "").split("\n").slice(0, PV_LINES).map((l) => (l.length > 3000 ? l.slice(0, 3000) + "…" : l.replace(/\t/g, "  ")));
            if (lines.length && /\.(md|markdown)$/i.test(item)) { lines.md = text.slice(0, 20000); }
          }
        } else {
          const r = await this.hcx(["ls", "-1Ap", "--group-directories-first", path]);
          lines = r.stdout.split("\n").filter(Boolean).slice(0, PV_LINES);
          if (lines.length) lines.dir = true; else lines = ["(empty)"];
        }
      } catch (e) { lines = ["Cannot preview: " + String(e)]; }
      if (this.pv.size > 60) this.pv.clear();
      this.pv.set(key, lines);
      if (seq === this.pvSeq && key === this.pvKey) { this.pvLines = lines; cx.notify(); }
    });
  }

  setMode(mode, cx) {
    if (mode !== this.mode) { this.mode = mode; this.reload(cx); }
    cx.notify();
  }

  toggleScope(cx) {
    this.scope = this.scope === "repo" ? "here" : "repo";
    this.reload(cx);
    cx.notify();
  }

  // Dirs mode, preview focused: the preview is a browsable folder listing.
  moveSel(n) {
    const len = this.pvLines.dir ? this.pvLines.length : 0;
    if (!len) return;
    this.dsel = Math.max(0, Math.min(len - 1, this.dsel + n));
    if (this.dsel < this.pvOff) this.pvOff = this.dsel;
    else if (this.dsel > this.pvOff + 22) this.pvOff = this.dsel - 22;
  }

  openEntry(tab, cx, alt) {
    const entry = this.pvLines.dir ? this.pvLines[this.dsel] : null;
    const item = this.rows[this.at];
    if (!entry || !item) return;
    const rel = item.replace(/\/$/, "") + "/" + this.dsub + entry;
    const base = this.base();
    if (entry.endsWith("/")) {
      if (!tab) { this.dsub += entry; this.dsel = 0; this.syncPreview(cx); return; }
      const dir = (base ?? "") + "/" + rel.replace(/\/$/, "");
      closeOverlay(props().overlay);
      run("terminal.open", { argv: ["sh", "-c", 'cd "$1" && exec "${SHELL:-zsh}" -i', "sh", dir], folder: dir, place: "tab", name: entry.replace(/\/$/, "") });
      return;
    }
    closeOverlay(props().overlay);
    if (isExternal(entry, alt)) { openExternal((base ?? "") + "/" + rel); return; }
    run("terminal.open", { argv: [...EDITOR, rel], folder: base ?? undefined, place: tab ? "tab" : "right", name: entry });
  }

  upDir(cx) {
    if (!this.dsub) return;
    this.dsub = this.dsub.replace(/[^/]+\/$/, "");
    this.dsel = 0;
    this.syncPreview(cx);
  }

  focusPv(on) {
    this.pfocus = on;
    if (on) this.handle.focus(); else this.input.focus();
  }

  maxOff() {
    const pv = this.pvLines;
    return Math.max(0, pv.length - this.pvVis);
  }

  scrollPv(n) {
    this.pvOff = Math.max(0, Math.min(this.maxOff(), this.pvOff + n));
  }

  open(tab, alt) {
    const item = this.rows[this.at];
    if (!item) return;
    closeOverlay(props().overlay);
    const base = this.base();
    const place = tab ? "tab" : "right";
    const name = item.replace(/\/$/, "").split("/").pop();
    if (this.mode === "files" && !this.on && isExternal(name, alt)) openExternal((base ?? "") + "/" + item);
    else if (this.mode === "files") run("terminal.open", { argv: [...EDITOR, item], folder: base ?? undefined, place, name });
    else {
      // folder is ignored for splits (they start where the focused pane is), so cd explicitly
      const dir = (base ?? "") + "/" + item;
      run("terminal.open", { argv: ["sh", "-c", 'cd "$1" && exec "${SHELL:-zsh}" -i', "sh", dir], folder: dir, place, name });
    }
  }

  render(cx) {
    const t = theme();
    const rows = this.rows;
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    const pv = this.pvLines;
    const off = Math.min(this.pvOff, this.maxOff());
    // Header mirrors the shipped pane header (pane-named): 30px, 12px text, hairline underline; tabs are full-height
    // sections with an accent underline when active. Keep changes-float in sync.
    const tab = (id, text, key, on, fn, first) => div().id(id).h_full().pl(first ? 12 : 4).pr(4).flex().items_center().cursor_pointer().text_size(12).text_color(on ? t.accent : t.dim).when(on, (e) => e.font_medium()).when(!on, (e) => e.hover((x) => x.text_color(t.muted))).on_click((_e, cx) => fn(cx))
      .child(h_flex().h(22).items_center().rounded(6).border_1().border_color(t.input ?? t.border).overflow_hidden()
        .child(div().px(7).h_full().flex().items_center().bg(t.raised).text_size(11).font_medium().text_color(t.muted).child(key))
        .child(div().w(1).h_full().bg(t.input ?? t.border))
        .child(div().px(8).flex().items_center().child(text)));
    const browsing = this.mode === "dirs" && Boolean(pv.dir);
    const hint = this.helpOpen ? ""
      : this.pfocus && browsing ? "Enter open / enter folder · h up"
      : this.pfocus && pv.md && !this.raw ? "e raw (keys scroll)"
      : this.pfocus ? (pv.md ? "e raw" : "")
      : browsing ? "Ctrl+L browse folder"
      : pv.md && !this.raw ? "Ctrl+L preview · Ctrl+E raw" : "Ctrl+L preview" + (pv.md ? " · Ctrl+E raw" : "");
    const topHint = this.helpOpen ? "" : this.mode === "dirs" ? "Enter shell · Ctrl+T tab" : "Enter split · Ctrl+T tab · Ctrl+O other app";
    const caption = (text) => div().text_size(10).font_medium().text_color(t.accent).child(text.toUpperCase());
    return v_flex()
      .id("file-find")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        const k = e.key;
        const ctrl = e.modifiers.control;
        if (!this.pfocus && dictate(e, cx, this.input)) return;
        if (k === "escape") return closeOverlay(props().overlay);
        if (this.helpOpen) { this.helpOpen = false; cx.stop_propagation(); cx.notify(); return; }
        // `?` only from the preview: in the search box it is typed text.
        if (this.pfocus && (k === "?" || (k === "/" && e.modifiers.shift))) { this.helpOpen = true; this.gPending = false; cx.stop_propagation(); cx.notify(); return; }
        if (this.pfocus) {
          const shift = e.modifiers.shift;
          const g = this.gPending;
          this.gPending = false;
          const browse = this.mode === "dirs" && this.pvLines.dir;
          if (k === "tab" || k === "/" || k === "i" || (ctrl && (k === "h" || k === "l"))) this.focusPv(false);
          else if (browse && (k === "j" || k === "down" || (ctrl && k === "j"))) this.moveSel(1);
          else if (browse && (k === "k" || k === "up" || (ctrl && k === "k"))) this.moveSel(-1);
          else if (browse && (k === "d" || (ctrl && k === "d"))) this.moveSel(PV_HALF);
          else if (browse && (k === "u" || (ctrl && k === "u"))) this.moveSel(-PV_HALF);
          else if (browse && (k === "space" || k === " " || k === "pagedown" || (ctrl && k === "f"))) this.moveSel(PV_PAGE);
          else if (browse && (k === "pageup" || (ctrl && k === "b"))) this.moveSel(-PV_PAGE);
          else if (browse && k === "g" && !shift) { if (g) { this.dsel = 0; this.pvOff = 0; } else this.gPending = true; }
          else if (browse && (k === "G" || (k === "g" && shift))) this.moveSel(1e9);
          else if (browse && (k === "enter" || k === "l")) this.openEntry(false, cx);
          else if (browse && ctrl && k === "t") this.openEntry(true, cx);
          else if (browse && ((ctrl && k === "o") || k === "o")) this.openEntry(false, cx, true);
          else if (browse && (k === "h" || k === "backspace" || k === "-")) this.upDir(cx);
          else if (k === "j" || k === "down" || (ctrl && k === "j")) this.scrollPv(1);
          else if (k === "k" || k === "up" || (ctrl && k === "k")) this.scrollPv(-1);
          else if (k === "d" || (ctrl && k === "d")) this.scrollPv(PV_HALF);
          else if (k === "u" || (ctrl && k === "u")) this.scrollPv(-PV_HALF);
          else if (k === "space" || k === " " || k === "pagedown" || (ctrl && k === "f")) this.scrollPv(PV_PAGE);
          else if (k === "pageup" || (ctrl && k === "b")) this.scrollPv(-PV_PAGE);
          else if (k === "g" && !shift) { if (g) this.pvOff = 0; else this.gPending = true; }
          else if (k === "home") this.pvOff = 0;
          else if (k === "G" || (k === "g" && shift) || k === "end") this.pvOff = 1e9;
          else if (k === "e") this.raw = !this.raw;
          else if (k === "enter") this.open(false);
          else if (ctrl && k === "t") this.open(true);
          else if ((ctrl && k === "o") || k === "o") this.open(false, true);
          else return;
          cx.stop_propagation();
          cx.notify();
          return;
        }
        if ((k === "down" || (ctrl && k === "j")) && rows.length) this.at = (this.at + 1) % rows.length;
        else if ((k === "up" || (ctrl && k === "k")) && rows.length) this.at = (this.at + rows.length - 1) % rows.length;
        else if (k === "tab" || (ctrl && k === "l")) this.focusPv(true);
        else if (k === "pagedown") this.scrollPv(PV_PAGE);
        else if (k === "pageup") this.scrollPv(-PV_PAGE);
        else if (ctrl && k === "e") this.raw = !this.raw;
        else if (ctrl && k === "t") this.open(true);
        else if (ctrl && k === "o") this.open(false, true);
        else if (ctrl && (k === "d" || k === "f")) {
          const mode = k === "d" ? "dirs" : "files";
          if (mode !== this.mode) { this.mode = mode; this.reload(cx); }
        } else if (ctrl && k === "r") {
          this.scope = this.scope === "repo" ? "here" : "repo";
          this.reload(cx);
        } else return;
        this.syncPreview(cx);
        cx.stop_propagation();
        cx.notify();
      })
      .size_full()
      .min_h(0)
      .rounded(10)
      .overflow_hidden()
      .border_1()
      .border_color(t.border)
      .bg(t.background)
      .text_size(13)
      .child(
        h_flex().h(30).flex_none().pr(10).items_center().border_b(1).border_color(t.border)
          .child(tab("ff-files", "Files", "Ctrl+F", this.mode === "files", (cx) => this.setMode("files", cx), true))
          .child(tab("ff-dirs", "Dirs", "Ctrl+D", this.mode === "dirs", (cx) => this.setMode("dirs", cx)))
          .child(tab("ff-scope", this.scope === "repo" ? "Repo" : "Here", "Ctrl+R", false, (cx) => this.toggleScope(cx)))
          .child(div().flex_1().min_w(0).truncate().px(10).text_size(12).text_color(t.dim).child((this.base() ?? "").replace(/^\/home\/[^/]+/, "~")))
          .when(Boolean(topHint), (e) => e.child(keyHints(topHint, t)))
          .when(this.helpOpen, (e) => e.child(div().text_size(12).text_color(t.dim).mr(6).child("back")))
          .when(this.pfocus || this.helpOpen, (e) => e.child(div().pl(this.helpOpen ? 0 : 14).flex().items_center().child(keyChip("?", t)))),
      )
      .when(this.helpOpen, (e) => e.child(h_flex().flex_1().min_h(0).items_start().gap(28).p(18).children([HELP.slice(0, 2), HELP.slice(2)].map((col, ci) =>
        v_flex().id(`help-${ci}`).flex_1().min_w(0).h_full().min_h(0).gap(14).overflow_y_scrollbar().children(col.map(([title, rows]) =>
          v_flex().gap(6).flex_none().child(caption(title)).children(rows.map(([keys, text]) =>
            h_flex().gap(10).items_start().child(div().w(170).flex_none().flex().flex_wrap().gap(4).children(keys.split(" · ").map((kk) => keyChip(kk, t))))
              .child(div().flex_1().min_w(0).text_size(12).text_color(t.muted).child(text))))))))))
      .when(!this.helpOpen, (e) => e.child(
        v_flex().flex_1().min_h(0).p(14).gap(10)
          .child(Input.new(this.input).h(36).px(10).rounded(9).border_1().border_color(t.accent).bg(t.raised).text_size(12.8).text_color(t.foreground))
          .child(
            h_flex().gap(12).items_center()
              .child(div().w(440).flex_shrink(0).text_size(11).text_color(t.dim).child(`${rows.length}${rows.length >= MAX_SHOWN ? "+" : ""} ${this.mode === "files" ? "files" : "dirs"}`))
              .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.muted).child((rows[this.at] ?? "") + (this.mode === "dirs" ? this.dsub : "")))
              .child(keyHints(hint, t)),
          )
      .child(
        h_flex().flex_1().min_h(0).gap(12).items_stretch()
          .child(
            v_flex()
              .w(440)
              .flex_shrink(0)
              .h_full()
              .min_h(0)
              .gap(1)
              .overflow_y_scrollbar()
              .children(
                rows.length
                  ? rows.map((f, i) =>
                      h_flex()
                        .id("ff-" + i)
                        .h(26)
                        .px(10)
                        .items_center()
                        .rounded(7)
                        .bg(i === this.at ? t.selected : "#00000000")
                        .text_color(i === this.at ? t.foreground : t.muted)
                        .child(div().min_w(0).truncate().child(f))
                        .hover((s) => s.bg(t.hover))
                        .on_click(() => { this.at = i; this.open(false); }),
                    )
                  : [div().text_color(t.dim).child(this.status || "No match.")],
              ),
          )
          .child(
            div().flex_1().min_w(0).min_h(0).h_full().relative().rounded(10).overflow_hidden().border_1().border_color(this.pfocus ? t.accent : t.border).bg(t.background)
              .font_family(settings().font_family ?? "JetBrains Mono").text_size(14).text_color(t.muted)
              .child(
                v_flex().size_full().min_h(0)
                  .child(
                    (pv.md && !this.raw)
                      ? div().flex_1().min_h(0).relative()
                          .child(list("ff-mdl-" + this.pvKey, 1, () => "md", () => div().w_full().px(14).py(8).text_color(t.muted).child(TextView.markdown("ff-md-" + this.pvKey, pv.md).text_color(t.muted))).size_full())
                          .child(Scrollbar.vertical("ff-mdl-" + this.pvKey).absolute().inset_0())
                      : pv.length
                        ? v_flex().flex_1().min_h(0).overflow_hidden().py(6)
                            .on_scroll_wheel((e, cx) => { const dy = e.delta_lines?.y ?? e.delta.y; if (dy) { this.scrollPv(dy < 0 ? 3 : -3); cx.notify(); } })
                            .children(pv.slice(off, off + PV_SHOWN).map((l, n) => div().w_full().flex_none().px(10).rounded(4).when(this.pfocus && browsing && off + n === this.dsel, (e) => e.bg(t.selected).text_color(t.accent)).child(l || " ")))
                        : div().px(10).py(6).text_color(t.dim).child(this.pvKey ? "Loading…" : ""),
                  ),
              ),
          ),
      ))
    );
  }
}
