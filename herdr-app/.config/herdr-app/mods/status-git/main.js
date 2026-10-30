import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, focused, hc, panes } from "herdr";

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.dirty = null;
    this.serving = [];
    this.pr = [];
    this.prKey = null;
    this.prAt = 0;
    this.poll(cx);
    this.listen(cx);
    this.prs(cx);
    cx.timer.every(5000, (cx) => { this.poll(cx); this.listen(cx); this.prs(cx); });
  }

  // Changed-file count of the focused terminal's repo (clicking it opens the floating Changes window).
  poll(cx) {
    const cwd = focused()?.cwd;
    cx.spawn(async (cx) => {
      let n = null;
      try {
        if (cwd) {
          const r = await hc(["exec", "git", "--no-optional-locks", "-C", cwd, "status", "--porcelain"]);
          if (r.code === 0) n = r.stdout.split("\n").filter(Boolean).length;
        }
      } catch {}
      if (n !== this.dirty) { this.dirty = n; cx.notify(); }
    });
  }

  // Open PRs of the git repos the active tab's terminals sit in (read only, `gh pr list`),
  // re-asked every 60 s or when the set of folders changes.
  prs(cx) {
    const sp = spaces().find((x) => x.active);
    const tabs = new Set((sp?.tabs ?? []).filter((x) => x.active).map((x) => x.id));
    const here = panes().filter((p) => p.terminal && p.cwd && tabs.has(p.tab));
    const cwds = [...new Set(here.map((p) => p.cwd))].slice(0, 8);
    const key = cwds.join("|") + "#" + here.map((p) => p.branch).join(",");
    if (key === this.prKey && Date.now() - this.prAt < 60000) return;
    this.prKey = key;
    this.prAt = Date.now();
    const script = 'cd "$1" 2>/dev/null && top=$(git rev-parse --show-toplevel 2>/dev/null) && echo "$top" && gh pr list --state open --limit 30 --json number,headRefName,isDraft,reviewDecision,statusCheckRollup,url 2>/dev/null';
    cx.spawn(async (cx) => {
      const repos = new Map();
      await Promise.all(cwds.map(async (cwd) => {
        try {
          const r = await hc(["exec", "sh", "-c", script, "sh", cwd]);
          if (r.code !== 0) return;
          const [top, ...rest] = r.stdout.split("\n");
          if (!top || repos.has(top)) return;
          const list = JSON.parse(rest.join("\n") || "[]");
          const branches = here.filter((p) => p.cwd === cwd || p.cwd?.startsWith(top + "/")).map((p) => p.branch);
          const mine = list.find((d) => branches.includes(d.headRefName));
          const checks = mine?.statusCheckRollup ?? [];
          const bad = checks.some((c) => ["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED"].includes(c.conclusion) || c.state === "FAILURE" || c.state === "ERROR");
          const wait = checks.some((c) => (c.status && c.status !== "COMPLETED") || c.state === "PENDING");
          repos.set(top, {
            name: top.split("/").pop(),
            count: list.filter((d) => !d.isDraft).length,
            url: (mine ?? list[0])?.url?.replace(/\/pull\/\d+$/, mine ? "$&" : "/pulls"),
            mine: mine && { n: mine.number, draft: mine.isDraft, review: mine.reviewDecision, checks: bad ? "fail" : wait ? "wait" : checks.length ? "pass" : "none" },
          });
        } catch {}
      }));
      const pr = [...repos.values()].filter((x) => x.count > 0 || x.mine);
      if (JSON.stringify(pr) !== JSON.stringify(this.pr)) { this.pr = pr; cx.notify(); }
    });
  }

  // Dev servers: listeners whose process runs from a folder under ~/workspace (read only).
  listen(cx) {
    cx.spawn(async (cx) => {
      let found = [];
      try {
        const script = `ss -ltnpH | sed -n 's/.*:\\([0-9]*\\) .*pid=\\([0-9]*\\),.*/\\1 \\2/p' | sort -u | while read p pid; do c=$(readlink /proc/$pid/cwd 2>/dev/null); case "$c" in "$HOME"/workspace/*|"$HOME"/repos/*) echo "$p $c";; esac; done`;
        const r = await hc(["exec", "sh", "-c", script]);
        if (r.code === 0) found = r.stdout.split("\n").filter(Boolean).map((l) => { const [port, ...cwd] = l.split(" "); return { port, cwd: cwd.join(" ") }; });
      } catch {}
      if (JSON.stringify(found) !== JSON.stringify(this.serving)) { this.serving = found; cx.notify(); }
    });
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .when(this.dirty > 0, el => el.child(div().id("dirty").cursor_pointer().text_color(t.blocked).on_click(() => run("mod.open", { name: "changes-float" })).child(`● ${this.dirty} changed`)))
      .when(Boolean(this.pr?.length), el => el.child(h_flex().gap(10).items_center()
        .children(this.pr.slice(0, 3).map((r, i) => {
          const m = r.mine;
          const mark = m ? { pass: "✓", fail: "✗", wait: "…", none: "" }[m.checks] : "";
          const note = m ? (m.draft ? "draft" : m.review === "APPROVED" ? "approved" : m.review === "CHANGES_REQUESTED" ? "changes requested" : "") : "";
          const color = !m ? t.muted : m.checks === "fail" ? t.blocked : m.checks === "wait" ? t.working : m.checks === "pass" ? t.done : t.foreground;
          const text = m ? `${r.name} PR #${m.n} ${mark} ${note}`.replace(/\s+/g, " ").trim() : `${r.name} · ${r.count} PR${r.count > 1 ? "s" : ""}`;
          return div().id(`pr-${i}`).cursor_pointer().text_color(color).on_click(() => hc(["exec", "xdg-open", r.url]).catch(() => {})).child(text);
        }))
        .when(this.pr.length > 3, e => e.child(div().child(`+${this.pr.length - 3}`)))))
      .when(this.serving.length > 0, el => el.child(h_flex().gap(8).items_center().text_color(t.working)
        .children(this.serving.slice(0, 4).map(v => div().child(`▲ :${v.port} ${v.cwd.split("/").pop()}`)))
        .when(this.serving.length > 4, e => e.child(div().child(`+${this.serving.length - 4}`)))))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(`${window()?.platform === "macos" ? "⌘" : "Ctrl"} Shift P  commands`));
  }
}
