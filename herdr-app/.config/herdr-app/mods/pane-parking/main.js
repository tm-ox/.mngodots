// Park the focused pane (its terminal keeps running) and bring parked terminals back.
// keys.json: "pane-parking.park", "pane-parking.list" (opens the parked list),
// "pane-parking.name" (name the focused terminal), "pane-parking.tab-left|tab-right"
// and "pane-parking.space-up|space-down" (reorder the shown tab / space),
// "pane-parking.panel-wide" (toggle the right panel between its normal and a wide size).

import { View, div } from "gpui-kit";
import { hc, panes, playSound, run, nextCommand, focused, openOverlay, notify, terminals, spaces } from "herdr";

// herdr-app's own done/blocked sounds don't reach the audio device here, so play them from the
// status changes. Clips start with silence: the onboard sink swallows the first moments after idle.
const SOUNDS = {
  done: "/home/tm/.mngodots/herdr/.config/herdr/sounds/done.mp3",
  blocked: "/home/tm/.mngodots/herdr/.config/herdr/sounds/request.mp3",
};

export default class PaneParking extends View {
  init(_props, cx) {
    this.wide = false;
    this.seen = null;
    cx.timer.every(1000, () => {
      const now = new Map();
      for (const p of panes()) if (p.terminal && p.status) now.set(p.terminal, p.status);
      if (this.seen) {
        for (const [t, st] of now) {
          if ((st === "done" || st === "blocked") && this.seen.get(t) !== st) playSound(SOUNDS[st]);
        }
      }
      this.seen = now;
    });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "sound-test") {
          playSound(SOUNDS.done);
        } else if (c === "park") {
          const terminal = focused()?.terminal;
          if (terminal) run("terminal.park", { terminal });
          else notify({ title: "Nothing to park", body: "The focused pane is not a terminal.", level: "warning", timeout: 3000 });
        } else if (c === "send-next" || c === "send-prev") {
          // Park the focused terminal, show the neighbouring tab, unpark it right of that tab's focus.
          const terminal = focused()?.terminal;
          const sp = spaces().find((x) => x.active);
          const tab = sp?.tabs?.find((x) => x.active);
          const target = tab && sp.tabs.find((x) => x.index === tab.index + (c === "send-next" ? 1 : -1));
          if (terminal && target) {
            run("terminal.park", { terminal });
            // park finishes in the background; keep only works once the pane is gone.
            for (let i = 0; i < 20 && panes().some((p) => p.terminal === terminal); i++) await hc(["exec", "sleep", "0.15"]);
            run("tab.select", { id: target.id });
            await hc(["exec", "sleep", "0.15"]);
            run("terminal.keep", { terminal, place: "right" });
          } else notify({ title: "Nowhere to send", body: "No terminal here or no tab that side.", level: "warning", timeout: 3000 });
        } else if (c === "tab-left" || c === "tab-right") {
          const sp = spaces().find((x) => x.active);
          const tab = sp?.tabs?.find((x) => x.active);
          const index = tab ? tab.index + (c === "tab-left" ? -1 : 1) : 0;
          if (tab && index >= 1 && index <= sp.tabs.length) run("tab.move", { id: tab.id, index });
        } else if (c === "space-up" || c === "space-down") {
          const all = spaces();
          const sp = all.find((x) => x.active);
          const index = sp ? sp.index + (c === "space-up" ? -1 : 1) : 0;
          if (sp && index >= 1 && index <= all.length) run("space.move", { id: sp.id, index });
        } else if (c === "panel-wide") {
          this.wide = !this.wide;
          run("layout.show", { id: "panel" });
          run("layout.resize", { id: "panel", px: this.wide ? 800 : 368 });
        } else if (c === "name") {
          const terminal = focused()?.terminal;
          if (terminal) {
            const value = terminals().find((x) => x.address === terminal)?.labels?.pname ?? "";
            openOverlay({ mod: "name-terminal", kind: "dialog", width: 420, props: { terminal, value } });
          }
        } else if (c === "list") {
          openOverlay({ mod: "parked", kind: "dialog", width: 560, height: 320 });
        }
        cx.notify();
      }
    });
  }

  render() {
    return div().size_0();
  }
}
