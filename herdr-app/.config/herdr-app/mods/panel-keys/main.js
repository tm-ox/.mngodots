// Keyboard control for the right-hand side panel (stack "panel-body": Files, Schedules, ...).
// keys.json: "panel-keys.toggle" (show/hide), "panel-keys.next" / "panel-keys.prev" (cycle the panel tabs; opens the
// panel if hidden), and "panel-keys.<id>" (open that tab, again closes the panel), e.g. files, sched, changes.
// State is read from the live layout, so mouse clicks on the tab-bar buttons never drift it.

import { View, div } from "gpui-kit";
import { run, nextCommand, layout, spaces, shared, focused } from "herdr";

// Leave a side panel. A panel focused by handle.focus() (keys, toggle) leaves the host's focus context on the terminal pane it
// came from, so pane.go left would be relative to that pane and do nothing: focus that pane directly. When the host itself
// moved onto the panel (pane.go), `focused().pane` is null and pane.go works as usual.
const inPanelNow = () => [...FOCUSABLE].some((m) => shared("pf:" + m)) || (stamp > left && Date.now() - stamp < 700);
const leavePanel = (direction) => { token++; left = Date.now(); const f = focused(); if (direction === "left" && f?.pane) run("pane.focus", { pane: f.pane }); else run("pane.go", { direction }); };
const STACK = "panel-body";
const NARROW = 368, WIDE = 1000;
let before = NARROW; // the width the panel had before Ctrl+Shift+Q widened it; collapsing returns to exactly that
// Panel mods that take the keyboard (mod.json "focusable": true, "focus" command): opened or switched to by these keys,
// they are focused right away, so Esc leaves and j/k etc. work at once. Add a mod name here when it becomes focusable.
let token = 0, stamp = 0, left = 0; // key counter, last time we focused a panel, last time we left it (the panel flag lags up to 250 ms)
const SKIP = new Set(["sched"]);
const FOCUSABLE = new Set(["inbox-tm", "sched-tm", "files-tm"]);

function find(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const c of node.children ?? []) {
    const r = find(c, id);
    if (r) return r;
  }
  return null;
}

export default class PanelKeys extends View {
  init(_props, cx) {
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        const root = layout(), panel = find(root, "panel"), body = find(root, STACK);
        const ids = (body?.children ?? []).map((x) => x.id), visible = Boolean(panel) && !panel.hidden, active = body?.active ?? ids[0];
        if (!ids.length) continue;
        const modOf = (id) => (body.children.find((x) => x.id === id)?.content?.mod) ?? "";
        // Focus the panel mod now; retry once only if it still doesn't hold the keyboard, and never after a newer key (the old
        // blind 150 ms + 500 ms refocus stole focus back after Alt+H had left the panel).
        const focusSoon = (id) => { const m = modOf(id); if (!FOCUSABLE.has(m)) return; const t = ++token; stamp = Date.now(); run(m + ".focus"); cx.timer.after(200, () => { if (t === token && !shared("pf:" + m)) run(m + ".focus"); }); };
        const open = (child) => { run("layout.select", { stack: STACK, child }); run("layout.show", { id: "panel" }); focusSoon(child); };
        // Ctrl+Shift+L / H keep cycling tabs; past the last tab, L moves into the open side panel, and H leaves the panel
        // back to the tab it sits beside. Panels publish shared("pf:<mod>") while they hold the keyboard.
        if (c === "tabnext" || c === "tabprev") {
          const inPanel = inPanelNow();
          const tabs = spaces().find((x) => x.active)?.tabs ?? [], last = tabs.length > 0 && tabs[tabs.length - 1].active;
          if (c === "tabprev") { if (inPanel) leavePanel("left"); else run("tab.prev"); }
          else if (!inPanel && last && visible && FOCUSABLE.has(modOf(active))) { const m = modOf(active); stamp = Date.now(); run(m + ".focus"); }
          else run("tab.next");
          continue;
        }
        // Alt+H / Alt+Left and Alt+L / Alt+Right: global keys reach the host before a panel's own handler, so a key-focused panel never saw
        // them. Inside the panel, Alt+L steps to the next panel tab (stays on the last), Alt+H to the previous one, and Alt+H on the first
        // tab leaves the panel back to the pane beside it. Outside the panel they are plain pane.go.
        if (c === "left" || c === "right") {
          const inPanel = inPanelNow();
          if (!inPanel) { run("pane.go", { direction: c }); continue; }
          const cyc = ids.filter((x) => !SKIP.has(x)), i = cyc.indexOf(active);
          if (c === "right") { if (i >= 0 && i < cyc.length - 1) open(cyc[i + 1]); }
          else if (i > 0) open(cyc[i - 1]);
          else leavePanel("left");
          cx.notify();
          continue;
        }
        // Ctrl+Shift+Q: widen the panel (WIDE px) or back to the width it had before (NARROW px if unknown); opens the panel first if hidden. layout.resize needs size within min/max (280..1100).
        if (c === "wide") { const w = panel?.size?.px ?? NARROW, isWide = w >= WIDE - 20; if (!isWide) before = w; if (!visible) run("layout.show", { id: "panel" }); run("layout.resize", { id: "panel", px: isWide ? before : WIDE }); cx.notify(); continue; }
        if (c === "toggle") { if (visible) run("layout.hide", { id: "panel" }); else open(active); }
        else if (c === "next" || c === "prev") {
          if (!visible) { open(active); continue; }
          const cyc = ids.filter((x) => !SKIP.has(x)), i = cyc.indexOf(active); // Schedules is opened from the Inbox section
          if (!cyc.length) continue;
          open(i < 0 ? cyc[0] : cyc[(i + (c === "next" ? 1 : cyc.length - 1)) % cyc.length]);
        } else if (ids.includes(c)) {
          if (visible && active === c) run("layout.hide", { id: "panel" });
          else open(c);
        }
        cx.notify();
      }
    });
  }

  render() {
    return div().size_0();
  }
}
