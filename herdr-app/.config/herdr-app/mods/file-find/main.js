// Fuzzy find under the focused terminal's repo (git root, else its folder).
// Files mode: Enter edits in vim in a split to the right, Ctrl+T in a new tab.
// Dirs mode: Enter opens a shell there in a split, Ctrl+T in a new tab.
// Ctrl+F files, Ctrl+D dirs, Ctrl+R repo/here scope, Up/Down or Ctrl+J/K move, Esc closes.
// The script engine has a tight time budget, so listing and fuzzy matching run natively
// (fd + fzf --filter through `hc exec`); this file only draws the results.
// .gitignore is respected, except .env* files, which are always included.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { hc, focused, run, theme, props, closeOverlay } from "herdr";

const EDITOR = ["vim"];
const MAX_SHOWN = 100;
const listFile = (base, mode) => `/tmp/herdr-ff-${mode}-${(base ?? ".").replace(/[^A-Za-z0-9]/g, "_")}.list`;
const LIST_SH = 'cd "$1" || exit 1; { fd --type "$2" --hidden --exclude .git; [ "$2" = f ] && fd --type f --hidden --no-ignore --glob ".env*" --exclude .git --exclude node_modules; } | awk \'!s[$0]++\' > "$3.new" && mv "$3.new" "$3"';
const QUERY_SH = 'if [ ! -f "$2" ]; then :; elif [ -z "$1" ]; then head -n ' + MAX_SHOWN + ' "$2"; else fzf -f "$1" < "$2" | head -n ' + MAX_SHOWN + '; fi';

export default class FileFind extends View {
  init(_props, cx) {
    this.rows = [];
    this.q = "";
    this.at = 0;
    this.seq = 0;
    this.mode = "files";
    this.scope = "repo";
    this.status = "Searching…";
    this.here = focused()?.cwd ?? null;
    this.root = this.here;
    this.input = InputState.new({ placeholder: "Find…" });
    this.input.on("change", (_e, cx) => { this.q = this.input.value(); this.at = 0; this.query(cx); });
    this.input.on("submit", () => this.open(false));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["exec", "git", "-C", this.here ?? ".", "rev-parse", "--show-toplevel"]);
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
      await hc(["exec", "sh", "-c", LIST_SH, "sh", this.base() ?? ".", this.mode === "files" ? "f" : "d", list]);
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
      const r = await hc(["exec", "sh", "-c", QUERY_SH, "sh", this.q, this.list]);
      if (seq !== this.seq) return;
      this.rows = r.stdout.split("\n").filter(Boolean);
      this.status = this.rows.length ? "" : this.listed ? "No match." : "Searching…";
    } catch (e) {
      if (seq !== this.seq) return;
      this.status = "search failed: " + String(e);
    }
    cx.notify();
  }

  open(tab) {
    const item = this.rows[this.at];
    if (!item) return;
    closeOverlay(props().overlay);
    const base = this.base();
    const place = tab ? "tab" : "right";
    const name = item.replace(/\/$/, "").split("/").pop();
    if (this.mode === "files") run("terminal.open", { argv: [...EDITOR, item], folder: base ?? undefined, place, name });
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
    const chip = (text, on) => div().px(8).py(2).rounded(6).text_size(11).bg(on ? t.raised : "#00000000").text_color(on ? t.foreground : t.dim).child(text);
    return v_flex()
      .id("file-find")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        const k = e.key;
        const ctrl = e.modifiers.control;
        if (k === "escape") return closeOverlay(props().overlay);
        if ((k === "down" || (ctrl && k === "j")) && rows.length) this.at = (this.at + 1) % rows.length;
        else if ((k === "up" || (ctrl && k === "k")) && rows.length) this.at = (this.at + rows.length - 1) % rows.length;
        else if (ctrl && k === "t") this.open(true);
        else if (ctrl && (k === "d" || k === "f")) {
          const mode = k === "d" ? "dirs" : "files";
          if (mode !== this.mode) { this.mode = mode; this.reload(cx); }
        } else if (ctrl && k === "r") {
          this.scope = this.scope === "repo" ? "here" : "repo";
          this.reload(cx);
        } else return;
        cx.stop_propagation();
        cx.notify();
      })
      .w_full()
      .min_h(0)
      .p(18)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Find")).child(div().text_size(11).text_color(t.dim).child("Enter split · Ctrl+T tab · Esc")))
      .child(Input.new(this.input).h(36).px(10).rounded(9).border_1().border_color(t.accent).bg(t.background).text_size(12.8).text_color(t.foreground))
      .child(
        h_flex().gap(6).items_center()
          .child(chip("Files  Ctrl+F", this.mode === "files"))
          .child(chip("Dirs  Ctrl+D", this.mode === "dirs"))
          .child(chip((this.scope === "repo" ? "Repo" : "Here") + "  Ctrl+R", true))
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child((this.base() ?? "").replace(/^\/home\/[^/]+/, "~"))),
      )
      .child(
        v_flex()
          .h(Math.min(360, 8 + Math.max(rows.length, 1) * 27))
          .min_h(0)
          .flex_shrink(1)
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
                    .bg(i === this.at ? t.raised : "#00000000")
                    .text_color(i === this.at ? t.foreground : t.muted)
                    .child(div().min_w(0).truncate().child(f))
                    .on_click(() => { this.at = i; this.open(false); }),
                )
              : [div().text_color(t.dim).child(this.status || "No match.")],
          ),
      );
  }
}
