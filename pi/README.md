# pi setup

[pi](https://github.com/earendil-works/pi-mono) (`@earendil-works/pi-coding-agent`) coding agent configuration.

## Install

```bash
# Install pi globally via nvm node
npm install -g @earendil-works/pi-coding-agent

# Authenticate providers
# then inside pi: /login (xAI and DeepSeek use API keys; Anthropic OAuth only if policy allows)
```

## Stow

This directory manages `~/.pi/agent/` via symlinks. Run once on a new machine:

```bash
ln -sf ~/.mngodots/pi/.pi/agent/AGENTS.md              ~/.pi/agent/AGENTS.md
ln -sf ~/.mngodots/pi/.pi/agent/APPEND_SYSTEM.md       ~/.pi/agent/APPEND_SYSTEM.md
ln -sf ~/.mngodots/pi/.pi/agent/settings.json           ~/.pi/agent/settings.json
ln -sf ~/.mngodots/pi/.pi/agent/agents                  ~/.pi/agent/agents
ln -sf ~/.mngodots/pi/.pi/agent/extensions              ~/.pi/agent/extensions
ln -sf ~/.mngodots/pi/.pi/agent/themes                  ~/.pi/agent/themes
ln -sf ~/.mngodots/pi/.pi/agent/web-search.json         ~/.pi/agent/web-search.json
```

Then install extension dependencies:

```bash
cd ~/.mngodots/pi/.pi/agent/extensions && npm install
```

> `auth.json` is not stowed — re-authenticate with `/login` inside pi on each machine.

## Extensions

Located in `extensions/`. Loaded automatically by pi on startup.

| Extension | Purpose |
|---|---|
| `clipboard.ts` | Read/write Wayland clipboard via `wl-paste`/`wl-copy` |
| `permission-gate.ts` | Confirm prompt for dangerous bash commands, including `git push` and `gh pr create` |
| `session-name.ts` | Auto-name sessions from first prompt |
| `status.ts` | Session age, elapsed time, turn count in status bar |
| `header.ts` | Pi logo + version in sidebar header |
| `web-fetch.ts` | `web_fetch` tool: one http(s) page via DeepSeek's Fetch API, cached in `~/.cache/pi-web-fetch` (1 h); returns a short head + outline + file path, not the whole page. Same key; $0.75 per 1,000 after 1 Nov 2026 |
| `claude-memory.ts` | Bootstrap `CLAUDE.md` + `memory/` in fresh workspace dirs (ports Claude Code's `new-project-init.sh`) |
| `herdr-agent-state.ts` | Report Pi state to herdr (herdr-managed; no-ops without `HERDR_ENV`) |
| `tuios-agent-state.ts` | Report Pi state to tuios (tuios-managed; no-ops without `TUIOS_ENV`) |

## Packages (pi install)

Managed via `settings.json`:

| Package | Purpose |
|---|---|
| `npm:pi-subagents` | Spawn isolated subagents with per-agent model and tool config |
| `npm:pi-web-search` | `web_search` tool via the DeepSeek provider's server-side search (`url_context` is Gemini/Ollama only, so absent on DeepSeek) (same key; model set in `web-search.json`) |

## Subagents

Agent configs in `agents/`. Loaded globally, can be overridden per-project in `.pi/agents/`.

| Agent | Model | Tools | Use |
|---|---|---|---|
| `scout` | `deepseek-flash` | read-only | Fast local recon, file/symbol search |
| `researcher` | `deepseek-flash` | read + `web_search` + `web_fetch` + vault skill | Web and vault research |
| `oracle` | `deepseek-flash` | read + bash + vault skill | Specific questions from code or vault |
| `reviewer` | `deepseek-flash` | read-only + bash | Code review |
| `context-builder` | `deepseek-flash` | read + write | Handoff summaries |
| `planner` | `deepseek-v4-pro` | read-only + bash | Implementation plans (thinking high) |
| `delegate` | `deepseek-flash` | all + web search/fetch | General delegated tasks |
| `worker` | `deepseek-v4-pro` | all + web search/fetch + clipboard | Full implementation |

Agent files use the `pi-subagents` frontmatter dialect (`tools` is a strict allowlist; `extensions:` empty = no ambient extensions; omitted = background children load them; `async`, `timeoutMs`). Extension tools (`web_search`, `clipboard_*`) must be in `tools` and the agent must be background (`async: true`). Model IDs follow the catalog (`pi --list-models deepseek`); they have been renamed before.

Main agent auto-delegates based on task type via rules in `APPEND_SYSTEM.md`.

## Memory

No Hermes memory package is installed. Per-project memory follows the Claude Code convention shared with `quad`: a `CLAUDE.md` pointer plus a repo-local `memory/` folder in each workspace directory. Pi's identity and global rules live in `AGENTS.md` (loaded natively from `~/.pi/agent/`, also symlinked as `~/.claude-config/CLAUDE.md` so Claude shares the same source); `APPEND_SYSTEM.md` holds only the subagent delegation table and is appended by Pi. Per-project context comes from `CLAUDE.md`/`AGENTS.md` (ancestor-inherited). `claude-memory.ts` bootstraps `CLAUDE.md` + `memory/` in a fresh workspace folder with no pointer of its own.

## Theme

Custom theme `tm-dk` in `themes/tm-dk.json`. Set as default in `settings.json`.
