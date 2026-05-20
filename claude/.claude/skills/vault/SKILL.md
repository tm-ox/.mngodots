---
name: vault
description: Instructions for managing the Obsidian Johnny Decimal vault using the integrated MCP tools.
---

# Vault Manager

The Obsidian vault is mounted at the path configured for this machine. Use the integrated MCP tools for all structural and semantic operations. All paths passed to MCP tools are relative to the vault root.

## Bootstrap

Before performing any vault operation, you MUST:

1. Read the file at path `AGENTS.md` using the obsidian MCP tool.
2. Parse and internalize all rules defined there — filing, naming, templates, tagging, hydration, and archiving.
3. Apply those rules strictly for the duration of this session.

Do not perform any read, write, move, or search operation on the vault until step 1 is complete.

## Core Rules

1. **Root Directory:** All paths are relative to the vault root (machine-specific; handled by MCP).
2. **Johnny Decimal:** Respect the 10-99 hierarchy.
3. **Safety Lock:** Never access or list `10_Inbox` unless explicitly commanded by the user.
4. **Tool Selection:** Always prefer MCP obsidian tools over direct file operations.

## Tool Mapping

- **Searching:** `mcp_obsidian_search_notes` (supports content and metadata)
- **Reading:** `mcp_obsidian_read_note`
- **Navigation:** `mcp_obsidian_list_directory`
- **Editing:** `mcp_obsidian_patch_note` for logs, `mcp_obsidian_write_note` for new content
- **Metadata:** `mcp_obsidian_update_frontmatter`

## Usage

/vault <instruction>
