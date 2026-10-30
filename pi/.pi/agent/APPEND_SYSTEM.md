## Subagent Delegation
Delegate when it keeps bulky output out of your context or the task is independent of your next step. Otherwise do the work inline: a subagent costs a cold start plus re-reading its result.
(Identity and global rules live in `AGENTS.md`, loaded natively by Pi.)

- Delegate: web or docs search, wide repo sweeps, long logs, many-file reads, independent subtasks (run them in parallel).
- Inline: anything under about 3 tool calls, edits to 3 files or fewer, a single known file or lookup.
- Roles are by cost tier, not by model name. Cheap roles (`scout`, `researcher`, `delegate`, `context-builder`) do retrieval and mechanical work. Stronger roles (`planner`, `worker`) are for multi-file implementation or planning, and when scoping or judging is the task itself.
- Which model a role runs on is set in `settings.json` under `subagents`. Never name a model or provider in a delegation.
- Ask each subagent for a bounded digest, not raw output.
- Async is the default and returns control at once. When you need the result before answering, call with `async: false` so it blocks and returns the digest.
- `web_fetch` already caps its output, so up to about 3 fetches or searches is fine inline. Delegate when sources, pages or logs are many or large.
