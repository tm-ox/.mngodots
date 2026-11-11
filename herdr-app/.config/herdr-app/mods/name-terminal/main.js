// Names a terminal (label "pname", shown in the parked list). Opened with props { terminal, value }.
// Enter saves, an empty name clears it, Esc cancels.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { hc, props, closeOverlay, theme, exec } from "herdr";

// Ctrl+Shift+V (what voice-input.sh sends to herdr-app, which it treats as a terminal): a text box only knows Ctrl+V, so paste the clipboard in here.
const dictate = (e, cx, box, single = true) => {
  if (!(e.modifiers?.control && e.modifiers?.shift && String(e.key).toLowerCase() === "v") || !box) return false;
  exec("wl-paste", ["-n"]).then((r) => { if (r.code === 0 && r.stdout) { box.replace(single ? String(r.stdout).replace(/\r?\n/g, " ") : String(r.stdout)); box.focus(); } });
  cx.stop_propagation(); return true;
};

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

export default class NameTerminal extends View {
  init(_props, cx) {
    this.text = props()?.value ?? "";
    this.input = InputState.new({ value: this.text });
    if (this.text) this.input.set_selected_range({ start: 0, end: this.text.length });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); cx.notify(); });
    this.input.on("submit", () => this.submit());
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  submit() {
    const p = props();
    closeOverlay(p.overlay);
    hc(["label", p.terminal, `pname=${this.text.trim()}`]);
  }

  render() {
    const t = theme();
    return v_flex().id("name-terminal").track_focus(this.handle)
      .on_key_down((e, cx) => { if (dictate(e, cx, this.input)) return; if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); } })
      .w_full().min_h(0).rounded(10).overflow_hidden().border_1().border_color(t.border).bg(t.background).text_size(13).text_color(t.foreground)
      .child(header("Name terminal", "Enter save · Esc", t))
      .child(
        v_flex().p(14).gap(8)
          .child(div().text_size(11).text_color(t.dim).child("Name (empty clears it)"))
          .child(Input.new(this.input).h(36).px(10).rounded(9).border_1().border_color(t.accent).bg(t.raised).text_size(12.8).text_color(t.foreground)),
      );
  }
}
