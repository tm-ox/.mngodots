import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, focused, hc, exec, panes, notify, setShared, shared } from "herdr";

// tm-serve, read only (plain file reads and status commands; nothing here approves, rejects or starts anything):
// pending broker requests (queue/*.json, one line each after the mtime), the last `sync` entry of the audit log,
// and the status of dev-server and throwaway-mongo. Published as shared("broker").
const BROKER_SCRIPT = `B="$HOME/.local/share/gh-broker"
for f in "$B"/queue/*.json; do [ -f "$f" ] || continue; echo "Q $(stat -c %Y "$f")"; tr '\\n' ' ' <"$f"; echo; done
echo "S $(grep '"cmd": "sync"' "$B/audit.jsonl" 2>/dev/null | tail -n 1 | grep -o '"t": [0-9]*' | grep -o '[0-9]*')"
echo "D"; "$HOME/.local/bin/dev-server" status 2>&1
echo "M"; "$HOME/.local/bin/throwaway-mongo" status 2>&1`;
function parseBroker(out) {
  const queue = [], dev = [], mongo = [];
  let syncAt = 0, mode = "", mt = 0;
  for (const line of out.split("\n")) {
    if (mode === "q") { mode = ""; try { const q = JSON.parse(line); queue.push({ id: q.id, kind: q.kind, repo: q.repo, branch: q.branch, pr: q.pr, mode: q.mode, title: q.title, profile: q.profile, at: mt * 1000 }); } catch {} continue; }
    if (line.startsWith("Q ")) { mt = Number(line.slice(2)) || 0; mode = "q"; }
    else if (line.startsWith("S ")) syncAt = (Number(line.slice(2)) || 0) * 1000;
    else if (line === "D" || line === "M") mode = line.toLowerCase();
    else if (line.trim() && mode === "d") dev.push(line.trim());
    else if (line.trim() && mode === "m") mongo.push(line.trim());
  }
  return { queue: queue.sort((a, b) => a.at - b.at), dev, mongo, syncAt };
}

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
// Inbox: PRs that name you (review requested), PRs you already reviewed (waiting on the author), and your own.
// One GraphQL call covers every repo you can see, cloned or not. Published as shared("inbox"); the git window
// asks for a refresh by writing shared("inbox-ask") (checked on the 5 s tick).
const INBOX_QUERY = `fragment F on PullRequest {
  number title url isDraft createdAt updatedAt additions deletions changedFiles reviewDecision headRefOid
  author { login }
  repository { nameWithOwner }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
  latestReviews(first: 10) { nodes { author { login } state submittedAt commit { oid } } }
  comments(last: 8) { nodes { createdAt author { login } } }
  reviewThreads(last: 30) { nodes { comments(last: 3) { nodes { createdAt author { login } } } } }
  files(first: 100) { nodes { path } }
}
query($q1: String!, $q2: String!, $q3: String!, $q4: String!) {
  a: search(query: $q1, type: ISSUE, first: 50) { nodes { ...F } }
  b: search(query: $q2, type: ISSUE, first: 50) { nodes { ...F } }
  c: search(query: $q3, type: ISSUE, first: 50) { nodes { ...F } }
  d: search(query: $q4, type: ISSUE, first: 100) { nodes { ...F } }
}`;
const ciOf = (s) => s === "SUCCESS" ? "pass" : s === "FAILURE" || s === "ERROR" ? "fail" : s ? "wait" : "none";
// Risk heuristics (a hint, never a gate): paths that touch auth or infrastructure, or a large diff. The review
// policy asks for a second approval on those; the lead dev's call stays with you.
const RISK_AUTH = /(^|\/)(auth|oauth|login|sso|session|permissions?|rbac|iam|security|secrets?|crypto)(\/|\.|-|_|$)/i;
const RISK_INFRA = /(^|\/)(terraform|infra|infrastructure|deploy|k8s|helm|docker|migrations?)(\/|\.|-|_|$)|\.github\/workflows|Dockerfile|\.tf$/i;
const riskOf = (n) => {
  const paths = (n.files?.nodes ?? []).map((f) => f.path);
  return paths.some((p) => RISK_AUTH.test(p)) ? "auth" : paths.some((p) => RISK_INFRA.test(p)) ? "infra" : n.additions + n.deletions > 800 ? "large" : "";
};
const inboxRow = (n, me) => {
  const rev = n.latestReviews?.nodes ?? [], mine = rev.find((x) => x.author?.login === me), last = n.comments?.nodes?.at(-1);
  const flag = mine && mine.commit?.oid && mine.commit.oid !== n.headRefOid ? "re-review"
    : mine && last && last.author?.login !== me && Date.parse(last.createdAt) > Date.parse(mine.submittedAt) ? "replied" : "";
  const by = n.author?.login ?? "";
  // Newest activity by someone else (comment, review, inline thread reply) after your own last action; 0 if none.
  const ev = [];
  for (const c of n.comments?.nodes ?? []) ev.push([c.author?.login, c.createdAt]);
  for (const r of n.latestReviews?.nodes ?? []) ev.push([r.author?.login, r.submittedAt]);
  for (const th of n.reviewThreads?.nodes ?? []) for (const c of th.comments?.nodes ?? []) ev.push([c.author?.login, c.createdAt]);
  let myAt = 0, otherAt = 0;
  for (const [who, at] of ev) { const ms = Date.parse(at) || 0; if (!who || who.endsWith("[bot]")) continue; if (who === me) myAt = Math.max(myAt, ms); else otherAt = Math.max(otherAt, ms); }
  const act = otherAt > myAt ? otherAt : 0;
  const appr = rev.filter((x) => x.state === "APPROVED" && x.author?.login && x.author.login !== by).map((x) => x.author.login);
  const risk = riskOf(n);
  return { act, repo: n.repository.nameWithOwner, n: n.number, title: n.title, url: n.url, author: by, createdAt: n.createdAt, updatedAt: n.updatedAt, draft: n.isDraft, add: n.additions, del: n.deletions, files: n.changedFiles, ci: ciOf(n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state), decision: n.reviewDecision ?? "", my: mine?.state ?? "", flag, appr, risk, covered: appr.length > 0 && !(risk && appr.length < 2) };
};
// A PR of yours is ready once someone approved, nothing asks for changes and CI is not failing or running.
const readyOf = (d) => !d.draft && d.decision !== "CHANGES_REQUESTED" && (d.appr.length > 0 || d.decision === "APPROVED") && d.ci !== "fail" && d.ci !== "wait";

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
    this.rerev = 0; // reviewed PRs with new commits or replies since your review
    this.asked = new Set(); // review requests already announced (inbox)
    this.readyAnn = new Set(); // own PRs already announced as ready to merge
    this.ready = 0;
    this.inboxAt = 0; this.inboxBusy = false; this.inboxSeen = false;
    this.me = null;
    this.poll(cx);
    this.listen(cx);
    this.prs(cx);
    this.inbox(cx);
    this.broker = null; this.brokerBusy = false; this.brokerAt = 0;
    this.brokerPoll(cx);
    let tick = 0;
    cx.timer.every(5000, (cx) => { this.poll(cx); this.prs(cx); this.inbox(cx); if (tick++ % 3 === 0) this.listen(cx); this.brokerPoll(cx); });
  }

  // tm-serve broker queue, sync age and dev lamps: every 20 s, or sooner when a mod writes shared("broker-ask").
  brokerPoll(cx) {
    const ask = shared("broker-ask") || 0;
    if (this.brokerBusy || (Date.now() - this.brokerAt < 20000 && ask <= this.brokerAt)) return;
    this.brokerBusy = true; this.brokerAt = Date.now();
    cx.spawn(async (cx) => {
      try {
        const r = await exec("sh", ["-c", BROKER_SCRIPT], { on: "tm-serve" });
        if (r.code !== 0) throw new Error("tm-serve probe failed");
        const b = { at: Date.now(), ok: true, ...parseBroker(r.stdout) };
        if (JSON.stringify({ ...b, at: 0 }) !== JSON.stringify({ ...(this.broker ?? {}), at: 0 })) cx.notify();
        this.broker = b; setShared("broker", b);
      } catch (e) {
        const b = { ...(this.broker ?? { queue: [], dev: [], mongo: [], syncAt: 0 }), at: Date.now(), ok: false, err: String(e.message ?? e) };
        this.broker = b; setShared("broker", b); cx.notify();
      }
      this.brokerBusy = false;
    });
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
      for (const [top, r] of repos) r.cwds = detail.get(top).cwds;
      const pr = [...repos.values()].filter((x) => x.cwds.some((c) => active.includes(c)) && (x.count > 0 || x.mine));
      if (JSON.stringify(pr) !== JSON.stringify(this.pr) || this.merged.length !== this.shownMerged) { this.pr = pr; this.shownMerged = this.merged.length; cx.notify(); }
    });
  }

  // Inbox of the signed-in user across all repos (read only), every 60 s or when the window asks.
  inbox(cx) {
    const ask = shared("inbox-ask") || 0;
    if (this.inboxBusy || (Date.now() - this.inboxAt < 60000 && ask <= this.inboxAt)) return;
    this.inboxBusy = true; this.inboxAt = Date.now();
    let finished = false;
    // No setTimeout in mods: if the call hangs, surface it and allow a retry.
    cx.timer.after(30000, () => { if (!finished) { setShared("inbox-error", "GitHub request did not return in 30 s"); this.inboxBusy = false; } });
    cx.spawn(async (cx) => {
      try {
        if (!this.me) {
          const r = await hc(["exec", "gh", "api", "user", "-q", ".login"]);
          if (r.code !== 0) throw new Error((r.stderr || "gh not signed in").trim().split("\n")[0]);
          this.me = r.stdout.trim(); setShared("git-me", this.me);
        }
        // Scope: shared("inbox-orgs") (default Beyond-One-AU only); an empty list means every org and personal repo.
        const orgs = Array.isArray(shared("inbox-orgs")) ? shared("inbox-orgs") : ["Beyond-One-AU"];
        const base = "is:pr is:open archived:false " + orgs.map((o) => `org:${o} `).join(""), me = this.me;
        const r = await hc(["exec", "sh", "-c", 'exec gh api graphql -f query="$1" -f q1="$2" -f q2="$3" -f q3="$4" -f q4="$5" 2>&1', "sh", INBOX_QUERY.replace(/\s+/g, " "), `${base}review-requested:${me}`, `${base}reviewed-by:${me} -author:${me} -review-requested:${me}`, `${base}author:${me}`, `${base}${orgs.length ? "" : `involves:${me}`}`]);
        if (r.code !== 0) throw new Error((r.stderr || r.stdout || "gh graphql failed").trim().split("\n")[0]);
        const data = JSON.parse(r.stdout).data;
        const rows = (k) => (data[k]?.nodes ?? []).filter((n) => n && n.repository).map((n) => inboxRow(n, me));
        const inbox = { at: Date.now(), me, scope: orgs.join(","), review: rows("a"), waiting: rows("b"), mine: rows("c"), all: rows("d") };
        // Toast for each new review request after the first scan (which only records).
        for (const d of inbox.review) {
          if (d.draft || d.covered || this.asked.has(d.url)) continue;
          this.asked.add(d.url);
          if (this.inboxSeen) {
            setShared("git-tab", "inbox");
            notify({ title: `Review requested: #${d.n}`, body: `${d.repo.split("/")[1]} | ${d.title}`, level: "warning", timeout: 0, action: { name: "mod.open", args: { name: "changes-float" } } });
          }
        }
        // Toast when one of your PRs becomes ready to merge (approved, CI not failing); risky ones ask for a second look.
        for (const d of inbox.mine) {
          if (!readyOf(d) || this.readyAnn.has(d.url)) continue;
          this.readyAnn.add(d.url);
          if (this.inboxSeen) {
            const second = d.risk && d.appr.length < 2;
            setShared("git-tab", "inbox");
            notify({ title: `PR #${d.n} ready to merge`, body: `${d.repo.split("/")[1]} | ${d.title}${second ? ` | touches ${d.risk}: consider a second approval` : ""}`, level: second ? "warning" : "success", timeout: 0, action: { name: "mod.open", args: { name: "changes-float" } } });
          }
        }
        if (!this.seenLoaded) { // opened-PR marks survive restarts in a file; with no file yet, everything current counts as seen
          this.seenLoaded = true;
          let seen = null;
          try { const f = await hc(["exec", "sh", "-c", 'cat "$HOME/.cache/herdr-pr-seen.json" 2>/dev/null']); if (f.code === 0 && f.stdout.trim()) seen = JSON.parse(f.stdout); } catch {}
          if (!seen) { seen = {}; for (const d of [...inbox.waiting, ...inbox.mine]) seen[d.url] = Date.now(); hc(["exec", "sh", "-c", 'mkdir -p "$HOME/.cache" && printf %s "$1" > "$HOME/.cache/herdr-pr-seen.json"', "sh", JSON.stringify(seen)]).catch(() => {}); }
          setShared("pr-seen", { ...seen, ...(shared("pr-seen") || {}) });
        }
        this.inboxSeen = true;
        setShared("inbox", inbox); setShared("inbox-error", "");
        const unc = inbox.review.filter((d) => !d.draft && !d.covered).sort((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt));
        const counts = { review: unc.length, oldest: unc[0]?.createdAt ?? "", rerev: inbox.waiting.filter((d) => d.flag).length, ready: inbox.mine.filter(readyOf).length, talk: [...inbox.waiting, ...inbox.mine].filter((d) => !d.draft && d.act > ((shared("pr-seen") || {})[d.url] || 0)).length, fix: inbox.mine.filter((d) => !d.draft && (d.decision === "CHANGES_REQUESTED" || d.ci === "fail")).length };
        if (JSON.stringify(counts) !== JSON.stringify(shared("inbox-counts"))) setShared("inbox-counts", counts); // header chips (tabs-tm)
        const reviews = inbox.review.filter((d) => !d.draft && !d.covered).map((d) => ({ n: d.n, repo: d.repo })), rerev = inbox.waiting.filter((d) => d.flag).length, ready = inbox.mine.filter(readyOf).length;
        if (JSON.stringify(reviews) !== JSON.stringify(this.reviews) || rerev !== this.rerev || ready !== this.ready) { this.reviews = reviews; this.rerev = rerev; this.ready = ready; cx.notify(); }
      } catch (e) { setShared("inbox-error", String(e).replace(/^Error: /, "")); }
      finished = true; this.inboxBusy = false;
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
    const snz = shared("snoozed") || {}, isSnz = (a) => snz[a.address] > Date.now();
    const needs = list.filter(a => a.status === "blocked" && !isSnz(a)).length;
    const queued = this.broker?.queue?.length ?? 0;
    this.devUp = (this.broker?.dev ?? []).filter((l) => / running/.test(l));
    this.mongoUp = (this.broker?.mongo ?? []).filter((l) => / running /.test(l));
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
      .when(fresh.length > 0, el => el.child(div().id("merged").cursor_pointer().text_color(t.done).on_click(() => { this.showGit("merged"); }).child(`✓ ${fresh.length} merged: ${fresh.slice(-2).map(m => `#${m.n}`).join(" ")}`)))
      .when(this.serving.length > 0, el => el.child(h_flex().gap(8).items_center().text_color(t.working)
        .children(this.serving.slice(0, 4).map(v => div().child(`▲ :${v.port} ${v.cwd.split("/").pop()}`)))
        .when(this.serving.length > 4, e => e.child(div().child(`+${this.serving.length - 4}`)))))
      .when(this.devUp.length + this.mongoUp.length > 0, el => el.child(div().id("serve-chip").cursor_pointer().text_color(t.working).on_click(() => run("mod.open", { name: "devservers" }))
        .child(`tm-serve ${[...this.devUp.map((l) => "▲ :" + l.split(" ")[0]), ...(this.mongoUp.length ? [`mongo ${this.mongoUp.length}`] : [])].join(" · ")}`)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs + queued > 0, el => el.child(div().id("needs-you").cursor_pointer().text_color(t.blocked).on_click(() => run("mod.open", { name: "changes-float" })).child(`· ${needs + queued} needs you${queued ? ` (${queued} to approve)` : ""}`)))
        .when(list.filter(a => a.status === "done").length > 0, el => el.child(div().text_color(t.done).child(`· ${list.filter(a => a.status === "done").length} done`)))
        .when(list.filter(a => a.status === "working").length > 0, el => el.child(div().text_color(t.working).child(`· ${list.filter(a => a.status === "working").length} working`))))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(`${window()?.platform === "macos" ? "⌘" : "Ctrl"} Shift P  commands`));
  }
}
