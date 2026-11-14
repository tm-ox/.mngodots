// Bookmark form for the Inbox's Dev servers section: an inline box at the top of the section (like the quick-add task row).
// Name, command, folder. Enter moves on, the last field saves, Tab cycles, Esc cancels. Bookmarks are shared("devservers.bookmarks").
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { shared, setShared, notify, home, focused, pickFolder, spaces } from "herdr";
import { BM_KEY } from "./devs.js";
import { leavePanel, dictate } from "./lib.js";

const DEFAULT_CMD = "npm run dev";
const tilde = (p) => (p ?? "").replace(/^\/home\/[^/]+/, "~");
export const base = (p) => (p ?? "").replace(/\/$/, "").split("/").pop();
export const bookmarks = () => { const v = shared(BM_KEY); return Array.isArray(v) ? v : []; };
export const removeBookmark = (b) => setShared(BM_KEY, bookmarks().filter((x) => x.id !== b.id));
export const presetFor = (l) => ({ name: base(l.root || l.cwd), cmd: DEFAULT_CMD, folder: l.root || l.cwd });

export class DevForm {
  constructor(host) { this.host = host; this.fields = null; this.at = 0; this.editId = null; }

  open(preset, editId, cx) {
    const mk = (placeholder, value) => InputState.new({ placeholder, value: value ?? "" });
    this.fields = [mk("Name (storybook)", preset?.name), mk("Command (npm run dev)", preset?.cmd ?? DEFAULT_CMD), mk("Folder", tilde(preset?.folder ?? focused()?.cwd ?? ""))];
    this.fields.forEach((f, i) => f.on("submit", (_e, cx) => (i < 2 ? this.focusField(i + 1) : this.save(cx))));
    this.editId = editId; this.at = 0;
    cx.timer.after(50, () => this.focusField(0));
    cx.notify();
  }

  focusField(i) { this.at = i; this.fields[i].focus(); this.host.cxRef.notify(); }

  save(cx) {
    const [name, cmd, folder] = this.fields.map((f) => f.value().trim());
    if (!name || !cmd || !folder) return notify({ title: "Bookmark needs a name, command and folder", level: "error" });
    const entry = { id: this.editId ?? Math.random().toString(36).slice(2, 8), name, cmd, folder: folder.replace(/^~(?=\/|$)/, home()) };
    const list = bookmarks();
    setShared(BM_KEY, this.editId ? list.map((x) => (x.id === entry.id ? entry : x)) : [...list, entry]);
    this.host.sel = "b:" + entry.id;
    this.close(cx);
  }

  close(cx) { this.host.devf = null; this.host.handle.focus(); this.host.scanDevs(cx); cx.notify(); }

  setFolder(dir, cx) { const [name, , folder] = this.fields; folder.set_value(tilde(dir)); if (!name.value().trim()) name.set_value(base(dir)); cx.notify(); }

  browse(cx) { cx.spawn(async (cx) => { const dir = await pickFolder({ prompt: "Project folder" }); if (dir && this.host.devf === this) this.setFolder(dir, cx); cx.notify(); }); }

  suggestions() { return [...new Set(spaces().map((sp) => sp.folder).filter(Boolean))].slice(0, 6); }

  // Keys while the form is open: everything else goes to the focused field.
  key(e, cx) {
    const k = e.key;
    if (e.modifiers?.alt && ["h", "j", "k", "l"].includes(k)) { leavePanel({ h: "left", j: "down", k: "up", l: "right" }[k]); cx.timer.after(150, (cx) => cx.notify()); cx.stop_propagation(); return; }
    if (dictate(e, cx, this.fields[this.at])) return;
    if (k === "escape") this.close(cx); else if (k === "tab") this.focusField((this.at + 1) % 3); else return;
    cx.stop_propagation();
  }

  render(t) {
    const input = (i) => Input.new(this.fields[i]).h(28).px(8).rounded(7).border_1().border_color(this.at === i ? t.accent : t.border).bg(t.raised).text_size(12.8).text_color(t.foreground);
    const small = (id, text, fn, color) => div().id(id).flex_none().h(22).px(8).flex().items_center().rounded(6).cursor_pointer().text_size(11).text_color(color ?? t.muted).border_1().border_color(t.border).hover((x) => x.bg(t.hover))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => { fn(cx); cx.stop_propagation(); cx.notify(); }).child(text);
    return v_flex().id("dev-form").flex_none().p(8).gap(6).rounded(7).border_1().border_color(t.accent).bg(t.raised)
      .child(h_flex().gap(8).items_center().child(div().flex_1().text_size(11).text_color(t.dim).child(this.editId ? "Edit bookmark" : "New bookmark"))
        .child(div().text_size(11).text_color(t.dim).child("Enter next · Tab switch · Esc cancel")))
      .child(input(0)).child(input(1)).child(input(2))
      .child(h_flex().gap(6).items_center().flex_wrap().child(small("dev-browse", "Browse…", (cx) => this.browse(cx), t.accent))
        .children(this.suggestions().map((d, n) => small("dev-pick-" + n, tilde(d), (cx) => this.setFolder(d, cx)))));
  }
}
