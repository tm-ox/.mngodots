## Environment
- Machine: workstation, Arch Linux (rolling), zsh
- CPU: CPU_MODEL — RAM: RAM_SIZE
- Services: containerized, Tailscale network (TAILSCALE_SUBNET)
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

- Spawn background (`run_in_background: true`) unless the result is needed before continuing.
- For tasks with independent subtasks, spawn multiple agents in parallel.
- Handle simple one-shot reads or responses inline — delegation has overhead.
