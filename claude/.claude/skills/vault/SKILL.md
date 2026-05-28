---
name: vault
description: Instructions for managing the Obsidian Johnny Decimal vault via the Obsidian CLI.
---

# Vault Manager

## Interface Detection

Before any vault operation, check CLI availability:

```bash
obsidian --version 2>/dev/null
```

- **Exit 0** → CLI available. Use **CLI mode** (preferred).
- **Non-zero / not found** → CLI unavailable (headless server, no Obsidian install). Use **filesystem fallback**.

Do not use the fallback if the CLI is available.

## Bootstrap

Read `AGENTS.md` at the vault root before performing any operation.

- **CLI mode:** `obsidian read vault="vault" path="AGENTS.md"`
- **Fallback:** `Read` tool at `$HOME/Documents/vault/AGENTS.md`

Parse and internalize all rules defined there — filing, naming, templates, tagging, hydration, archiving. Apply strictly for the session.

Do not perform any read, write, move, or search operation on the vault until bootstrap is complete.

## Core Rules

1. **Vault root:** `$HOME/Documents/vault`
2. **Johnny Decimal:** Respect the 3-level hierarchy (Area → Category → ID).
3. **Safety Lock:** Never access or list `11-inbox-user` unless explicitly commanded.
4. **Frontmatter edits:** Always read current state first, then `Edit` tool for targeted field changes. Never use `yq -i` on frontmatter+body files.

## Tool Mapping

| Operation | CLI mode (preferred) | Filesystem fallback |
|-----------|----------------------|---------------------|
| Read note | `obsidian read vault="vault" path="<path>"` | `Read` tool at absolute path |
| List files | `obsidian files vault="vault" path="<folder>"` | `Bash: find $HOME/Documents/vault/<folder> -maxdepth 1` |
| Search | `obsidian search vault="vault" query="<query>"` | `Bash: grep -r "<query>" $HOME/Documents/vault --include="*.md"` |
| List tags | `obsidian tags vault="vault"` | `Bash: grep -rh "^tags:$\|^  - " $HOME/Documents/vault --include="*.md"` |
| Properties | `obsidian properties vault="vault" path="<path>"` | `Read` tool — parse frontmatter manually |
| Write/new | `Write` tool to `$HOME/Documents/vault/<path>` | same |
| Patch/append | `Edit` tool on absolute path | same |
| Frontmatter | `obsidian read` → `Edit` targeted field | `Read` tool → `Edit` targeted field |
| Move | `obsidian move vault="vault" path="<src>" dest="<dest>"` | `Bash: mv` |
| Tasks | `obsidian tasks vault="vault" path="<path>"` | `Bash: grep -n "- \[ \]\|- \[x\]" <path>` |

## Usage

/vault <instruction>
