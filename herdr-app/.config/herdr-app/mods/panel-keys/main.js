// Keyboard control for the right-hand side panel (stack "panel-body": Files, Schedules, ...).
// keys.json: "panel-keys.toggle" (show/hide), "panel-keys.next" / "panel-keys.prev" (cycle the panel tabs; opens the
// panel if hidden), and "panel-keys.<id>" (open that tab, again closes the panel), e.g. files, sched, changes.
// State is read from the live layout, so mouse clicks on the tab-bar buttons never drift it.

import { View, div } from "gpui-kit";
import { run, nextCommand, layout, spaces, shared, focused } from "herdr";

// Leave a side panel. A panel focused by handle.focus() (keys, toggle) leaves the host's focus context on the terminal pane it
// came from, so pane.go left would be relative to that pane and do nothing: focus that pane directly. When the host itself
// moved onto the panel (pane.go), `focused().pane` is null and pane.go works as usual.
const leavePanel = (direction) => { const f = focused(); if (direction === "left" && f?.pane) run("pane.focus", { pane: f.pane }); else run("pane.go", { direction }); };
const STACK = "panel-body";
// Panel mods that take the keyboard (mod.json "focusable": true, "focus" command): opened or switched to by these keys,
// they are focused right away, so Esc leaves and j/k etc. work at once. Add a mod name here when it becomes focusable.
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
        const focusSoon = (id) => { const m = modOf(id); if (FOCUSABLE.has(m)) { cx.timer.after(150, () => run(m + ".focus")); cx.timer.after(500, () => run(m + ".focus")); } };
        const open = (child) => { run("layout.select", { stack: STACK, child }); run("layout.show", { id: "panel" }); focusSoon(child); };
        // Ctrl+Shift+L / H keep cycling tabs; past the last tab, L moves into the open side panel, and H leaves the panel
        // back to the tab it sits beside. Panels publish shared("pf:<mod>") while they hold the keyboard.
        if (c === "tabnext" || c === "tabprev") {
          const inPanel = [...FOCUSABLE].some((m) => shared("pf:" + m));
          const tabs = spaces().find((x) => x.active)?.tabs ?? [], last = tabs.length > 0 && tabs[tabs.length - 1].active;
          if (c === "tabprev") { if (inPanel) leavePanel("left"); else run("tab.prev"); }
          else if (!inPanel && last && visible && FOCUSABLE.has(modOf(active))) { const m = modOf(active); run(m + ".focus"); }
          else run("tab.next");
          continue;
        }
        // Alt+H / Alt+Left: global keys reach the host before a panel's own handler, so a key-focused panel never saw them.
        if (c === "left") { if ([...FOCUSABLE].some((m) => shared("pf:" + m))) leavePanel("left"); else run("pane.go", { direction: "left" }); continue; }
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
