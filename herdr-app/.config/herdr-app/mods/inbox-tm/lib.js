import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { run, exec, focused } from "herdr";

// Leave a side panel. A panel focused by handle.focus() (keys, toggle) leaves the host's focus context on the terminal pane it
// came from, so pane.go left would be relative to that pane and do nothing: focus that pane directly. When the host itself
// moved onto the panel (pane.go), `focused().pane` is null and pane.go works as usual.
export const leavePanel = (direction) => { const f = focused(); if (direction === "left" && f?.pane) run("pane.focus", { pane: f.pane }); else run("pane.go", { direction }); };

// Ctrl+Shift+V (what voice-input.sh sends to herdr-app, which it treats as a terminal): a text box only knows Ctrl+V, so paste the clipboard in here.
export const dictate = (e, cx, box, single = true) => {
  if (!(e.modifiers?.control && e.modifiers?.shift && String(e.key).toLowerCase() === "v") || !box) return false;
  exec("wl-paste", ["-n"]).then((r) => { if (r.code === 0 && r.stdout) { box.replace(single ? String(r.stdout).replace(/\r?\n/g, " ") : String(r.stdout)); box.focus(); } });
  cx.stop_propagation(); return true;
};

export const clean = (s, max = 6000) => String(s ?? "").replace(/\r/g, "").replace(/\t/g, "  ").replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, "").slice(0, max);
export const keyChip = (text, t) => div().px(6).h(18).min_w(18).flex().items_center().justify_center().flex_none().rounded(5).border_1().border_color(t.input ?? t.border).bg(t.raised).text_size(11).font_medium().text_color(t.muted).child(text);
export const keyHints = (text, t) => h_flex().gap(14).items_center().min_w(0).overflow_hidden().children(text.split(" · ").map((seg) => {
  const w = seg.split(" "); let n = 1;
  while (n < w.length && /^[A-Z]$/.test(w[n])) n++;
  const label = w.slice(n).join(" ");
  return h_flex().gap(6).items_center().flex_none().child(keyChip(w.slice(0, n).join(" "), t)).when(Boolean(label), (e) => e.child(div().text_size(12).text_color(t.dim).child(label)));
}));
