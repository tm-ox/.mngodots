// Parked terminals: running, but without a pane. Up/Down choose, Enter brings it back
// as a split to the right of the focused pane, T brings it back as a new tab, P peeks at it, X kills it, Esc closes.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { terminals, panes, run, theme, props, closeOverlay, openOverlay } from "herdr";

// Dialog look shared with file-find / changes-float / devservers: card, 30px header (title + key-chip hints).
const keyChip = (text, t) => div().px(6).h(18).min_w(18).flex().items_center().justify_center().flex_none().rounded(5).border_1().border_color(t.input ?? t.border).bg(t.raised).text_size(11).font_medium().text_color(t.muted).child(text);
const keyHints = (text, t) => h_flex().gap(14).items_center().min_w(0).overflow_hidden().children(text.split(" · ").map((seg) => {
  const w = seg.split(" "); let n = 1;
  while (n < w.length && /^[A-Z]$/.test(w[n])) n++;
  const label = w.slice(n).join(" ");
  return h_flex().gap(6).items_center().flex_none().child(keyChip(w.slice(0, n).join(" "), t)).when(Boolean(label), (e) => e.child(div().text_size(12).text_color(t.dim).child(label)));
}));
const header = (title, hint, t, helpOpen) => h_flex().h(30).flex_none().pr(10).items_center().border_b(1).border_color(t.border)
  .child(div().h_full().pl(12).pr(6).flex().items_center().flex_none().text_size(12).font_medium().text_color(t.accent).child(title))
  .child(div().flex_1())
  .when(Boolean(hint), (e) => e.child(keyHints(hint, t)))
  .when(helpOpen, (e) => e.child(div().text_size(12).text_color(t.dim).mr(6).child("back")))
  .child(div().pl(helpOpen ? 0 : 14).flex().items_center().child(keyChip("?", t)));

const HELP = [
  ["Parked list", [
    ["↑ ↓ · J K", "Move the selection."],
    ["Enter", "Bring the terminal back as a split right of the focused pane."],
    ["T", "Bring it back as a new tab."],
    ["P", "Peek at it without moving it."],
    ["X · Delete", "Kill it, after a confirmation."],
  ]],
  ["Anywhere", [
    ["?", "This help. Any key closes it."],
    ["Esc", "Closes this dialog."],
  ]],
];

export default class Parked extends View {
  init(_props, cx) {
    this.at = 0;
    this.helpOpen = false;
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(300, () => this.handle.focus());
  }

  rows() {
    const shown = new Set(panes().map((p) => p.terminal).filter(Boolean));
    return terminals().filter((x) => x.state === "live" && !x.parent && !shown.has(x.address));
  }

  close() {
    closeOverlay(props().overlay);
  }

  render(cx) {
    const t = theme();
    const rows = this.rows();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    const label = (r) => r.labels?.pname || r.program?.name || r.agent || r.address;
    return v_flex()
      .id("parked")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        const k = e.key;
        const r = rows[this.at];
        if (k === "escape") return this.close();
        if (this.helpOpen) { this.helpOpen = false; cx.stop_propagation(); cx.notify(); return; }
        if (k === "?" || (k === "/" && e.modifiers?.shift)) { this.helpOpen = true; cx.stop_propagation(); cx.notify(); return; }
        if ((k === "down" || k === "j") && rows.length) this.at = (this.at + 1) % rows.length;
        else if ((k === "up" || k === "k") && rows.length) this.at = (this.at + rows.length - 1) % rows.length;
        else if (k === "enter" && r) {
          this.close();
          run("terminal.keep", { terminal: r.address, place: "right" });
        } else if (k === "t" && r) {
          this.close();
          run("terminal.keep", { terminal: r.address, place: "tab" });
        } else if ((k === "x" || k === "delete") && r) {
          this.close();
          openOverlay({ mod: "confirm", kind: "dialog", width: 420, props: { title: "Kill " + label(r) + "?", detail: "Ends the terminal and whatever is running in it.", command: { name: "terminal.kill", args: { terminal: r.address } } } });
        } else if (k === "p" && r) {
          this.close();
          run("terminal.peek", { terminal: r.address });
        } else return;
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
      .child(header("Parked terminals", this.helpOpen ? "" : "Enter split · T tab · P peek · X kill", t, this.helpOpen))
      .when(this.helpOpen, (e) => e.child(
        v_flex().id("pk-help").flex_1().min_h(0).p(18).gap(14).overflow_y_scrollbar().children(HELP.map(([title, rows]) =>
          v_flex().gap(6).flex_none().child(div().text_size(10).font_medium().text_color(t.accent).child(title.toUpperCase())).children(rows.map(([keys, text]) =>
            h_flex().gap(10).items_start().child(div().w(110).flex_none().flex().flex_wrap().gap(4).children(keys.split(" · ").map((kk) => keyChip(kk, t))))
              .child(div().flex_1().min_w(0).text_size(12).text_color(t.muted).child(text)))))),
      ))
      .when(!this.helpOpen, (e) => e.child(
        v_flex()
          .flex_1()
          .min_h(0)
          .p(14)
          .gap(2)
          .overflow_y_scrollbar()
          .children(
            rows.length
              ? rows.map((r, i) =>
                  h_flex()
                    .id("pk-" + r.address)
                    .h(28)
                    .flex_none()
                    .px(10)
                    .gap(10)
                    .items_center()
                    .rounded(7)
                    .bg(i === this.at ? t.selected : "#00000000")
                    .hover((s) => s.bg(t.hover))
                    .child(div().w(56).flex_none().text_size(12).text_color(t.accent).child(r.address))
                    .child(div().flex_1().min_w(0).truncate().text_color(i === this.at ? t.foreground : t.muted).child(label(r)))
                    .child(div().max_w(240).truncate().text_size(11).text_color(t.dim).child((r.cwd ?? "").replace(/^\/home\/[^/]+/, "~"))),
                )
              : [div().text_color(t.dim).child("Nothing is parked.")],
          ),
      ));
  }
}
