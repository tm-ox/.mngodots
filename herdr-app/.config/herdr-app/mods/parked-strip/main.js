// Sidebar strip: shows how many terminals are parked (running without a pane) and their names.
// Click opens the parked list. Blank when nothing is parked.

import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { terminals, panes, theme, openOverlay } from "herdr";

export default class ParkedStrip extends View {
  render() {
    const t = theme();
    const shown = new Set(panes().map((p) => p.terminal).filter(Boolean));
    const parked = terminals().filter((x) => x.state === "live" && !x.parent && !shown.has(x.address));
    if (!parked.length) return div();
    const names = parked.map((r) => r.labels?.pname || r.program?.name || r.agent || r.address).join(", ");
    return h_flex()
      .id("parked-strip")
      .size_full()
      .px(14)
      .gap(8)
      .items_center()
      .text_size(11.5)
      .text_color(t.muted)
      .cursor_pointer()
      .hover((s) => s.opacity(0.85))
      .on_click(() => openOverlay({ mod: "parked", kind: "dialog", width: 560, height: 320 }))
      .child(div().flex_none().text_color(t.accent).child("⏸ " + parked.length + " parked"))
      .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(names));
  }
}
