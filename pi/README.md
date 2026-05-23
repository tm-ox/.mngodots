# pi setup

[pi](https://github.com/earendil-works/pi-mono) (`@earendil-works/pi-coding-agent`) coding agent configuration.

## Install

```bash
# Install pi globally via nvm node
npm install -g @earendil-works/pi-coding-agent

# Authenticate providers
pi /login   # xAI and DeepSeek
```

## Stow

This directory manages `~/.pi/agent/` via symlinks. Run once on a new machine:

```bash
ln -sf ~/.mngodots/pi/.pi/agent/APPEND_SYSTEM.md       ~/.pi/agent/APPEND_SYSTEM.md
ln -sf ~/.mngodots/pi/.pi/agent/settings.json           ~/.pi/agent/settings.json
ln -sf ~/.mngodots/pi/.pi/agent/agents                  ~/.pi/agent/agents
ln -sf ~/.mngodots/pi/.pi/agent/extensions              ~/.pi/agent/extensions
ln -sf ~/.mngodots/pi/.pi/agent/themes                  ~/.pi/agent/themes
ln -sf ~/.mngodots/pi/.pi/agent/hermes-memory-config.json ~/.pi/agent/hermes-memory-config.json
```

Then install extension dependencies:

```bash
cd ~/.mngodots/pi/.pi/agent/extensions && npm install
```

> `auth.json` is not stowed — re-authenticate with `pi /login` on each machine.

## Extensions

Located in `extensions/`. Loaded automatically by pi on startup.

| Extension | Purpose |
|---|---|
| `vault.ts` | Read/write/search Obsidian vault at `~/Documents/vault` |
| `searxng.ts` | Web search via local SearXNG at `localhost:8080` |
| `clipboard.ts` | Read/write Wayland clipboard via `wl-paste`/`wl-copy` |
| `permission-gate.ts` | Block dangerous bash commands with confirm prompt |
| `session-name.ts` | Auto-name sessions from first prompt |
| `status.ts` | Session age, elapsed time, turn count in status bar |
| `header.ts` | Pi logo + version in sidebar header |
| `claude-task.ts` | Delegate tasks to Claude Code as a subagent |

## Packages (pi install)

Managed via `settings.json`:

| Package | Purpose |
|---|---|
| `npm:pi-hermes-memory` | Persistent user/project memory across sessions |
| `npm:@tintinweb/pi-subagents` | Spawn isolated subagents with per-agent model and tool config |

## Subagents

Agent configs in `agents/`. Loaded globally, can be overridden per-project in `.pi/agents/`.

| Agent | Model | Tools | Use |
|---|---|---|---|
| `scout` | `xai/grok-4-1-fast` | read-only | Fast local recon, file/symbol search |
| `researcher` | `deepseek/deepseek-v4-flash` | read + search + vault read | Web and vault research |
| `worker` | `xai/grok-4.20-0309-reasoning` | all + all extensions | Full implementation |

Main agent auto-delegates based on task type via rules in `APPEND_SYSTEM.md`.

## Hermes Memory

`hermes-memory-config.json` sets `memoryDir` to point directly at `pi-hermes-memory/` in dotfiles, bypassing symlinks. Hermes uses an atomic write strategy (`rename`) that breaks symlinks — the direct path avoids this.

`USER.md`, `skills/`, and `sessions.db` all land in `pi-hermes-memory/`. The `*.db` files are gitignored.

## Theme

Custom theme `tm-dk` in `themes/tm-dk.json`. Set as default in `settings.json`.
