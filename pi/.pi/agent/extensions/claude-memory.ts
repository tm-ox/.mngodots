// claude-memory.ts
//
// Port of Claude Code's two SessionStart hook scripts (new-project-init.sh and
// sync-memory.sh) so Pi reuses the SAME per-directory memory setup that Claude
// Code ("quad") manages: a pointer `CLAUDE.md` plus a repo-local `memory/`
// folder in each workspace-directory.
//
// Behaviour (mirrors new-project-init.sh):
//   - On session_start, find the workspace root by walking up from ctx.cwd for
//     a `.workspace-root` marker on the git toplevel.
//   - If cwd is outside the workspace, or is a dot-directory under it, do nothing.
//   - If cwd (or any ancestor up to the workspace root) already has a CLAUDE.md,
//     do nothing — that note owns the folder.
//   - Otherwise generate the SAME pointer text that new-project-init.sh writes
//     (byte-identical), plus memory/MEMORY.md if absent, so a Pi-generated
//     folder is indistinguishable from a Claude-generated one and the next
//     Claude session picks it up unchanged.
//
// Non-goals (left out deliberately): sync-memory.sh's symlink migration of
// ~/.claude/projects/*/memory into a private repo is Claude-specific plumbing
// with no Pi analog; Pi's hermes-memory manages its own store. This extension
// only bootstraps the shared, repo-local CLAUDE.md + memory/ convention.
//
// This file loads only when the extension directory is on Pi's extension path
// (already the case: ~/.mngodots/pi/.pi/agent/extensions is symlinked into
// ~/.pi/agent/extensions and auto-loaded on startup).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

// Byte-identical to the MSG block in ~/.claude-config/new-project-init.sh.
const POINTER_TEXT = `# Project memory

Project notes for this folder live in \`memory/\` (part of this repo, travels with it).
Read \`MEMORY.md\` there at the start of work and open only the notes relevant to the task. Save durable notes about how to work on this project (preferences, constraints, decisions) into that folder and add a one-line pointer to \`MEMORY.md\`. Never save them to the workspace-level memory.
Research findings, sources and other outputs are files: write them into this folder, not into memory.
Folder layout: project root holds only CLAUDE.md, memory/, docs/ (written documents, dated YYYY-MM-DD-slug.md) and supplied/ (inbound client or designer material, read-only; delete temporary test screenshots once used).
Keep this pointer file itself short — it is loaded in full every session regardless of relevance. Never copy MEMORY.md's index or any note content into this file.
`;

const MEMORY_INDEX_SEED = "# Memory Index\n\n";

/**
 * Resolve the workspace root for a cwd, following exactly the logic in
 * new-project-init.sh: the git toplevel of cwd, accepted only if it carries a
 * `.workspace-root` marker. No marker -> no workspace -> null.
 */
function findWorkspaceRoot(cwd: string): string | null {
  let dir = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      // git toplevel candidate; enforce the marker like the shell script does.
      return fs.existsSync(path.join(dir, ".workspace-root")) ? dir : null;
    }
    // .workspace-root may also sit outside a git repo (the script checks the
    // git toplevel only, but tolerating a plain marker is harmless and matches
    // tm's marker-on-any-root intent). Check the marker before ascending.
    const parent = path.dirname(dir);
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}

/** True if `rel` (cwd relative to workspace root) is or is under a dot-directory. */
function isDotPath(rel: string): boolean {
  return rel.split(path.sep).some((part) => part.length > 0 && part.startsWith("."));
}

/** Walk cwd up to (but not past) the workspace root looking for a CLAUDE.md. */
function hasClaudeMd(cwd: string, root: string): boolean {
  // Walk cwd up to (but NOT including) the workspace root, matching
  // new-project-init.sh's `while [ "$d" != "$W" ]` loop. The root's own
  // CLAUDE.md is the workspace-level pointer, not an inherited project one,
  // so a fresh subfolder must still be bootstrapped.
  let dir = cwd;
  for (;;) {
    if (dir === root) return false;
    if (fs.existsSync(path.join(dir, "CLAUDE.md"))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

/**
 * Bootstrap a CLAUDE.md + memory/ in cwd if it's a fresh workspace subfolder.
 * Returns a short message describing what happened (empty = nothing to do),
 * mirroring the stdout the shell hook would have printed.
 */
function bootstrap(cwd: string): string {
  const root = findWorkspaceRoot(cwd);
  if (!root) return "";

  const rel = path.relative(root, cwd);
  if (rel === "") return ""; // cwd is the workspace root itself
  if (!rel.startsWith("..") && !path.isAbsolute(rel) && isDotPath(rel)) return "";

  if (hasClaudeMd(cwd, root)) return "";

  let actions: string[] = [];

  try {
    fs.mkdirSync(path.join(cwd, "memory"), { recursive: true });
  } catch {
    return ""; // never fail the session
  }

  const memIndex = path.join(cwd, "memory", "MEMORY.md");
  try {
    if (!fs.existsSync(memIndex)) {
      fs.writeFileSync(memIndex, MEMORY_INDEX_SEED, "utf8");
      actions.push("memory/MEMORY.md");
    }
  } catch {
    /* ignore a failed index write — pointer is what matters */
  }

  try {
    fs.writeFileSync(path.join(cwd, "CLAUDE.md"), POINTER_TEXT, "utf8");
    actions.push("CLAUDE.md");
  } catch {
    return ""; // could not write the pointer; bail quietly
  }

  return actions.length
    ? `Project memory initialized in ${cwd}: ${actions.join(", ")}`
    : "";
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    const cwd = ctx?.cwd;
    if (!cwd) return;

    const msg = bootstrap(cwd);
    if (msg && ctx.hasUI) {
      ctx.ui.notify(msg, "info");
    }
  });
}
