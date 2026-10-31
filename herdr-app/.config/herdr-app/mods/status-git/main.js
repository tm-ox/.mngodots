import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, focused, hc, panes, notify, setShared, shared } from "herdr";

// Repo pinned to the active tab (else its space): the agents run in ~/workspace while the code lives elsewhere.
// Stored in shared("git-pins") as { [tabId | "space:"+spaceId]: [repo paths] }; Herdr saves shared state itself.
function pinOf() {
  const sp = spaces().find((s) => s.active);
  if (!sp || sp.machine) return null;
  const tab = sp.tabs.find((t) => t.active), pins = shared("git-pins") || {};
  const list = (tab && pins[tab.id]) || pins["space:" + sp.id];
  return Array.isArray(list) && list.length ? list : null;
}
function setPin(list) {
  const sp = spaces().find((s) => s.active), tab = sp?.tabs.find((t) => t.active);
  if (!tab) return;
  const pins = { ...(shared("git-pins") || {}) };
  if (list) pins[tab.id] = list; else delete pins[tab.id];
  setShared("git-pins", pins);
}


const checkOf = (list) => {
  const bad = list.some((c) => ["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED"].includes(c.conclusion) || c.state === "FAILURE" || c.state === "ERROR");
  const wait = list.some((c) => (c.status && c.status !== "COMPLETED") || c.state === "PENDING");
  return bad ? "fail" : wait ? "wait" : list.length ? "pass" : "none";
};

// A review request counts when it names you or a team you belong to.
const asked = (d, me) => { const teams = shared("git-teams") || []; return (d.reviewRequests ?? []).some((q) => q.login === me || (q.slug && teams.includes(q.slug))); };
export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.dirty = null;
    this.serving = [];
    this.pr = [];
    this.prKey = null;
    this.prAt = 0;
    this.states = new Map(); // PR url -> last seen state
    this.known = new Set(); // repos already scanned once (first scan only records)
    this.merged = []; // merges noticed since the Merged tab was last opened
    this.reviews = []; // open PRs that ask for tm's review, across the active tab and pinned repos
    this.asked = new Set(); // review requests already announced
    this.me = null;
    this.poll(cx);
    this.listen(cx);
    this.prs(cx);
    let tick = 0;
    cx.timer.every(5000, (cx) => { this.poll(cx); this.prs(cx); if (tick++ % 3 === 0) this.listen(cx); });
  }

  // Changed-file count of the focused terminal's repo (clicking it opens the floating Changes window).
  poll(cx) {
    const cwd = pinOf()?.[0] ?? focused()?.cwd;
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

  // PRs of the repos the active tab works in plus every pinned repo (read only, `gh pr list`),
  // re-asked every 60 s or when the set of folders changes. Feeds the PR segment, the review count,
  // merge / review notices and (shared "pr-data") the git window.
  prs(cx) {
    const sp = spaces().find((x) => x.active);
    const tabs = new Set((sp?.tabs ?? []).filter((x) => x.active).map((x) => x.id));
    const here = panes().filter((p) => p.terminal && p.cwd && tabs.has(p.tab));
    const pin = pinOf();
    const active = pin ? pin.slice(0, 8) : [...new Set(here.map((p) => p.cwd))].slice(0, 8);
    const pinned = Object.values(shared("git-pins") || {}).flat().filter((x) => typeof x === "string");
    const cwds = [...new Set([...active, ...pinned])].slice(0, 12);
    const key = cwds.join("|") + "#" + here.map((p) => p.branch).join(",");
    if (key === this.prKey && Date.now() - this.prAt < 60000) return;
    this.prKey = key;
    this.prAt = Date.now();
    const script = 'cd "$1" 2>/dev/null && top=$(git rev-parse --show-toplevel 2>/dev/null) && echo "$top" && git rev-parse --abbrev-ref HEAD 2>/dev/null && gh pr list --state all --limit 40 --json number,title,headRefName,author,isDraft,state,reviewDecision,reviewRequests,statusCheckRollup,createdAt,mergedAt,url 2>/dev/null';
    cx.spawn(async (cx) => {
      this.tries = (this.tries ?? 0) + 1;
      if (!this.me) {
        try { const r = await hc(["exec", "gh", "api", "user", "-q", ".login"]); if (r.code === 0) { this.me = r.stdout.trim(); setShared("git-me", this.me); } } catch {}
        try { const r = await hc(["exec", "gh", "api", "user/teams", "-q", ".[].slug"]); if (r.code === 0) setShared("git-teams", r.stdout.split("\n").filter(Boolean)); } catch {}
      }
      const repos = new Map(), detail = new Map();
      await Promise.all(cwds.map(async (cwd) => {
        try {
          const r = await hc(["exec", "sh", "-c", script, "sh", cwd]);
          if (r.code !== 0) return;
          const [top, head, ...rest] = r.stdout.split("\n");
          if (!top) return;
          if (detail.has(top)) { detail.get(top).cwds.push(cwd); return; }
          const all = JSON.parse(rest.join("\n") || "[]");
          const name = top.split("/").pop();
          const first = !this.known.has(top);
          for (const d of all) {
            if (!first && this.states.get(d.url) === "OPEN" && d.state === "MERGED") {
              this.merged.push({ n: d.number, repo: name, at: Date.now() });
              setShared("git-tab", "merged");
              notify({ title: `PR #${d.number} merged`, body: `${name} | ${d.title}`, level: "success", timeout: 0, action: { name: "mod.open", args: { name: "changes-float" } } });
            }
            this.states.set(d.url, d.state);
            const wantsMe = Boolean(this.me) && d.state === "OPEN" && !d.isDraft && asked(d, this.me);
            if (wantsMe && !first && !this.asked.has(d.url)) {
              setShared("git-tab", "dashboard");
              notify({ title: `Review requested: #${d.number}`, body: `${name} | ${d.title}`, level: "warning", timeout: 0, action: { name: "mod.open", args: { name: "changes-float" } } });
            }
            if (wantsMe) this.asked.add(d.url);
          }
          if (this.me || this.tries > 2) this.known.add(top);
          const list = all.filter((d) => d.state === "OPEN");
          const cut = Date.now() - 14 * 864e5;
          detail.set(top, {
            top, name, branch: head, cwds: [cwd],
            open: list.filter((d) => !d.isDraft).map((d) => ({ ...d, checks: checkOf(d.statusCheckRollup ?? []), needsMe: Boolean(this.me) && asked(d, this.me) })),
            merged: all.filter((d) => d.state === "MERGED" && Date.parse(d.mergedAt) > cut).sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt)),
          });
          const branches = [head, ...here.filter((p) => p.cwd === cwd || p.cwd?.startsWith(top + "/")).map((p) => p.branch)];
          const mine = list.find((d) => branches.includes(d.headRefName));
          const checks = mine?.statusCheckRollup ?? [];
          repos.set(top, {
            name,
            cwds: [cwd],
            count: list.filter((d) => !d.isDraft).length,
            url: (mine ?? list[0])?.url?.replace(/\/pull\/\d+$/, mine ? "$&" : "/pulls"),
            mine: mine && { n: mine.number, draft: mine.isDraft, review: mine.reviewDecision, checks: checkOf(checks) },
          });
        } catch {}
      }));
      // Cached for the git window, so it opens with PRs already in.
      if (detail.size) setShared("pr-data", { at: Date.now(), repos: [...detail.values()] });
      const reviews = [...detail.values()].flatMap((r) => r.open.filter((d) => d.needsMe).map((d) => ({ n: d.number, repo: r.name })));
      for (const [top, r] of repos) r.cwds = detail.get(top).cwds;
      const pr = [...repos.values()].filter((x) => x.cwds.some((c) => active.includes(c)) && (x.count > 0 || x.mine));
      if (JSON.stringify(pr) !== JSON.stringify(this.pr) || JSON.stringify(reviews) !== JSON.stringify(this.reviews) || this.merged.length !== this.shownMerged) { this.pr = pr; this.reviews = reviews; this.shownMerged = this.merged.length; cx.notify(); }
    });
  }

  showGit(tab) {
    setShared("git-tab", tab);
    run("mod.open", { name: "changes-float" });
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
      if (JSON.stringify(found) !== JSON.stringify(this.serving)) { this.serving = found; setShared("serving", found); cx.notify(); }
    });
  }

  render() {
    const t = theme();
    const seen = shared("merged-seen") || 0, fresh = this.merged.filter((m) => m.at > seen);
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .when(this.dirty > 0, el => el.child(div().id("dirty").cursor_pointer().text_color(t.blocked).on_click(() => this.showGit("changes")).child(`● ${this.dirty} changed${pinOf() ? " (" + pinOf()[0].split("/").pop() + ")" : ""}`)))
      .when(Boolean(this.pr?.length), el => el.child(h_flex().gap(10).items_center()
        .children(this.pr.slice(0, 3).map((r, i) => {
          const m = r.mine;
          const mark = m ? { pass: "✓", fail: "✗", wait: "…", none: "" }[m.checks] : "";
          const note = m ? (m.draft ? "draft" : m.review === "APPROVED" ? "approved" : m.review === "CHANGES_REQUESTED" ? "changes requested" : "") : "";
          const color = !m ? t.muted : m.checks === "fail" ? t.blocked : m.checks === "wait" ? t.working : m.checks === "pass" ? t.done : t.foreground;
          const text = m ? `${r.name} PR #${m.n} ${mark} ${note}`.replace(/\s+/g, " ").trim() : `${r.name} · ${r.count} PR${r.count > 1 ? "s" : ""}`;
          return div().id(`pr-${i}`).cursor_pointer().text_color(color).on_click(() => this.showGit("open")).child(text);
        }))
        .when(this.pr.length > 3, e => e.child(div().child(`+${this.pr.length - 3}`)))))
      .when(this.reviews.length > 0, el => el.child(div().id("reviews").cursor_pointer().text_color(t.blocked).on_click(() => this.showGit("dashboard")).child(`${this.reviews.length} to review`)))
      .when(fresh.length > 0, el => el.child(div().id("merged").cursor_pointer().text_color(t.done).on_click(() => { this.showGit("merged"); }).child(`✓ ${fresh.length} merged: ${fresh.slice(-2).map(m => `#${m.n}`).join(" ")}`)))
      .when(this.serving.length > 0, el => el.child(h_flex().gap(8).items_center().text_color(t.working)
        .children(this.serving.slice(0, 4).map(v => div().child(`▲ :${v.port} ${v.cwd.split("/").pop()}`)))
        .when(this.serving.length > 4, e => e.child(div().child(`+${this.serving.length - 4}`)))))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(`${window()?.platform === "macos" ? "⌘" : "Ctrl"} Shift P  commands`));
  }
}
