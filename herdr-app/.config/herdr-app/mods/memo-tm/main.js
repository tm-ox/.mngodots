// Memo: tm's notes (MEMO calendar, journal-only, shown in jtx Board) and tasks (TM / YNK / WRK) from the Radicale server.
// All data goes through `rcal api` (JSON in, JSON out), so the mod, the terminal editor (`rcal edit`) and agents share one set of rules.
// Ctrl H / Ctrl L move left and right between the list, the form and the date picker (picker: H J K L day, [ ] hour, , . minute, Enter done, c cancel, 0 no time, x clear; Ctrl H closes it keeping the value).
// Right pane is a reader first: Ctrl L from the list focuses it (J K scroll, Space page, g G ends), Enter / e edits, Ctrl H leaves edit, then the reader.
// Keys: J K move, Enter edit, n new note, t y w new task in TM / YNK / WRK, x done, d delete (twice), a show done, / search, 1-5 tabs, b flips task/note <-> bookmark.
// In a text field: Tab / Shift Tab next field, Ctrl H back to the list. Esc closes the whole mod (the host takes it), so it is never the way back.
// Attachments (images shared from jtx Board): a paperclip in the list, chips in the reader and editor; F opens the first one (chips open their own) in the default app.
// Text edits save by themselves 0.7 s after you stop typing; chips save at once. A save checks the server's etag.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea, CalendarState } from "gpui-base";
import { exec, theme, props, closeOverlay, home, shared, setShared } from "herdr";

// Ctrl+Shift+V (what voice-input.sh sends to herdr-app, which it treats as a terminal): a text box only knows Ctrl+V, so paste the clipboard in here.
const dictate = (e, cx, box, single = true) => {
  if (!(e.modifiers?.control && e.modifiers?.shift && String(e.key).toLowerCase() === "v") || !box) return false;
  exec("wl-paste", ["-n"]).then((r) => { if (r.code === 0 && r.stdout) { box.replace(single ? String(r.stdout).replace(/\r?\n/g, " ") : String(r.stdout)); box.focus(); } });
  cx.stop_propagation(); return true;
};

const PRIOS = [["None", 0], ["High", 1], ["Medium", 5], ["Low", 9]];
const STATUSES = [["Open", "NEEDS-ACTION"], ["In progress", "IN-PROCESS"], ["Done", "COMPLETED"], ["Cancelled", "CANCELLED"]];
const CATS = ["inbox", "todo", "idea", "reference", "agent", "tm", "ynk", "wrk"];
const CALS = [["TM", "tm"], ["YNK", "ynk"], ["WRK", "wrk"]];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); };
const TABS = [["all", "All"], ["note", "Notes"], ["task", "Tasks"], ["bookmark", "Bookmarks"], ["org", "Org"]];
const isOrg = (i) => i.cal === "org" || i.cal === "orgn"; // OpenBot's own calendars (account bot): shown in All, Notes, Tasks and on the Org tab
const calLabel = (i) => (isOrg(i) ? "ORG" : i.kind === "task" ? i.cal.toUpperCase() : "");
const isBm = (i) => i.kind === "note" && i.cats.includes("bookmark");

const api = async (req) => {
  try {
    const r = await exec(home() + "/workspace/.tools/rcal", ["api", "--json", JSON.stringify(req)]);
    return JSON.parse(r.stdout);
  } catch (err) {
    return { error: "rcal unavailable" };
  }
};
const isDone = (i) => i.status === "COMPLETED" || i.status === "CANCELLED";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const keyChip = (text, t) => div().px(6).h(18).min_w(18).flex().items_center().justify_center().flex_none().rounded(5).border_1().border_color(t.input ?? t.border).bg(t.raised).text_size(11).font_medium().text_color(t.muted).child(text);
const keyHints = (text, t) => h_flex().gap(14).items_center().min_w(0).overflow_hidden().children(text.split(" · ").map((seg) => {
  const w = seg.split(" "); let n = 1;
  while (n < w.length && /^[A-Z]$/.test(w[n])) n++;
  const label = w.slice(n).join(" ");
  return h_flex().gap(6).items_center().flex_none().child(keyChip(w.slice(0, n).join(" "), t)).when(Boolean(label), (e) => e.child(div().text_size(12).text_color(t.dim).child(label)));
}));

const HELP = [
  ["List", [
    ["J K · ↑ ↓", "Move the selection."],
    ["Ctrl L", "Focus the reader on the right (then J K scroll)."],
    ["Enter · e", "Edit the selected item."],
    ["n", "New note (MEMO, shows in jtx Board Notes)."],
    ["T · Y · W", "New task in TM, YNK or WRK."],
    ["x", "Mark the task done, or reopen it. Tasks only."],
    ["B", "Task or note becomes a bookmark (note in MEMO, tag bookmark). On a bookmark: back to a task in TM."],
    ["O", "Open the item's link in the default browser."],
    ["F", "Open the item's first attachment (image or file) in the default app."],
    ["U", "Copy the item's link."],
    ["d", "Delete the item. Press twice to confirm."],
    ["a", "Show or hide done tasks in All and Tasks."],
    ["r", "Reload from the server."],
    ["/", "Search titles and bodies."],
    ["1 – 5", "Tabs: All, Notes, Tasks, Bookmarks, Org (OpenBot's own tasks and notes, edited in place). Org items also appear in All, Notes and Tasks (ORG label). Bookmarks are hidden from All."],
  ]],
  ["Reader", [
    ["J K · ↑ ↓", "Scroll a line."],
    ["Space · Ctrl F", "Scroll a page down (Ctrl B or Page Up: up)."],
    ["Ctrl D · Ctrl U", "Scroll half a page down or up."],
    ["g · G", "Jump to the top or the end."],
    ["C", "Copy the whole body."],
    ["O · U", "Open the link, copy the link."],
    ["F", "Open the first attachment."],
    ["Enter · e", "Edit."],
    ["x · B · n · T Y W", "Same as in the list."],
    ["Backspace or Ctrl H", "Back to the list."],
  ]],
  ["Editing", [
    ["Tab · Shift Tab", "Next or previous field (title, due, body)."],
    ["Ctrl S", "Save now. Typing saves by itself about half a second after you stop; chips save at once."],
    ["Backspace or Ctrl H", "Back to the reader (from the date picker: close it and keep the value)."],
    ["Ctrl L", "Open the date picker from the due field."],
  ]],
  ["Date picker", [
    ["H J K L", "Move the day left, down, up, right."],
    ["[ · ]", "Hour down or up."],
    [", · .", "Minute down or up."],
    ["Enter", "Done: set the due date."],
    ["c", "Cancel."],
    ["0", "Date only, no time."],
    ["x", "Clear the due date."],
  ]],
  ["Anywhere", [
    ["?", "This help. Any key closes it."],
    ["Esc", "Closes the whole mod, not just the current view. Pending edits are saved first."],
  ]],
];

export default class Memo extends View {
  init(_props, cx) {
    this.items = []; this.loaded = this.items.length > 0; this.error = null;
    this.tab = "all"; this.showDone = false; this.query = ""; this.catFilter = new Set();
    this.curId = null; this.cur = null; this.state = ""; this.note = null; this.askDel = null;
    this.focused = new Set(); this.populating = false; this.seq = 0; this.saving = false; this.again = false;
    this.handle = cx.focus_handle();
    this.calendar = CalendarState.new(); this.calOpen = false; this.pickerFocus = false; this.pcur = null; this.editing = false; this.rightFocus = false; this.pvOff = 0; this.flash = ""; this.helpOpen = false;

    this.search = InputState.new({ placeholder: "Search…" });
    this.title = InputState.new({ placeholder: "Title" });
    this.due = InputState.new({ placeholder: "YYYY-MM-DD or YYYY-MM-DD HH:MM" });
    this.newcat = InputState.new({ placeholder: "new category" });
    this.body = TextareaState.new({ placeholder: "Body", rows: 8 });
    const named = { search: this.search, title: this.title, due: this.due, newcat: this.newcat, body: this.body };
    for (const [name, inp] of Object.entries(named)) {
      inp.on("focus", (_e, cx) => { this.focused.add(name); this.pickerFocus = false; cx.notify(); });
      inp.on("blur", (_e, cx) => { this.focused.delete(name); if (name !== "search" && name !== "newcat") this.flush(cx); cx.notify(); });
    }
    this.search.on("change", (_e, cx) => { this.query = this.search.value().trim().toLowerCase(); this.keepSelection(cx); cx.notify(); });
    for (const inp of [this.title, this.due, this.body]) inp.on("change", (_e, cx) => this.touch(cx));
    this.newcat.on("submit", (_e, cx) => this.addCategory(cx));
    this.search.on("submit", (_e, cx) => { this.handle.focus(); cx.notify(); });

    this.handle.focus();
    cx.timer.after(400, () => { if (!this.focused.size) this.handle.focus(); });
    this.refresh(cx);
    // Voice notes shared from the phone arrive as audio attachments: transcribe them into the description, then reload.
    // Then tasks that are just a shared link move to the Bookmarks tab (a voice note starting with "task" keeps it a task).
    cx.spawn(async (cx) => { const r = await api({ op: "transcribe" }); const b = await api({ op: "sweep" }); if (r.done || b.done) this.refresh(cx); });
  }

  get typing() { return this.focused.size > 0; }

  // Data
  refresh(cx) {
    cx.spawn(async (cx) => {
      const l = await api({ op: "list" });
      this.loaded = true;
      if (l.error) this.error = l.error; else { this.error = null; this.items = l.items; setShared("memo.items", l.items); }
      // Deep link from the Inbox panel: open on that item (tab All, so tasks are listed).
      const want = shared("memo-open");
      if (want) {
        setShared("memo-open", null);
        const hit = this.items.find((i) => i.id === want);
        if (hit) { this.tab = isOrg(hit) ? "org" : "all"; this.curId = hit.id; this.cur = null; this.note = null; this.state = ""; if (hit.etag) this.load(hit, cx); }
      }
      if (!this.curId) this.keepSelection(cx);
      else if (this.cur && !this.typing && !this.saving && !Object.keys(this.diff()).length) {
        const fresh = this.items.find((i) => i.id === this.curId);
        if (fresh && fresh.etag !== this.cur.etag) this.load(fresh, cx);
      }
      cx.notify();
    });
  }

  visible() {
    const q = this.query;
    const GRP = ["org", "orgn", "personal", "wrk", "ynk1", "memoj"], grp = (i) => { const n = GRP.indexOf(i.cal === "tm" ? "personal" : i.cal === "ynk" ? "ynk1" : i.cal === "memo" ? "memoj" : i.cal); return n < 0 ? 9 : n === 1 ? 0 : n; }; // by calendar first: org + org notes together, then TM, WRK, YNK, then MEMO notes
    const rank = (i) => (i.kind === "task" ? (isDone(i) ? 2 : 0) : 1);
    return this.items
      .filter((i) => this.tab === "org" ? isOrg(i) && (this.showDone || !(i.kind === "task" && isDone(i))) : this.tab === "bookmark" ? isBm(i) : this.tab === "done" ? i.kind === "task" && isDone(i) : !isBm(i) && (this.tab === "all" || i.kind === this.tab) && (this.showDone || !(i.kind === "task" && isDone(i))))
      .filter((i) => this.tab !== "bookmark" || [...this.catFilter].every((c) => i.cats.includes(c)))
      .filter((i) => !q || i.title.toLowerCase().includes(q) || i.cats.some((c) => c.includes(q)))
      .sort((a, b) => grp(a) - grp(b) || rank(a) - rank(b) || (a.kind === "task" && b.kind === "task" ? (a.due || "9999").localeCompare(b.due || "9999") : 0) || b.modified.localeCompare(a.modified));
  }

  keepSelection(cx) {
    const v = this.visible();
    if (this.curId && v.some((i) => i.id === this.curId)) return;
    if (v.length) this.select(v[0].id, cx); else { this.curId = null; this.cur = null; }
  }

  async select(id, cx) {
    if (id === this.curId) return;
    await this.flush(cx);
    this.curId = id; this.cur = null; this.note = null; this.state = ""; this.askDel = null; this.editing = false; this.calOpen = false; this.pickerFocus = false; this.pvOff = 0;
    const hit = this.items.find((i) => i.id === id);
    if (hit && hit.etag) { this.load(hit, cx); cx.notify(); return; }
    cx.notify();
    const r = await api({ op: "get", id });
    if (id !== this.curId) return;
    if (r.item) this.load(r.item, cx); else { this.note = "That entry is gone"; this.refresh(cx); }
    cx.notify();
  }

  load(item, cx) {
    this.cur = item;
    this.populating = true;
    this.title.set_value(item.title); this.due.set_value(item.due || ""); this.body.set_value(item.body || "");
    this.populating = false;
  }

  // Fields whose text differs from the saved entry.
  diff() {
    if (!this.cur) return {};
    const f = {}, c = this.cur;
    const title = this.title.value().trim();
    if (title !== c.title) f.title = title;
    if (c.kind === "task" && this.due.value().trim() !== (c.due || "")) f.due = this.due.value().trim();
    if (this.body.value().replace(/\n+$/, "") !== (c.body || "").replace(/\n+$/, "")) f.body = this.body.value();
    return f;
  }

  touch(cx) {
    if (this.populating || !this.cur) return;
    const my = ++this.seq;
    this.state = "unsaved";
    cx.notify();
    cx.timer.after(400, (cx) => { if (my === this.seq) this.save(cx); });
  }

  async flush(cx) { if (this.cur && Object.keys(this.diff()).length) await this.save(cx); }

  async save(cx, extra = {}) {
    if (!this.cur) return;
    if (this.saving) { this.again = true; this.pending = { ...(this.pending ?? {}), ...extra }; return; }
    const fields = { ...this.diff(), ...extra };
    if (!Object.keys(fields).length) { this.state = ""; cx.notify(); return; }
    this.saving = true; this.state = "saving…"; cx.notify();
    const id = this.cur.id;
    const r = await api({ op: "save", id, etag: this.cur.etag, raw: this.cur.raw, fields });
    this.saving = false;
    if (id !== this.curId) return;
    if (r.item) {
      this.cur = r.item; this.note = null; this.state = "saved";
      this.items = this.items.map((i) => (i.id === id ? r.item : i)); setShared("memo.items", this.items);
      // Never reload the inputs from a save reply: keys typed while it was in flight would be overwritten (the "jump back").
      // Only a normalised due (e.g. 2026-11-09T10:00 -> 2026-11-09 10:00) is written back, and only if untouched since.
      if (fields.due !== undefined && this.due.value().trim() === fields.due && r.item.due !== fields.due) {
        this.populating = true; this.due.set_value(r.item.due || ""); this.populating = false;
      }
    } else if (r.error === "conflict") {
      this.note = "Changed elsewhere, reloaded. Retype your edit.";
      const g = await api({ op: "get", id }); if (g.item) this.load(g.item, cx); this.state = "";
    } else { this.note = r.error ?? "Save failed"; this.state = "not saved"; }
    cx.notify();
    if (this.again) { const p = this.pending ?? {}; this.again = false; this.pending = null; this.save(cx, p); }
  }

  setField(fields, cx) { this.save(cx, fields); }

  addCategory(cx) {
    const v = this.newcat.value().trim().toLowerCase();
    if (!v || !this.cur) return;
    this.newcat.set_value("");
    this.extraCats = [...(this.extraCats ?? []), v];
    if (!this.cur.cats.includes(v)) this.setField({ cats: [...this.cur.cats, v] }, cx);
  }

  toggleCat(c, cx) {
    if (!this.cur) return;
    const has = this.cur.cats.includes(c);
    this.setField({ cats: has ? this.cur.cats.filter((x) => x !== c) : [...this.cur.cats, c] }, cx);
  }

  // B flips the selected item: task -> bookmark, note -> bookmark, bookmark -> task in TM.
  async flip(cx) {
    const c = this.cur; if (!c) return;
    if (isOrg(c)) { this.note = "Org items stay in org"; cx.notify(); return; }
    await this.flush(cx);
    if (c.kind === "note" && !isBm(c)) { this.setField({ cats: [...c.cats, "bookmark"] }, cx); return; }
    const r = await api({ op: "convert", id: c.id, to: c.kind === "task" ? "bookmark" : "tm" });
    if (!r.id) { this.note = r.error ?? "Could not convert"; cx.notify(); return; }
    this.curId = null; this.cur = null; this.refresh(cx);
  }

  async create(kind, cx, calName = "tm") {
    await this.flush(cx);
    const r = await api({ op: "create", kind, cal: calName, title: kind === "note" ? "New note" : "New task" });
    if (!r.item) { this.note = r.error ?? "Could not create"; cx.notify(); return; }
    this.items = [r.item, ...this.items]; setShared("memo.items", this.items);
    if (this.tab !== "all" && this.tab !== kind) this.tab = kind;
    this.search.set_value(""); this.query = "";
    this.curId = r.item.id; this.load(r.item, cx); this.state = ""; this.note = null;
    this.editing = true; this.rightFocus = false; this.pvOff = 0;
    cx.notify();
    cx.timer.after(40, () => { this.title.focus(); this.title.set_selected_range({ start: 0, end: r.item.title.length }); });
  }

  async moveTo(calName, cx) {
    if (!this.cur || this.cur.kind !== "task" || this.cur.cal === calName) return;
    await this.flush(cx);
    const old = this.curId;
    const r = await api({ op: "move", id: old, cal: calName });
    if (!r.item) { this.note = r.error ?? "Move failed"; cx.notify(); return; }
    this.items = this.items.map((i) => (i.id === old ? r.item : i)); setShared("memo.items", this.items);
    this.curId = r.item.id; this.cur = r.item; this.note = null; this.state = "moved";
    cx.notify();
  }

  async remove(cx) {
    if (!this.cur) return;
    if (this.askDel !== this.curId) { this.askDel = this.curId; this.note = "Press d again to delete"; return; }
    const id = this.curId, v = this.visible(), at = v.findIndex((i) => i.id === id);
    this.askDel = null; this.note = null;
    const r = await api({ op: "delete", id });
    if (!r.ok) { this.note = "Delete failed"; return; }
    this.items = this.items.filter((i) => i.id !== id); setShared("memo.items", this.items);
    this.curId = null; this.cur = null;
    const nv = this.visible();
    if (nv.length) await this.select(nv[Math.min(at, nv.length - 1)].id, cx);
  }

  move(d, cx) {
    const v = this.visible(); if (!v.length) return;
    const at = Math.max(0, Math.min(v.length - 1, v.findIndex((i) => i.id === this.curId) + d));
    this.select(v[at].id, cx);
  }

  enterEdit(cx) {
    if (!this.cur) return;
    this.editing = true; this.rightFocus = false; cx.notify();
    cx.timer.after(40, () => { this.title.focus(); this.title.set_selected_range({ start: this.title.value().length, end: this.title.value().length }); });
  }

  leaveEdit(cx) {
    this.flush(cx);
    this.editing = false; this.calOpen = false; this.pickerFocus = false; this.rightFocus = true; this.handle.focus(); cx.notify();
  }

  scrollView(n) {
    const total = (this.cur?.body ?? "").replace(/\n+$/, "").split("\n").length;
    this.pvOff = Math.max(0, Math.min(total - 1, this.pvOff + n));
  }

  closePicker(cx, revert) {
    if (revert && this.dueOrig !== undefined) { this.due.set_value(this.dueOrig); this.save(cx); }
    this.calOpen = false; this.pickerFocus = false; this.handle.focus(); cx.notify();
  }

  dueParts() {
    const v = this.due.value().trim();
    return { date: /^\d{4}-\d\d-\d\d/.test(v) ? v.slice(0, 10) : "", time: /\d\d:\d\d$/.test(v) ? v.slice(-5) : "" };
  }

  setDue(date, time, cx) {
    this.due.set_value(date ? (time ? `${date} ${time}` : date) : "");
    if (date) this.calendar.set_value(date);
    this.save(cx);
    cx.notify();
  }

  focusOrder() { return ["title", ...(this.cur?.kind === "task" && this.calOpen ? ["due"] : []), "newcat", "body"]; }

  focusNext(back) {
    const o = this.focusOrder(), cur = o.findIndex((n) => this.focused.has(n));
    this[o[(cur + (back ? o.length - 1 : 1)) % o.length]].focus();
  }

  async close(cx) { await this.flush(cx); closeOverlay(props().overlay); }

  // Picker zone: the month grid takes the keys. Moves the cursor day and keeps the shown month with it.
  pickerKey(k, cx) {
    const { date, time } = this.dueParts();
    const cur = this.pcur ?? date ?? today();
    const step = { h: -1, left: -1, l: 1, right: 1, j: 7, down: 7, k: -7, up: -7 }[k];
    if (step) {
      this.pcur = addDays(cur, step);
      const want = Number(this.pcur.slice(5, 7)) + 12 * Number(this.pcur.slice(0, 4));
      for (let n = 0; n < 24; n++) {
        const have = this.calendar.month() + 12 * this.calendar.year();
        if (have === want) break;
        if (have < want) this.calendar.next_month(); else this.calendar.prev_month();
      }
    } else if (k === "enter") { this.setDue(cur, time, cx); this.closePicker(cx, false); }
    else if (k === "c" || k === "q") this.closePicker(cx, true);
    else if (k === "[" || k === "]" || k === "," || k === ".") {
      let [h, m] = time ? time.split(":").map(Number) : [9, 0];
      if (k === "[" || k === "]") h = (h + (k === "]" ? 1 : 23)) % 24; else m = (m + (k === "." ? 5 : 55)) % 60;
      this.setDue(date || cur, `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, cx);
    }
    else if (k === "0") this.setDue(date || cur, "", cx);
    else if (k === "x") this.setDue("", "", cx);
    else return false;
    cx.notify();
    return true;
  }

  // Ctrl H / Ctrl L: left and right between the list, the form and the date picker.
  zoneKey(k, cx) {
    const inSearch = this.focused.has("search");
    if (k === "h") {
      if (this.pickerFocus) { this.closePicker(cx, false); this.title.focus(); }
      else if (this.typing && inSearch) { this.handle.focus(); }
      else if (this.typing || this.editing) this.leaveEdit(cx);
      else if (this.rightFocus) { this.rightFocus = false; this.handle.focus(); }
      else return false;
    } else {
      if (this.pickerFocus) return true;
      if (this.typing && !inSearch) {
        if (!this.calOpen || this.cur?.kind !== "task") return true;
        this.flush(cx); this.pickerFocus = true; this.pcur = this.dueParts().date || today(); this.handle.focus();
        if (this.dueParts().date) this.calendar.set_value(this.dueParts().date);
      } else if (this.cur && !this.editing) { this.rightFocus = true; this.handle.focus(); if (inSearch) this.focused.clear(); }
      else return false;
    }
    cx.notify();
    return true;
  }

  urls() { return [...new Set(((this.cur?.url ?? "") + "\n" + (this.cur?.body ?? "") + "\n" + (this.cur?.title ?? "")).match(/https?:\/\/[^\s<>"')\]]+/g) ?? [])].map((u) => u.replace(/[.,;:!?]+$/, "")); }
  copyText(text, what, cx) { if (!text) { this.flash = "nothing to copy"; return; } cx.write_to_clipboard(text); this.flash = `copied ${what}`; }
  async openAttachment(i, cx) {
    const a = this.cur?.att?.[i];
    if (!a) { this.flash = "no attachment"; cx.notify(); return; }
    if (!a.binary) { this.flash = "link attachment, not a file"; cx.notify(); return; }
    this.flash = `opening ${a.name}…`; cx.notify();
    const r = await api({ op: "attachment", id: this.curId, index: a.i });
    if (!r.path) { this.flash = r.error ?? "could not extract"; cx.notify(); return; }
    // Images open in Satty (annotate, copy; no output file, so the attachment is never changed); xdg-open here ended up in Chromium. Other files use xdg-open.
    const img = /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(r.path);
    try { await exec("sh", ["-c", (img ? 'if command -v satty >/dev/null 2>&1; then setsid satty --filename "$1" >/dev/null 2>&1 & exit 0; fi; ' : "") + 'exec setsid xdg-open "$1" >/dev/null 2>&1', "sh", r.path]); this.flash = `opened ${a.name}`; } catch (err) { this.flash = `saved to ${r.path}`; }
    cx.notify();
  }
  openLink(url, cx) { if (!url) { this.flash = "no link"; return; } cx.open_url(url); this.flash = "opened link"; }

  key(e, cx) {
    const k = e.key, ctrl = e.modifiers?.control;
    for (const name of ["body", "title", "due", "newcat", "search"]) if (this.focused.has(name)) { if (dictate(e, cx, this[name], name !== "body")) return; break; }
    if (k === "escape") { this.close(cx); cx.stop_propagation(); return; }
    if (ctrl && (k === "h" || k === "l") && this.zoneKey(k, cx)) { cx.stop_propagation(); return; }
    if (this.typing) {
      if (k === "tab") { this.focusNext(e.modifiers?.shift); cx.stop_propagation(); }
      else if (ctrl && k === "s") { this.save(cx); cx.stop_propagation(); }
      return;
    }
    if (this.helpOpen) { this.helpOpen = false; cx.stop_propagation(); cx.notify(); return; }
    if (k === "?" || (k === "/" && e.modifiers?.shift)) { this.helpOpen = true; cx.stop_propagation(); cx.notify(); return; }
    if (k === "backspace" && !this.editing && this.zoneKey("h", cx)) { cx.stop_propagation(); return; }
    if (this.pickerFocus) { if (this.pickerKey(k, cx)) cx.stop_propagation(); return; }
    if (this.rightFocus && !this.editing) {
      this.flash = "";
      if (k === "c" && !ctrl) this.copyText((this.cur?.body ?? "").replace(/\n+$/, ""), "body", cx);
      else if (k === "u") this.copyText(this.urls()[0], "link", cx);
      else if (k === "o") this.openLink(this.urls()[0], cx);
      else if (k === "f" && !ctrl) this.openAttachment(0, cx);
      else if (k === "j" || k === "down") this.scrollView(1);
      else if (k === "k" || k === "up") this.scrollView(-1);
      else if (ctrl && k === "d") this.scrollView(15);
      else if (ctrl && k === "u") this.scrollView(-15);
      else if (k === "space" || k === " " || k === "pagedown" || (ctrl && k === "f")) this.scrollView(30);
      else if (k === "pageup" || (ctrl && k === "b")) this.scrollView(-30);
      else if (k === "g" && !e.modifiers?.shift) this.pvOff = 0;
      else if (k === "G" || (k === "g" && e.modifiers?.shift)) { this.pvOff = 1e9; this.scrollView(0); this.pvOff = Math.max(0, this.pvOff - 12); }
      else if (k === "enter" || k === "e" || k === "i") this.enterEdit(cx);
      else if (k === "x" && this.cur?.kind === "task") this.setField({ status: this.cur.status === "COMPLETED" ? "NEEDS-ACTION" : "COMPLETED" }, cx);
      else if (k === "b") this.flip(cx);
      else if (k === "n") this.create("note", cx);
      else if (k === "t" || k === "y" || k === "w") this.create("task", cx, { t: "tm", y: "ynk", w: "wrk" }[k]);
      else return;
      cx.stop_propagation(); cx.notify(); return;
    }
    if (k === "down" || k === "j") this.move(1, cx);
    else if (k === "up" || k === "k") this.move(-1, cx);
    else if (k === "f" && !ctrl && this.cur) this.openAttachment(0, cx);
    else if ((k === "enter" || k === "e") && this.cur) this.enterEdit(cx);
    else if (k === "b") this.flip(cx);
    else if (k === "o") this.openLink(this.urls()[0], cx);
    else if (k === "u") this.copyText(this.urls()[0], "link", cx);
    else if (k === "n") this.create("note", cx);
    else if (k === "t" || k === "y" || k === "w") this.create("task", cx, { t: "tm", y: "ynk", w: "wrk" }[k]);
    else if (k === "x" && this.cur?.kind === "task") this.setField({ status: this.cur.status === "COMPLETED" ? "NEEDS-ACTION" : "COMPLETED" }, cx);
    else if (k === "d") this.remove(cx);
    else if (k === "a") { this.showDone = !this.showDone; this.keepSelection(cx); }
    else if (k === "r") this.refresh(cx);
    else if (k === "/") this.search.focus();
    else if (k === "1" || k === "2" || k === "3" || k === "4" || k === "5") { this.tab = TABS[Number(k) - 1][0]; this.keepSelection(cx); }
    else return;
    cx.stop_propagation(); cx.notify();
  }

  render(cx) {
    const t = theme(), v = this.visible(), c = this.cur;
    const input = (inp, name, extra) => Input.new(inp).h(34).px(10).rounded(9).border_1().border_color(this.focused.has(name) ? t.accent : t.border).bg(t.raised).text_size(12.8).text_color(t.foreground);
    const caption = (text) => div().text_size(10).font_medium().text_color(t.accent).child(text.toUpperCase());
    const pill = (id, text, on, fn) => div().id(id).h(22).px(8).flex().items_center().flex_none().rounded(6).border_1().border_color(t.border).cursor_pointer().text_size(11)
      .text_color(on ? t.accent : t.dim).when(on, (e) => e.font_medium()).when(!on, (e) => e.hover((x) => x.text_color(t.muted))).on_click((_e, cx) => { fn(cx); cx.stop_propagation(); }).child(text);
    const tab = (id, text, n, on, first) => div().id(`tab-${id}`).h_full().pl(first ? 12 : 4).pr(4).flex().items_center().cursor_pointer()
      .on_click((_e, cx) => { this.tab = id; this.keepSelection(cx); cx.notify(); })
      .child(h_flex().h(22).rounded(6).border_1().border_color(t.input ?? t.border).overflow_hidden()
        .child(div().px(7).h_full().flex().items_center().bg(t.raised).text_size(11).font_medium().text_color(t.muted).child(String(n)))
        .child(div().w(1).h_full().bg(t.input ?? t.border))
        .child(div().px(8).h_full().flex().items_center().text_size(12).text_color(on ? t.accent : t.dim).when(on, (e) => e.font_medium()).child(text)));

    const todayS = today();
    const rows = v.map((i) => {
      const sel = i.id === this.curId, late = i.kind === "task" && !isDone(i) && i.due && i.due.slice(0, 10) < todayS;
      return h_flex().id(`row-${i.id}`).h(28).px(10).gap(8).items_center().flex_none().rounded(7)
        .bg(sel ? t.selected : "#00000000").hover((s) => s.bg(sel ? t.selected : t.hover)).cursor_pointer().on_click((_e, cx) => { this.select(i.id, cx); this.handle.focus(); })
        .child(div().w(12).flex_none().text_size(11).font_medium().text_color(t.accent).child(i.kind === "note" ? "N" : isDone(i) ? "✓" : "T"))
        .child(div().w(30).flex_none().text_size(10).font_medium().text_color(t.dim).child(calLabel(i)))
        .child(div().flex_1().min_w(0).truncate().text_color(sel ? t.foreground : t.muted).when(i.kind === "task" && isDone(i), (e) => e.text_color(t.dim)).child(i.title))
        .when((i.att ?? []).length > 0, (e) => e.child(div().flex_none().text_size(11).text_color(t.dim).child("📎")))
        .child(div().flex_none().w(78).text_right().text_size(11).text_color(late ? t.blocked : t.dim).child(i.kind === "task" ? (i.due || "").slice(0, 10) : ""))
        .child(div().flex_none().w(110).truncate().text_right().text_size(11).text_color(t.dim).child(i.cats.join(" ")));
    });


    const todayD = today(), { date: dDate, time: dTime } = this.dueParts();
    const grid = this.calendar.month_days()[0] ?? [], month = this.calendar.month(), year = this.calendar.year();
    const cell = (id, text, on, fn) => div().id(id).w(28).h(22).flex().items_center().justify_center().rounded(6).cursor_pointer().text_size(11)
      .text_color(on ? t.accent : t.dim).when(on, (e) => e.font_medium()).hover((x) => x.bg(t.hover)).on_click((_e, cx) => { fn(cx); cx.stop_propagation(); }).child(text);
    const [dH, dM] = dTime ? dTime.split(":") : ["", ""];
    const picker = v_flex().gap(8).flex_none().p(10).rounded(9).border_1().border_color(t.border)
      .child(h_flex().gap(6).items_center().flex_wrap()
        .child(Input.new(this.due).w(190).h(28).px(10).rounded(8).border_1().border_color(this.focused.has("due") ? t.accent : t.border).bg(t.raised).text_size(12).text_color(t.foreground))
        .child(pill("cal-today", "Today", false, (cx) => this.setDue(todayD, dTime, cx)))
        .child(pill("cal-tom", "Tomorrow", false, (cx) => this.setDue(addDays(todayD, 1), dTime, cx)))
        .child(pill("cal-week", "+1 week", false, (cx) => this.setDue(addDays(todayD, 7), dTime, cx)))
        .child(pill("cal-clear", "Clear", false, (cx) => this.setDue("", "", cx)))
        .child(div().flex_1())
        .child(pill("cal-cancel", "Cancel", false, (cx) => this.closePicker(cx, true)))
        .child(pill("cal-done", "Done", true, (cx) => this.closePicker(cx, false))))
      .child(h_flex().gap(16).items_start()
        .child(v_flex().gap(4).flex_none()
          .child(h_flex().gap(6).items_center()
            .child(pill("cal-prev", "‹", false, (cx) => { this.calendar.prev_month(); cx.notify(); }))
            .child(div().w(120).flex().justify_center().text_size(12).font_medium().text_color(t.muted).child(`${MONTHS[month - 1]} ${year}`))
            .child(pill("cal-next", "›", false, (cx) => { this.calendar.next_month(); cx.notify(); })))
          .child(h_flex().gap(2).children((grid[0] ?? []).map((d) => div().w(34).flex().justify_center().text_size(10).text_color(t.dim).child(DAYS[new Date(d + "T00:00:00").getDay()]))))
          .children(grid.map((week) => h_flex().gap(2).children(week.map((day) => {
            const sel = day === dDate, inMonth = Number(day.slice(5, 7)) === month;
            return div().id(`day-${day}`).w(34).h(24).flex().items_center().justify_center().rounded(6).border_1().border_color(this.pickerFocus && day === (this.pcur ?? dDate) ? t.accent : day === todayD ? t.border : "#00000000").cursor_pointer().text_size(11)
              .text_color(sel ? t.accent : inMonth ? t.muted : t.dim).when(sel, (e) => e.font_medium()).hover((x) => x.bg(t.hover))
              .on_click((_e, cx) => { this.setDue(day, dTime, cx); cx.stop_propagation(); }).child(String(Number(day.slice(8))));
          })))))
        .child(v_flex().gap(6).flex_1().min_w(0)
          .child(h_flex().gap(8).items_center().child(div().text_size(10).font_medium().text_color(t.accent).child("TIME"))
            .child(pill("tm-none", "No time", !dTime, (cx) => dDate && this.setDue(dDate, "", cx))))
          .child(div().text_size(10).text_color(t.dim).child("Hour"))
          .child(h_flex().gap(2).flex_wrap().children(Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")).map((h) => cell(`h-${h}`, h, dH === h, (cx) => this.setDue(dDate || todayD, `${h}:${dM || "00"}`, cx)))))
          .child(div().text_size(10).text_color(t.dim).child("Minute"))
          .child(h_flex().gap(2).flex_wrap().children(Array.from({ length: 12 }, (_, m) => String(m * 5).padStart(2, "0")).map((m) => cell(`m-${m}`, m, dM === m, (cx) => this.setDue(dDate || todayD, `${dH || "09"}:${m}`, cx)))))));
    // Bookmarks tab: category filter chips (tm / ynk / wrk first), several can be on at once and narrow the list (all must match).
    const catCount = {}; for (const i of this.items) if (isBm(i)) for (const c of i.cats) if (c !== "bookmark") catCount[c] = (catCount[c] ?? 0) + 1;
    const ORDER = ["tm", "ynk", "wrk"];
    const bcats = [...new Set([...Object.keys(catCount), ...this.catFilter])].sort((a, b) => { const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b); return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib) || a.localeCompare(b); });
    const counts = { all: this.items.filter((i) => !isBm(i) && (this.showDone || !(i.kind === "task" && isDone(i)))).length };
    const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
    const hasAtt = (c?.att ?? []).length > 0;
    const attRow = () => h_flex().gap(6).items_center().flex_wrap().flex_none().child(caption("Attachments"))
      .children(c.att.map((a, n) => pill(`att-${n}`, `📎 ${a.name.length > 28 ? a.name.slice(0, 14) + "…" + a.name.slice(-12) : a.name}${a.size ? " · " + kb(a.size) : ""}`, false, (cx) => this.openAttachment(n, cx))));
    const editPane = !c
      ? div().p(14).text_size(12).text_color(t.dim).child(this.curId ? "Loading…" : this.loaded ? "Nothing selected. n new note, t new task." : "Loading…")
      : v_flex().flex_1().min_h(0).p(14).gap(10)
        .child(h_flex().gap(8).items_center().flex_none()
          .child(div().flex_1().min_w(0).child(input(this.title, "title")))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(isOrg(c) ? `${c.kind === "note" ? "Note" : "Task"} · ORG (OpenBot)` : c.kind === "note" ? "Note · MEMO" : `Task · ${c.cal.toUpperCase()}`)))
        .child(v_flex().gap(6).flex_none().child(caption("Categories"))
          .child(h_flex().gap(6).items_center().flex_wrap()
            .children([...new Set([...CATS, ...this.items.flatMap((i) => i.cats), ...(this.extraCats ?? []), ...c.cats])].map((cat) => pill(`cat-${cat}`, cat, c.cats.includes(cat), (cx) => this.toggleCat(cat, cx))))
            .child(div().w(130).child(Input.new(this.newcat).h(22).px(8).rounded(6).border_1().border_color(this.focused.has("newcat") ? t.accent : t.border).bg(t.raised).text_size(11).text_color(t.foreground)))))
        .when(hasAtt, (e) => e.child(attRow()))
        .when(c.kind === "task", (e) => e.child(h_flex().gap(18).items_start().flex_none().flex_wrap()
          .when(!isOrg(c), (e) => e.child(v_flex().gap(6).child(caption("Calendar")).child(h_flex().gap(6).children(CALS.map(([n, val]) => pill(`cal-${val}`, n, c.cal === val, (cx) => this.moveTo(val, cx)))))))
          .child(v_flex().gap(6).child(caption("Due")).child(pill("due-pick", this.due.value().trim() || "Set date…", this.calOpen, (cx) => { this.calOpen = !this.calOpen; this.dueOrig = this.due.value(); const d = this.dueParts().date; if (this.calOpen && d) this.calendar.set_value(d); this.pickerFocus = this.calOpen; this.pcur = d || today(); if (this.calOpen) this.handle.focus(); cx.notify(); })))
          .child(v_flex().gap(6).child(caption("Priority")).child(h_flex().gap(6).children(PRIOS.map(([n, val]) => pill(`pr-${val}`, n, c.prio === val, (cx) => this.setField({ prio: val }, cx))))))
          .child(v_flex().gap(6).child(caption("Status")).child(h_flex().gap(6).children(STATUSES.map(([n, val]) => pill(`st-${val}`, n, c.status === val, (cx) => this.setField({ status: val }, cx))))))))
        .when(c.kind === "task" && this.calOpen, (e) => e.child(picker))
        .child(v_flex().gap(6).flex_1().min_h(0).child(caption("Body"))
          .child(Textarea.new(this.body).flex_1().min_h(120).px(10).py(8).rounded(9).border_1().border_color(this.focused.has("body") ? t.accent : t.border).bg(t.raised).text_size(12.8).text_color(t.foreground)))
        .child(h_flex().h(18).flex_none().text_size(11).text_color(this.note ? t.blocked : t.dim).child(this.note ?? this.state));

    const lines = ((c?.url && !(c?.body ?? "").includes(c.url) ? c.url + "\n\n" : "") + (c?.body ?? "")).replace(/\n+$/, "").split("\n");
    const off = Math.min(this.pvOff, Math.max(0, lines.length - 1));
    const prioName = { 1: "High", 5: "Medium", 9: "Low" }[c?.prio];
    const statusName = (STATUSES.find(([, v]) => v === c?.status) ?? [])[0];
    const meta = (text) => div().h(20).flex().items_center().flex_none().text_size(11).text_color(t.dim).child(text);
    const viewPane = !c ? editPane : v_flex().flex_1().min_h(0).p(14).gap(10)
      .child(h_flex().gap(8).items_center().flex_none().h(28)
        .child(div().flex_1().min_w(0).truncate().text_size(16).font_medium().text_color(t.foreground).child(c.title))
        .child(h_flex().gap(6).flex_none()
          .child(pill("view-copy", "Copy", false, (cx) => { this.copyText((c.body ?? "").replace(/\n+$/, ""), "body", cx); cx.notify(); }))
          .when(this.urls().length > 0, (e) => e.child(pill("view-open", "Open link", false, (cx) => { this.openLink(this.urls()[0], cx); cx.notify(); })))
          .child(pill("view-edit", "Edit", false, (cx) => this.enterEdit(cx)))))
      .child(h_flex().gap(8).items_center().flex_none().h(20).overflow_hidden()
        .child(meta(isOrg(c) ? `${c.kind === "note" ? "Note" : "Task"} · ORG (OpenBot)` : c.kind === "note" ? "Note · MEMO" : `Task · ${c.cal.toUpperCase()}`))
        .children(c.cats.map((cat) => div().h(20).px(8).flex().items_center().flex_none().rounded(6).border_1().border_color(t.border).text_size(11).text_color(t.muted).child(cat)))
        .when(c.kind === "task" && Boolean(c.due), (e) => e.child(meta(`Due ${c.due}`)))
        .when(c.kind === "task" && Boolean(prioName), (e) => e.child(meta(`${prioName} priority`)))
        .when(c.kind === "task" && Boolean(statusName), (e) => e.child(meta(statusName))))
      .when(hasAtt, (e) => e.child(attRow()))
      .child(div().h(1).flex_none().bg(t.border))
      .child(div().id("memo-view").flex_1().min_h(0).overflow_hidden()
        .on_scroll_wheel((e, cx) => { const dy = e.delta_lines?.y ?? e.delta.y; if (dy) { this.scrollView(dy < 0 ? 3 : -3); cx.notify(); } })
        .child(v_flex().w_full().children(lines.slice(off, off + 250).map((l, i) => { const u = (l.match(/https?:\/\/[^\s<>"')\]]+/) ?? [])[0]?.replace(/[.,;:!?]+$/, ""); const row = div().w_full().flex_none().min_h(l.trim() ? 18 : 10).text_size(13).text_color(u ? t.accent : this.rightFocus ? t.foreground : t.muted).child(l); return u ? row.id(`lnk-${off + i}`).cursor_pointer().on_click((ev, cx) => { this.openLink(u, cx); cx.notify(); }) : row; }))))
      .when(lines.length > 1 || Boolean(this.flash), (e) => e.child(div().flex_none().text_size(11).text_color(this.flash ? t.accent : t.dim).child(this.flash || `line ${off + 1} of ${lines.length}`)));
    const detail = this.editing ? editPane : viewPane;

    const hint = this.helpOpen ? ""
      : this.pickerFocus ? "H J K L day · [ ] hour · , . minute · Enter done · C cancel · 0 no time · x clear"
      : this.typing ? "Tab next field · Ctrl H back · Ctrl L picker"
      : this.rightFocus && !this.editing ? "O open · U copy link · F attachment · x done"
      : "n note · T Y W task · B link · O open · x done" + (this.tab === "all" || this.tab === "task" ? ` · A ${this.showDone ? "hide" : "show"} done` : "");

    return v_flex().id("memo").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().min_h(0).rounded(10).overflow_hidden().border_1().border_color(t.border).bg(t.background).text_size(13).text_color(t.foreground)
      .child(h_flex().h(30).flex_none().pr(10).items_center().border_b(1).border_color(t.border)
        .child(div().h_full().pl(12).pr(6).flex().items_center().flex_none().text_size(12).font_medium().text_color(t.accent).child("Memo"))
        .children(TABS.map(([id, text], n) => tab(id, text, n + 1, this.tab === id, n === 0)))
        .child(div().flex_1().min_w(0).truncate().px(10).text_size(12).text_color(this.error ? t.blocked : t.dim).child(this.error ?? ""))
        .when(Boolean(hint), (e) => e.child(keyHints(hint, t)))
        .when(this.helpOpen, (e) => e.child(div().text_size(12).text_color(t.dim).mr(6).child("back")))
        .when(!this.typing, (e) => e.child(div().pl(this.helpOpen ? 0 : 14).flex().items_center().child(keyChip("?", t)))))
      .when(this.helpOpen, (e) => e.child(h_flex().flex_1().min_h(0).items_start().gap(28).p(18).children([HELP.slice(0, 2), HELP.slice(2)].map((col, ci) =>
        v_flex().id(`help-${ci}`).flex_1().min_w(0).h_full().min_h(0).gap(14).overflow_y_scrollbar().children(col.map(([title, rows]) =>
          v_flex().gap(6).flex_none().child(caption(title)).children(rows.map(([keys, text]) =>
            h_flex().gap(10).items_start().child(div().w(150).flex_none().flex().flex_wrap().gap(4).children(keys.split(" · ").map((kk) => keyChip(kk, t))))
              .child(div().flex_1().min_w(0).text_size(12).text_color(t.muted).child(text))))))))))
      .when(!this.helpOpen, (e) => e.child(h_flex().flex_1().min_h(0).items_start()
        .child(v_flex().w(430).h_full().flex_none().min_h(0).border_r(1).border_color(t.border).p(14).gap(10)
          .child(Input.new(this.search).h(32).px(10).rounded(9).border_1().border_color(this.focused.has("search") ? t.accent : t.border).bg(t.raised).text_size(12.8).text_color(t.foreground))
          .when(this.tab === "bookmark" && bcats.length > 0, (e) => e.child(h_flex().gap(6).items_center().flex_wrap().flex_none().max_h(76).overflow_y_scrollbar()
            .children(bcats.map((cat) => pill(`bf-${cat}`, `${cat} ${catCount[cat] ?? 0}`, this.catFilter.has(cat), (cx) => { this.catFilter.has(cat) ? this.catFilter.delete(cat) : this.catFilter.add(cat); this.keepSelection(cx); cx.notify(); })))
            .when(this.catFilter.size > 0, (x) => x.child(pill("bf-clear", "clear", false, (cx) => { this.catFilter.clear(); this.keepSelection(cx); cx.notify(); })))))
          .child(v_flex().flex_1().min_h(0).gap(1).overflow_y_scrollbar().children(rows.length ? rows : [div().px(10).py(8).text_size(12).text_color(t.dim).child(this.loaded ? "No entries." : "Loading…")])))
        .child(v_flex().flex_1().min_w(0).h_full().min_h(0).child(detail))));
  }
}
