import { exec, hc, notify } from "herdr";

export const MARK = "devservers:";
export const BM_KEY = "devservers.bookmarks";
// Command without the project's own path and node_modules/.bin, so "astro dev" reads as "astro dev".
export const short = (l) => {
  let c = l.cmd || l.comm || "";
  for (const d of [l.root, l.cwd]) if (d && d !== "/") c = c.split(d + "/").join("");
  return c.replace(/^node (\S*\/)?(node_modules\/\.bin\/)?/, "").replace(/node_modules\/\.bin\//g, "").trim();
};
// One listener per line: port, pid, comm, address, cwd, git root, seconds up, bookmark id (an ancestor started by
// Go), full command (last, may contain anything).
export const PROBE = `
ss -ltnpH 2>/dev/null | while read -r _ _ _ local _ users; do
  pid=$(printf '%s' "$users" | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2); [ -n "$pid" ] || continue
  port=\${local##*:}; addr=\${local%:*}
  cwd=$(readlink /proc/$pid/cwd 2>/dev/null); cmd=$(tr '\\0' ' ' </proc/$pid/cmdline 2>/dev/null)
  comm=$(cat /proc/$pid/comm 2>/dev/null); up=$(ps -o etimes= -p $pid 2>/dev/null | tr -d ' ')
  root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)
  bm=""; p=$pid; i=0
  while [ "$p" -gt 1 ] && [ $i -lt 12 ]; do
    c=$(tr '\\0' ' ' </proc/$p/cmdline 2>/dev/null)
    case "$c" in *${MARK}*) bm=$(printf '%s' "$c" | grep -o '${MARK}[a-z0-9]*' | head -1 | cut -d: -f2); break;; esac
    p=$(ps -o ppid= -p $p 2>/dev/null | tr -d ' '); [ -n "$p" ] || break; i=$((i+1))
  done
  printf '%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$port" "$pid" "$comm" "$addr" "$cwd" "$root" "$up" "$bm" "$cmd"
done
`;

export function parse(out) {
  const seen = new Set(), list = [];
  for (const line of out.split("\n")) {
    const f = line.split("\t");
    if (f.length < 9) continue;
    const [port, pid, comm, addr, cwd, root, up, bm] = f, cmd = f.slice(8).join("\t").trim();
    if (seen.has(port + ":" + pid)) continue;
    seen.add(port + ":" + pid);
    list.push({ port: Number(port), pid: Number(pid), comm, addr, cwd, root, up: Number(up) || 0, bm, cmd });
  }
  return list.sort((a, b) => a.port - b.port);
}

export const tidy = (l) => short(l).split(/\s+/).map((w) => (w.includes("/") ? w.replace(/\/$/, "").split("/").pop() : w)).filter(Boolean).slice(0, 4).join(" ");
export const sleep = (ms) => exec("sleep", [String(ms / 1000)]);
export const dage = (s) => (s >= 86400 ? `${Math.floor(s / 86400)}d` : s >= 3600 ? `${Math.floor(s / 3600)}h` : s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`);

// Starts a command in a hidden herdr-core terminal running the interactive shell (PATH and version managers apply).
// The marker is also an argument of the shell itself, and `; exit` stops sh from exec-ing into it: the probe finds a
// bookmark's servers by walking their parents for it.
export async function launch(folder, cmd, name, id) {
  const args = ["run", "--bg", "--json", "--no-parent", "--name", name, "--cwd", folder];
  if (id) args.push("--label", "devservers=" + id);
  args.push("--", "sh", "-c", '"${SHELL:-zsh}" -ic "$1" "$0"; exit $?', MARK + (id ?? "adhoc"), cmd);
  try { const r = await hc(args); if (r.code !== 0) notify({ title: "Couldn't start " + name, body: (r.stderr || r.stdout).trim().split("\n")[0], level: "error" }); }
  catch (e) { notify({ title: "Couldn't start " + name, body: String(e.message ?? e), level: "error" }); }
}

// Only signals the pid while it still runs the command the scan saw (pids get reused).
export const kill = (l) => exec("sh", ["-c", 'c=$(tr "\\0" " " </proc/$1/cmdline 2>/dev/null); [ "${c% }" = "$2" ] && kill "$1"', "sh", String(l.pid), l.cmd]).catch(() => null);
