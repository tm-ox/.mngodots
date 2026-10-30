// Parked terminals: running, but without a pane. Up/Down choose, Enter brings it back
// as a split to the right of the focused pane, P peeks at it, X kills it, Esc closes.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { terminals, panes, run, theme, props, closeOverlay, openOverlay } from "herdr";

export default class Parked extends View {
  init(_props, cx) {
    this.at = 0;
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
        if ((k === "down" || k === "j") && rows.length) this.at = (this.at + 1) % rows.length;
        else if ((k === "up" || k === "k") && rows.length) this.at = (this.at + rows.length - 1) % rows.length;
        else if (k === "enter" && r) {
          this.close();
          run("terminal.keep", { terminal: r.address, place: "right" });
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
      .p(18)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Parked terminals")).child(div().text_size(11).text_color(t.dim).child("↑↓ / J K  Enter bring back  P peek  X kill  Esc")))
      .child(
        v_flex()
          .flex_1()
          .min_h(0)
          .gap(2)
          .overflow_y_scrollbar()
          .children(
            rows.length
              ? rows.map((r, i) =>
                  h_flex()
                    .id("pk-" + r.address)
                    .h(30)
                    .px(10)
                    .gap(10)
                    .items_center()
                    .rounded(7)
                    .bg(i === this.at ? t.raised : "#00000000")
                    .text_color(i === this.at ? t.foreground : t.muted)
                    .child(div().w(60).text_color(t.dim).child(r.address))
                    .child(div().flex_1().min_w(0).truncate().child(label(r)))
                    .child(div().max_w(240).truncate().text_color(t.dim).child((r.cwd ?? "").replace(/^\/home\/[^/]+/, "~"))),
                )
              : [div().text_color(t.dim).child("Nothing is parked.")],
          ),
      );
  }
}
