---
name: vault
description: Instructions for managing the Obsidian Johnny Decimal vault. Works with or without mcpvault MCP active.
---

# Vault Manager

## MCP Status Check

Before any vault operation, determine tool availability:

1. Run `claude mcp list 2>/dev/null | grep mcpvault` via Bash.
2. If output contains `✓ Connected` → **MCP mode**: use `mcp__mcpvault__*` tools.
3. Otherwise → **Filesystem mode**: use Read/Write/Edit/Bash directly on `/home/tm/Documents/vault`.

## Bootstrap (both modes)

Read `AGENTS.md` at the vault root before performing any operation:
- MCP mode: `mcp__mcpvault__read_note` with path `AGENTS.md`
- Filesystem mode: Read `/home/tm/Documents/vault/AGENTS.md`

Parse and internalize all rules defined there — filing, naming, templates, tagging, hydration, archiving. Apply strictly for the session.

Do not perform any read, write, move, or search operation on the vault until bootstrap is complete.

## Core Rules

1. **Vault root:** `/home/tm/Documents/vault` — all MCP paths are relative to this.
2. **Johnny Decimal:** Respect the 10-99 hierarchy.
3. **Safety Lock:** Never access or list `10_Inbox` unless explicitly commanded.
4. **Tool preference:** MCP mode when available; filesystem mode otherwise.

## Tool Mapping

| Operation | MCP mode | Filesystem mode |
|-----------|----------|-----------------|
| Search | `mcp__mcpvault__search_notes` | `grep -r "query" /home/tm/Documents/vault --include="*.md"` |
| Read | `mcp__mcpvault__read_note` | `Read` tool with absolute path |
| List dir | `mcp__mcpvault__list_directory` | `find /home/tm/Documents/vault/path -maxdepth 1` |
| Write/new | `mcp__mcpvault__write_note` | `Write` tool with absolute path |
| Patch/append | `mcp__mcpvault__patch_note` | `Edit` tool |
| Frontmatter | `mcp__mcpvault__update_frontmatter` | Edit YAML block directly |
| Tags | `mcp__mcpvault__manage_tags` | Edit frontmatter directly |
| Move | `mcp__mcpvault__move_note` | `Bash(mv ...)` |

## Usage

/vault <instruction>
