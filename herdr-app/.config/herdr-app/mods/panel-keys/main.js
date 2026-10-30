// Keyboard control for the right-hand Files/Changes panel.
// keys.json: "panel-keys.files", "panel-keys.changes" (open that tab; again closes the panel),
// "panel-keys.switch" (flip tab), "panel-keys.toggle" (show/hide the panel).
// State is tracked here, so a mouse click on the panel can drift it by one press.

import { View, div } from "gpui-kit";
import { run, nextCommand, layout } from "herdr";

const STACK = "panel-body";

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
    this.current = "files";
    this.visible = find(layout(), "panel")?.hidden === false;
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "toggle") {
          this.visible = !this.visible;
          run(this.visible ? "layout.show" : "layout.hide", { id: "panel" });
        } else {
          const child = c === "switch" ? (this.current === "files" ? "changes" : "files") : c;
          if (child !== "files" && child !== "changes") continue;
          if (c !== "switch" && this.visible && this.current === child) {
            this.visible = false;
            run("layout.hide", { id: "panel" });
          } else {
            this.current = child;
            this.visible = true;
            run("layout.show", { id: "panel" });
            run("layout.select", { stack: STACK, child });
          }
        }
        cx.notify();
      }
    });
  }

  render() {
    return div().size_0();
  }
}
