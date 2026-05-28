---
name: vault
description: Instructions for managing the Obsidian Johnny Decimal vault via the Obsidian CLI.
---

# Vault Manager

## Bootstrap

Read `AGENTS.md` at the vault root before performing any operation:

```bash
obsidian read vault="vault" path="AGENTS.md"
```

Parse and internalize all rules defined there — filing, naming, templates, tagging, hydration, archiving. Apply strictly for the session.

Do not perform any read, write, move, or search operation on the vault until bootstrap is complete.

## Core Rules

1. **Vault root:** `/home/tm/Documents/vault`
2. **Johnny Decimal:** Respect the 3-level hierarchy (Area → Category → ID).
3. **Safety Lock:** Never access or list `11_inbox-user` unless explicitly commanded.
4. **Primary interface:** Obsidian CLI (`obsidian` at `/usr/bin/obsidian`, vault name `"vault"`).
5. **Frontmatter edits:** Use `obsidian read` to fetch current state, then `Edit` tool for targeted field changes. Never use `yq -i` on frontmatter+body files.

## Tool Mapping

| Operation | Command |
|-----------|---------|
| Read note | `obsidian read vault="vault" path="<path>"` |
| List files | `obsidian files vault="vault" path="<folder>"` |
| Search | `obsidian search vault="vault" query="<query>"` |
| List tags | `obsidian tags vault="vault"` |
| Properties | `obsidian properties vault="vault" path="<path>"` |
| Write/new | `Write` tool to `/home/tm/Documents/vault/<path>` |
| Patch/append | `Edit` tool on absolute path |
| Frontmatter | `obsidian read` → `Edit` targeted field in YAML block |
| Move | `obsidian move vault="vault" path="<src>" dest="<dest>"` |
| Tasks (markdown) | `obsidian tasks vault="vault" path="<path>"` |

## Usage

/vault <instruction>
