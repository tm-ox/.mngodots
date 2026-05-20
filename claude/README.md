# claude

Claude Code config stow package.

## Install

```bash
stow --no-folding -d ~/.mngodots -t ~/.claude claude/.claude
```

This creates symlinks for:
- `settings.json` — global permissions, statusline, plugins
- `.claude/settings.local.json` — project-level permissions for `~/.claude`
- `CLAUDE.md` — global instructions
- `hud/` — statusline wrapper + self-contained bundle
- `skills/` — all skills (aoe, vault, search, design-tools)
- `.omc/hud-config.json` — HUD layout config

## Post-stow

`skills/` and `hud/` will be real directories with per-file symlinks after stow. To restore directory-level symlinks (so new skills written by subagents auto-land in mngodots):

```bash
rm -rf ~/.claude/skills && ln -s ~/.mngodots/claude/.claude/skills ~/.claude/skills
rm -rf ~/.claude/hud && ln -s ~/.mngodots/claude/.claude/hud ~/.claude/hud
```

## Not stowed

**`~/.claude.json`** — contains auth tokens, not version controlled. Reconfigure manually:

Global MCP servers (add via `claude mcp add`):
- `mcpvault` — vault MCP
- `penpot` — Penpot MCP

Project-scoped MCPs (add scoped to `~/.claude`):
- `context7`

## Dependencies

- `aoe` — `yay -S agent-of-empires` (subagent session manager)
- `node` — required for HUD statusline
- `tmux` — required for aoe
