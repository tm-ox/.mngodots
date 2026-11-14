// Schedule editor for the Inbox panel: replaces the list until Esc (like the approval and draft views). Days, times, agent prompt or
// command, folder, note, cron preview and run history with output. Everything goes through `hcron` on tm-serve; nothing is written
// locally. Derived from the sched-tm side panel. The host (main.js) keeps the job list and the toggle / run-now keys.
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { exec, notify, pickFolder } from "herdr";
import { leavePanel } from "./lib.js";

const HOST = "tm-serve";
const DAYS = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]];
const MODELS = ["haiku", "sonnet", "opus"];
const pad = (n) => String(n).padStart(2, "0");

export async function hcron(args) {
  const r = await exec("sh", ["-c", '"$HOME/.local/bin/hcron" "$@"', "hcron", ...args], { on: HOST, timeout: 20000 });
  if (r.code !== 0) throw new Error((r.stderr || r.stdout || "hcron failed").trim().split("\n").pop());
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

// days (set of 0-6, Sun=0) + time <-> cron line
const dowField = (set) => {
  if (set.size === 7) return "*";
  const a = [...set].sort((x, y) => x - y);
  if (a.join() === "1,2,3,4,5") return "1-5";
  if (a.join() === "0,6") return "0,6";
  return a.join(",");
};
function parseSimple(cron) {
  const parts = cron.split(";").map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1) {
    const all = parts.map(parseSimple);
    if (all.some((x) => !x || [...x.days].sort().join() !== [...all[0].days].sort().join())) return null;
    return { times: all.flatMap((x) => x.times).sort((a, b) => a[0] - b[0] || a[1] - b[1]), days: all[0].days };
  }
  const one = parseOne(parts[0] ?? cron);
  return one && { times: [[one.hour, one.min]], days: one.days };
}
function parseOne(cron) {
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5 || !/^\d+$/.test(f[0]) || !/^\d+$/.test(f[1]) || f[2] !== "*" || f[3] !== "*") return null;
  const days = new Set();
  if (f[4] === "*") DAYS.forEach(([, n]) => days.add(n));
  else for (const part of f[4].split(",")) {
    const m = part.match(/^(\d)(?:-(\d))?$/);
    if (!m) return null;
    const a = Number(m[1]) % 7, b = m[2] ? Number(m[2]) : a;
    for (let i = Number(m[1]); i <= b; i++) days.add(i % 7);
  }
  return { min: Number(f[0]), hour: Number(f[1]), days };
}
export function human(cron) {
  const s = parseSimple(cron);
  if (!s) return cron;
  const d = s.days.size === 7 ? "Every day" : [...s.days].sort().join() === "1,2,3,4,5" ? "Weekdays" : [...s.days].sort().join() === "0,6" ? "Weekends"
    : DAYS.filter(([, n]) => s.days.has(n)).map(([l]) => l).join(" ");
  return `${d} ${s.times.map(([h, m]) => pad(h) + ":" + pad(m)).join(", ")}`;
}
export function when(ts) {
  const d = new Date(ts * 1000), now = new Date(), diff = (d - now) / 1000;
  if (diff < 0) return "due";
  if (diff < 3600) return `in ${Math.max(1, Math.round(diff / 60))}m`;
  if (diff < 86400) return `in ${Math.floor(diff / 3600)}h ${Math.round((diff % 3600) / 60)}m`;
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function ago(ts) {
  const s = Math.max(0, Date.now() / 1000 - ts);
  return s >= 86400 ? `${Math.floor(s / 86400)}d ago` : s >= 3600 ? `${Math.floor(s / 3600)}h ago` : s >= 60 ? `${Math.floor(s / 60)}m ago` : "just now";
}
const stamp = (ts) => { const d = new Date(ts * 1000); return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export class SchedView {
  constructor(host) { this.host = host; this.form = null; this.busy = false; this.confirm = false; }

  act(args, cx, done) {
    if (this.busy) return;
    this.busy = true; cx.notify();
    cx.spawn(async (cx) => {
      try { const r = await hcron(args); this.host.loadJobs(cx); done?.(r); }
      catch (e) { notify({ title: "Schedules", body: String(e.message ?? e), level: "error" }); }
      finally { this.busy = false; cx.notify(); }
    });
  }

  close(cx) { this.form = null; this.host.schedv = null; this.host.handle.focus(); this.host.loadJobs(cx); cx.notify(); }

  // The form's fields own the keyboard; only Esc and the Alt+HJKL leave keys are handled here.
  key(e, cx) {
    const k = e.key;
    if (e.modifiers?.alt && ["h", "j", "k", "l"].includes(k)) { leavePanel({ h: "left", j: "down", k: "up", l: "right" }[k]); cx.timer.after(150, (cx) => cx.notify()); cx.stop_propagation(); return; }
    if (k === "escape") { this.close(cx); cx.stop_propagation(); }
  }

  render(t, focused, cx) {
    const f = this.form;
    return v_flex().id("inbox-panel").track_focus(this.host.handle).on_key_down((e, cx) => this.host.key(e, cx)).size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(focused ? t.accent : t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(30).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().id("sched-back").w(20).cursor_pointer().text_color(t.muted).on_click((_e, cx) => this.close(cx)).child("←"))
        .child(div().font_semibold().child(f.isNew ? "New schedule" : f.job.name))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(11).text_color(t.dim).child("Esc back")))
      .child(this.formView(t, cx));
  }

  open(job, cx) {
    const simple = job ? parseSimple(job.cron) : { times: [[6, 0]], days: new Set(DAYS.map(([, n]) => n)) };
    const mk = (placeholder, value) => InputState.new({ placeholder, value: value ?? "" });
    const f = {
      job, isNew: !job, custom: !simple, days: new Set(simple?.days ?? []), kind: job?.kind ?? "agent", model: job?.model ?? "haiku",
      name: mk("name (lowercase, - _)", job?.name), times: (simple?.times ?? [[6, 0]]).map(([h, m]) => this.timeRow(h, m, cx)),
      cron: mk("m h dom mon dow", job?.cron ?? "0 6 * * *"), cwd: mk("Folder (default home)", job?.cwd ?? ""),
      cmd: mk("Shell command", job?.cmd ?? ""), note: mk("Note (optional)", job?.note ?? ""),
      prompt: TextareaState.new({ placeholder: "Prompt for the agent", value: job?.prompt ?? "", rows: 4 }),
      preview: null, hist: null, openLog: null, logText: null, err: null,
    };
    f.cron.on("change", (_e, cx) => this.updatePreview(cx));
    this.form = f; this.confirm = false;
    this.updatePreview(cx);
    if (job) this.loadHistory(cx);
    cx.notify();
  }

  timeRow(h, m, cx) {
    const mk = (ph, v) => { const i = InputState.new({ placeholder: ph, value: pad(v) }); i.on("change", (_e, cx) => this.updatePreview(cx)); return i; };
    return { hour: mk("HH", h), min: mk("MM", m) };
  }

  cronNow() {
    const f = this.form;
    if (f.custom) return f.cron.value().trim();
    if (f.days.size === 0 || f.times.length === 0) return null;
    const out = [];
    for (const r of f.times) {
      const h = Number(r.hour.value()), m = Number(r.min.value());
      if (!r.hour.value().trim() || !r.min.value().trim() || !Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
      out.push(`${m} ${h} * * ${dowField(f.days)}`);
    }
    return [...new Set(out)].join(";");
  }

  updatePreview(cx) {
    const f = this.form; if (!f) return;
    const c = this.cronNow(), seq = (this.pseq = (this.pseq ?? 0) + 1);
    if (!c) { f.preview = { err: f.days.size === 0 ? "Pick at least one day" : f.times.length === 0 ? "Add a time" : "Times must be HH and MM" }; cx.notify(); return; }
    cx.spawn(async (cx) => {
      try { const r = await hcron(["next", c, "5"]); if (seq === this.pseq && this.form === f) f.preview = { runs: r, cron: c }; }
      catch (e) { if (seq === this.pseq && this.form === f) f.preview = { err: String(e.message ?? e) }; }
      cx.notify();
    });
  }

  loadHistory(cx) {
    const f = this.form, name = f.job.name;
    cx.spawn(async (cx) => {
      try { const r = await hcron(["history", name, "8"]); if (this.form === f) f.hist = r; } catch { if (this.form === f) f.hist = []; }
      cx.notify();
    });
  }

  showLog(h, cx) {
    const f = this.form;
    if (f.openLog === h.log) { f.openLog = null; f.logText = null; return cx.notify(); }
    f.openLog = h.log; f.logText = "Loading…"; cx.notify();
    cx.spawn(async (cx) => {
      const r = await exec("sh", ["-c", 'tail -c 1500 "$HOME/.cache/hcron/$1/$2" 2>&1', "x", f.job.name, h.log], { on: HOST }).catch(() => null);
      if (this.form === f && f.openLog === h.log) f.logText = (r?.stdout || "(no output)").trim() || "(no output)";
      cx.notify();
    });
  }

  save(cx) {
    const f = this.form, cron = this.cronNow();
    if (!cron) return cx.notify();
    const name = f.name.value().trim(), args = [];
    const agent = f.kind === "agent", prompt = f.prompt.value().trim(), cmd = f.cmd.value().trim();
    if (f.isNew && !name) { f.err = "Name needed"; return cx.notify(); }
    if (agent && !prompt) { f.err = "Prompt needed"; return cx.notify(); }
    if (!agent && !cmd) { f.err = "Command needed"; return cx.notify(); }
    f.err = null;
    const cwd = f.cwd.value().trim().replace(/^~(?=\/|$)/, "~"), note = f.note.value().trim();
    const common = ["--cron", cron, ...(agent ? ["--prompt", prompt, "--model", f.model] : ["--cmd", cmd])];
    if (f.isNew) args.push("add", name, ...common, ...(cwd ? ["--cwd", cwd] : []), ...(note ? ["--note", note] : []));
    else args.push("edit", f.job.name, ...common, "--cwd", cwd, "--note", note);
    this.act(args, cx, () => this.close(cx));
  }

  formView(t, cx) {
    const f = this.form;
    const label = (s) => div().text_size(11).font_semibold().text_color(t.muted).child(s.toUpperCase());
    const inp = (state, key, extra) => Input.new(state).h(32).px(10).rounded(8).border_1().border_color(t.border).bg(t.raised).text_size(12.8).text_color(t.foreground);
    const pill = (id, text, on, onClick) => div().id(id).h(24).px(9).flex().items_center().flex_none().rounded(6).border_1().border_color(t.border).cursor_pointer().text_size(12)
      .text_color(on ? t.accent : t.dim).hover((s) => s.bg(t.hover)).on_click(onClick).child(text);
    const setDays = (arr) => (_e, cx) => { f.days = new Set(arr); f.custom = false; this.updatePreview(cx); cx.notify(); };
    const section = (title, ...kids) => v_flex().gap(6).children([label(title), ...kids]);
    const pv = f.preview;
    const btn = (id, text, onClick, solid, danger) => div().id(id).h(28).px(12).flex().items_center().flex_none().rounded(7).border_1().border_color(solid ? t.accent : t.border).cursor_pointer().text_size(12.5)
      .text_color(danger ? t.blocked : solid ? t.accent : t.muted).hover((s) => s.bg(t.hover)).on_click(onClick).child(text);
    return v_flex().id("sched-form").flex_1().min_h(0).overflow_y_scrollbar().p(14).gap(14)
      .when(f.isNew, (el) => el.child(section("Name", inp(f.name))))
      .child(section("Days",
        h_flex().gap(4).flex_wrap().children(DAYS.map(([l, n]) => pill(`d-${l}`, l, !f.custom && f.days.has(n), (_e, cx) => { if (f.custom) { f.custom = false; } f.days.has(n) ? f.days.delete(n) : f.days.add(n); this.updatePreview(cx); cx.notify(); }))),
        h_flex().gap(4).flex_wrap()
          .child(pill("p-every", "Every day", !f.custom && f.days.size === 7, setDays(DAYS.map(([, n]) => n))))
          .child(pill("p-wk", "Weekdays", !f.custom && [...f.days].sort().join() === "1,2,3,4,5", setDays([1, 2, 3, 4, 5])))
          .child(pill("p-we", "Weekends", !f.custom && [...f.days].sort().join() === "0,6", setDays([0, 6])))
          .child(pill("p-cust", "Custom cron", f.custom, (_e, cx) => { f.custom = !f.custom; if (f.custom) f.cron.set_value(this.cronNow() ?? f.cron.value()); this.updatePreview(cx); cx.notify(); }))))
      .child(f.custom
        ? section("Cron", inp(f.cron))
        : section("Times", v_flex().gap(6)
          .children(f.times.map((r, i) => h_flex().gap(6).items_center()
            .child(Input.new(r.hour).w(52).h(32).px(10).rounded(8).border_1().border_color(t.border).bg(t.raised).text_size(12.8).text_color(t.foreground))
            .child(div().text_color(t.dim).child(":"))
            .child(Input.new(r.min).w(52).h(32).px(10).rounded(8).border_1().border_color(t.border).bg(t.raised).text_size(12.8).text_color(t.foreground))
            .when(f.times.length > 1, (el) => el.child(div().id(`t-del-${i}`).w(24).h(24).flex().items_center().justify_center().rounded(6).cursor_pointer().text_color(t.muted).hover((s) => s.bg(t.hover))
              .on_click((_e, cx) => { f.times.splice(i, 1); this.updatePreview(cx); cx.notify(); }).child("×")))))
          .child(div().id("t-add").h(24).px(9).flex().items_center().self_start().rounded(6).border_1().border_color(t.border).cursor_pointer().text_size(12).text_color(t.dim).hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => { const last = f.times[f.times.length - 1]; const h = last ? (Number(last.hour.value()) + 5) % 24 : 6; f.times.push(this.timeRow(Number.isInteger(h) ? h : 6, last ? Number(last.min.value()) || 0 : 0, cx)); this.updatePreview(cx); cx.notify(); }).child("+ Add time"))))
      .child(div().text_size(11.5).text_color(pv?.err ? t.blocked : t.muted).child(pv?.err ? pv.err : pv?.runs?.length ? "Next: " + pv.runs.map(stamp).join(" · ") : "…"))
      .child(section("Runs", h_flex().gap(4)
        .child(pill("k-agent", "Agent (claude -p)", f.kind === "agent", (_e, cx) => { f.kind = "agent"; cx.notify(); }))
        .child(pill("k-cmd", "Shell command", f.kind === "command", (_e, cx) => { f.kind = "command"; cx.notify(); }))))
      .when(f.kind === "agent", (el) => el.child(section("Model", h_flex().gap(4).children(MODELS.map((m) => pill(`m-${m}`, m, f.model === m, (_e, cx) => { f.model = m; cx.notify(); })))))
        .child(section("Prompt", Textarea.new(f.prompt).h(96).px(10).py(8).rounded(8).border_1().border_color(t.border).bg(t.raised).text_size(12.8).text_color(t.foreground))))
      .when(f.kind === "command", (el) => el.child(section("Command", inp(f.cmd))))
      .child(section("Folder", h_flex().gap(6).items_center().child(div().flex_1().min_w(0).child(inp(f.cwd)))
        .child(div().id("pick").h(32).px(10).flex().items_center().rounded(8).border_1().border_color(t.border).cursor_pointer().text_size(12).text_color(t.muted).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => cx.spawn(async (cx) => { const d = await pickFolder({ prompt: "Run in folder" }); if (d && this.form === f) f.cwd.set_value(d); cx.notify(); })).child("Browse"))))
      .child(section("Note", inp(f.note)))
      .when(Boolean(f.err), (el) => el.child(div().text_size(12).text_color(t.blocked).child(f.err)))
      .child(h_flex().gap(8).items_center()
        .child(btn("save", this.busy ? "Saving…" : "Save", (_e, cx) => this.save(cx), true))
        .when(!f.isNew, (el) => el.child(btn("run", "Run now", (_e, cx) => this.act(["run", f.job.name], cx, () => { notify({ title: "Schedules", body: `${f.job.name} started`, level: "info" }); cx.timer.after(8000, (cx) => this.loadHistory(cx)); }))))
        .child(div().flex_1())
        .when(!f.isNew, (el) => el.child(btn("del", this.confirm ? "Click again to delete" : "Delete", (_e, cx) => {
          if (!this.confirm) { this.confirm = true; cx.notify(); return; }
          this.act(["rm", f.job.name], cx, () => { this.confirm = false; this.close(cx); });
        }, false, true))))
      .when(!f.isNew, (el) => el.child(this.historyView(t, f, cx)));
  }

  historyView(t, f, cx) {
    return v_flex().gap(4).child(div().text_size(11).font_semibold().text_color(t.muted).child("HISTORY"))
      .when(f.hist && f.hist.length === 0, (el) => el.child(div().text_size(12).text_color(t.dim).child("Nothing has run yet.")))
      .children((f.hist ?? []).map((h) => v_flex().gap(4)
        .child(h_flex().id(`h-${h.log}`).h(24).px(6).gap(10).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.showLog(h, cx))
          .child(div().w(7).h(7).flex_none().rounded(4).bg(h.code === 0 ? t.done : t.blocked))
          .child(div().w(90).flex_none().text_size(12).text_color(t.muted).child(stamp(h.at)))
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(h.code === 0 ? t.dim : t.blocked).child(h.code === 0 ? `ok · ${h.secs}s · ${h.trigger}` : `exit ${h.code}${h.error ? " " + h.error : ""} · ${h.secs}s`)))
        .when(f.openLog === h.log, (el) => el.child(div().p(8).rounded(6).bg(t.raised).text_size(11).text_color(t.muted).child(f.logText ?? "")))));
  }
}
