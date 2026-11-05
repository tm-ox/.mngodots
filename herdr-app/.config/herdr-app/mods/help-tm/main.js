// The keybind list (Herdr's prefix+?), grouped, filterable by typing.
// Reads keys.json through keys(); edit keys.json to change any of them.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { keys, props, closeOverlay, theme } from "herdr";

// Dialog look shared with file-find / changes-float / devservers: card, 30px header (title + key-chip hints).
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

const GROUPS = [
  ["spaces", /^space\./],
  ["tabs", /^tab\./],
  ["panes", /^pane\./],
  ["agents", /^agent\./],
  ["terminal", /^terminal\.|^send:/],
  ["window", /./],
];

function label(action) {
  if (action.startsWith("send:")) return "type " + JSON.stringify(action.slice(5));
  const [name, arg] = action.split(":");
  const words = name.replace(/[._]/g, " ");
  return arg ? `${words} ${arg}` : words;
}

export default class Help extends View {
  init(_props, cx) {
    this.filter = "";
    this.input = InputState.new({ placeholder: "Type to filter…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); cx.notify(); });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  render(cx) {
    const t = theme();
    const f = this.filter.toLowerCase();
    const all = keys().filter((k) => !f || k.keys.includes(f) || label(k.action).includes(f));
    const seen = new Set();
    const groups = GROUPS.map(([name, re]) => {
      const rows = all.filter((k) => !seen.has(k) && re.test(k.action) && (seen.add(k) || true));
      return [name, rows];
    }).filter(([, rows]) => rows.length > 0);
    return v_flex()
      .id("help")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") return closeOverlay(props().overlay);
      })
      .size_full()
      .min_h(0)
      .rounded(10)
      .overflow_hidden()
      .border_1()
      .border_color(t.border)
      .bg(t.background)
      .text_size(13)
      .child(header("Keybinds", "Type to filter · Esc", t))
      .child(
        v_flex().flex_1().min_h(0).p(14).gap(10)
          .child(Input.new(this.input).h(36).flex_none().px(10).rounded(9).border_1().border_color(t.accent).bg(t.raised).text_size(12.8).text_color(t.foreground))
          .child(
            v_flex()
              .flex_1()
              .min_h(0)
              .overflow_y_scrollbar()
              .gap(10)
              .children(
                groups.map(([name, rows]) =>
                  v_flex()
                    .gap(2)
                    .child(div().px(10).text_size(12).font_semibold().text_color(t.muted).child(String(name).toUpperCase()))
                    .children(
                      rows.map((k, i) =>
                        h_flex()
                          .h(28)
                          .flex_none()
                          .px(10)
                          .rounded(7)
                          .items_center()
                          .hover((s) => s.bg(t.hover))
                          .child(div().w(190).flex_none().text_size(12).text_color(t.accent).child(k.keys + (k.section !== "global" ? `  (${k.section})` : "")))
                          .child(div().text_color(t.foreground).child(label(k.action))),
                      ),
                    ),
                ),
              ),
          ),
      );
  }
}
