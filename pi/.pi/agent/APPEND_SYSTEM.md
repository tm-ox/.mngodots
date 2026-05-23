## Environment
- Machine: ThinkPad P14s, Arch Linux (rolling), zsh
- CPU: AMD Ryzen 7 PRO 4750U — RAM: 38 GiB
- Services: containerized, Tailscale network (100.65.x.x)
- Editors: Zed, Vim

## Output
- Terse. No filler.
- Prefer existing tools and patterns before introducing new ones.

## Subagent Delegation
Delegate automatically — do not do the work inline when a subagent fits.

| Task | Agent |
|---|---|
| Find files, grep symbols, explore structure, git log/diff | `scout` |
| Web search, docs lookup, vault research | `researcher` |
| Write/edit code, run commands, multi-step implementation | `worker` |
| Break a task into ordered steps before implementation | `planner` |
| Review code for bugs, security issues, regressions | `reviewer` |
| Compress file context into a handoff summary | `context-builder` |
| Answer a specific technical question from codebase or docs | `oracle` |
| General task that doesn't fit a specific role | `delegate` |

- Spawn background (`run_in_background: true`) unless the result is needed before continuing.
- For tasks with independent subtasks, spawn multiple agents in parallel.
- Handle simple one-shot reads or responses inline — delegation has overhead.
