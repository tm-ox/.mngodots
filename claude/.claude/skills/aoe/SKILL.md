---
name: aoe
description: Dispatch tasks as Agent of Empires sessions — tmux-isolated subagents with optional git worktree, visibility, and structured result retrieval.
---

# Agent of Empires (AoE) Dispatch

AoE runs subagents in persistent tmux sessions. Use it instead of the Agent tool when the task is file-producing, long-running, needs user visibility, or benefits from git worktree isolation.

## When to Use AoE vs Agent Tool

| Condition | Use |
|---|---|
| Writing files to a code repo | AoE with `-w` |
| Task takes >2 min or user wants to observe | AoE |
| Multiple parallel tasks on separate repos | AoE (one session each) |
| Quick in-memory research or synthesis | Agent tool |
| Non-git directory (docs, /tmp, vault) | AoE without `-w` |
| Simple one-shot lookup | Agent tool |

## Standard Dispatch Pattern

### 1. Create session

```bash
# Code repo (use worktree isolation)
aoe add -t {repo}-{task} -l claude -w /path/to/repo

# Non-git dir or ephemeral work (no worktree)
aoe add -t {task} -l claude /path/to/dir
```

The session ID is the title slug. Confirm with `aoe list`.

Do not use `--yolo`.

### 2. Send prompt

```bash
aoe send {id} "{prompt}"
```

Always append this instruction to the subagent prompt:

> Write a final result summary (findings, files changed, errors) to `/tmp/aoe-{id}.md` when done.

### 3. Background wait (non-blocking)

Immediately after sending, launch the wait as a background Bash command (run_in_background: true). This frees the orchestrator to continue other work or dispatch additional sessions in the same turn.

```bash
until aoe status 2>&1 | grep -q "0 running"; do sleep 5; done && cat /tmp/aoe-{id}.md > /tmp/aoe-{id}-ready.md
```

A notification fires when the background command completes. On the next turn, check for the ready sentinel:

```bash
cat /tmp/aoe-{id}-ready.md 2>/dev/null || aoe session capture {id} --lines 500 --strip-ansi
```

The `-ready.md` sentinel distinguishes "still running" (absent) from "done" (present with summary content).

### 4. Cleanup

```bash
aoe remove {id}
rm -f /tmp/aoe-{id}.md /tmp/aoe-{id}-ready.md
```

This also removes the worktree and branch if `-w` was used.

## Parallel Dispatch

Launch multiple sessions and background-wait all in the same turn:

```bash
aoe add -t repo-task-a -l claude -w /repo
aoe add -t repo-task-b -l claude -w /repo
aoe send repo-task-a "... Write summary to /tmp/aoe-repo-task-a.md when done."
aoe send repo-task-b "... Write summary to /tmp/aoe-repo-task-b.md when done."
# then background: until aoe status | grep -q "0 running"; do sleep 5; done
```

Check each `-ready.md` sentinel on the next turn and clean up independently.

## Prompt Template

```
{task description}

When finished, write a summary of all findings, files changed, and any errors encountered to /tmp/aoe-{id}.md.
```

## Useful Commands

```bash
aoe list                          # all sessions
aoe status                        # running count
aoe session show {id} --json      # status, path, worktree
aoe session capture {id} --lines 200 --strip-ansi  # raw pane
aoe worktree cleanup -f           # remove orphaned worktrees
```

## Usage

/aoe {task description} [path]
