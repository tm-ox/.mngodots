---
name: vault
description: Instructions for managing the Obsidian Johnny Decimal vault via direct filesystem access.
---

# Vault Manager

## Bootstrap

Read `AGENTS.md` at the vault root before performing any operation:

`Read` tool at `$HOME/Documents/vault/AGENTS.md`

Parse and internalize all rules defined there — filing, naming, templates, tagging, archiving. Apply strictly for the session. Do not perform any vault operation until bootstrap is complete.

## Core Rules

1. **Vault root:** `$HOME/Documents/vault`
2. **Johnny Decimal:** Respect the 3-level hierarchy (Area → Category → ID).
3. **Safety lock:** Never access or list `11-inbox-user` unless explicitly commanded.
4. **Frontmatter writes:** `Edit` tool only — targeted field replacement. Never `yq -i`.
5. **Frontmatter reads:** isolate block via `awk`, pipe to `yq`. Never pass a frontmatter+body file directly to `yq`.
6. **Full file reads:** `Read` tool only when body content is needed. Use `limit`/`offset` for large files.

## Tool Mapping

| Operation | Command/Tool |
|---|---|
| Find files by content or tag | `/usr/bin/rg -l '"<pattern>"' $HOME/Documents/vault/` |
| Scoped search | `/usr/bin/rg '"<pattern>"' $HOME/Documents/vault/<path>/` |
| Find by frontmatter field value | `/usr/bin/rg -l 'field: "<value>"' $HOME/Documents/vault/<path>/` |
| List files in folder | `find $HOME/Documents/vault/<folder> -maxdepth 1 -name "*.md"` |
| Extract frontmatter field | `awk '/^---$/{p++; next} p==1' <file> \| yq '.<field>'` |
| Extract multiple fields | `awk '/^---$/{p++; next} p==1' <file> \| yq '{"status": .status, "title": .title}'` |
| Read full file | `Read` tool |

`rg` is recursive by default — use `/usr/bin/rg -l` only, never `-rl`. Inside subshells, `-rl` parses as `--replace l` and corrupts output paths.

PM task files store status as quoted strings — search patterns must match literally: `/usr/bin/rg -l 'status: "todo"'`. Task status values: `"todo"`, `"in-progress"`, `"blocked"`, `"review"`, `"done"`, `"cancelled"`.
| Update frontmatter field | `Edit` tool — exact string match on target line |
| Update body | `Edit` tool |
| Create file | `Write` tool |
| Move file | `Bash: mv` |

## PM Plugin

The Project Manager plugin reads frontmatter on Obsidian open — direct edits are fully compatible without Obsidian running. When updating any task field, also update `updatedAt` to current ISO timestamp.

## Tool Availability

Attempt operations directly. If `rg` or `yq` returns `command not found`, stop and request installation before retrying:

- `rg` → use `/usr/bin/rg` explicitly; if absent, `sudo pacman -S ripgrep`
- `yq` → `sudo pacman -S go-yq`

## Usage

/vault <instruction>
