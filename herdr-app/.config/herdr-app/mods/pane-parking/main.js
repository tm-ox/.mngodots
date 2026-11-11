// Park the focused pane (its terminal keeps running) and bring parked terminals back.
// keys.json: "pane-parking.park", "pane-parking.list" (opens the parked list),
// "pane-parking.name" (name the focused terminal), "pane-parking.tab-left|tab-right"
// and "pane-parking.space-up|space-down" (reorder the shown tab / space),
// "pane-parking.next-waiting|prev-waiting" (jump to the next blocked, else finished, agent),
// "pane-parking.panel-wide" (toggle the right panel between its normal and a wide size).

import { View, div } from "gpui-kit";
import { hc, panes, playSound, run, nextCommand, focused, openOverlay, notify, terminals, spaces, agents, shared, setShared } from "herdr";

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
      const fc = focused()?.terminal;
      if (fc && fc !== this.curFocus) { this.prevFocus = this.curFocus; this.curFocus = fc; }
      // When each agent entered its current status (read by the agent switcher for "blocked 12m").
      const since = shared("agent-since") || {}; let chg = false; const live = new Set();
      for (const a of agents()) { live.add(a.address); if (since[a.address]?.status !== a.status) { since[a.address] = { status: a.status, at: Date.now() }; chg = true; } }
      for (const k of Object.keys(since)) if (!live.has(k)) { delete since[k]; chg = true; }
      if (chg) setShared("agent-since", { ...since });
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
        } else if (c === "snooze") {
          // Snooze (again: unsnooze) the focused agent for 30 min: skipped by next-waiting, not counted as "needs you".
          const a = focused()?.terminal, snz = { ...(shared("snoozed") || {}) };
          if (!a) notify({ title: "Nothing to snooze", body: "The focused pane is not an agent.", level: "warning", timeout: 3000 });
          else {
            const on = snz[a] > Date.now();
            if (on) delete snz[a]; else snz[a] = Date.now() + 30 * 60 * 1000;
            for (const k of Object.keys(snz)) if (snz[k] <= Date.now()) delete snz[k];
            setShared("snoozed", snz);
            notify({ title: on ? "Unsnoozed" : "Snoozed 30 min", body: "", level: "info", timeout: 1500 });
          }
        } else if (c === "next-waiting" || c === "prev-waiting") {
          // Alt+N: tour through the agents that need you (blocked first, then done), skipping the one you are on and ones
          // already visited in this tour. Alt+Shift+N: step back through the tour, and from its first stop to where you started.
          // With no tour running, it returns to the previously focused terminal.
          const cur = focused()?.terminal, list = agents(), snz = shared("snoozed") || {}, now = Date.now();
          const go = (addr) => (list.some((a) => a.address === addr) ? run("agent.focus", { terminal: addr }) : run("pane.focus", { terminal: addr }));
          if (c === "next-waiting") {
            if (!this.tour || this.tour[this.tour.length - 1] !== cur) this.tour = [cur];
            const ok = list.filter((a) => !(snz[a.address] > now) && !this.tour.includes(a.address));
            const pool = [...ok.filter((a) => a.status === "blocked"), ...ok.filter((a) => a.status === "done")];
            if (!pool.length) { this.tour = null; notify({ title: "Nothing more waiting", body: "No other agent is blocked or finished.", level: "info", timeout: 2000 }); }
            else { this.tour.push(pool[0].address); go(pool[0].address); }
          } else if (this.tour && this.tour.length > 1 && this.tour[this.tour.length - 1] === cur) {
            this.tour.pop(); go(this.tour[this.tour.length - 1]);
          } else if (this.prevFocus && this.prevFocus !== cur) go(this.prevFocus);
          else notify({ title: "Nowhere to go back", body: "", level: "info", timeout: 1500 });
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
          openOverlay({ mod: "jump-tm", kind: "dialog", width: 780, height: 680, props: { filter: "parked" } }); // the parked mod stays installed, unbound
        }
        cx.notify();
      }
    });
  }

  render() {
    return div().size_0();
  }
}
