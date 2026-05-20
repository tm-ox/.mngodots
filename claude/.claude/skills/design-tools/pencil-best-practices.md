---
name: pencil-best-practices
description: Gotchas and patterns for reliable Pencil MCP interaction — ID handling, variable types, component variants, and verification.
triggers:
  - pencil component
  - batch_design
  - pen file
  - pencil mcp
  - pencil variant
  - pencil variable
---

# Pencil MCP — Best Practices

Verified patterns from live sessions. Apply these before writing any `batch_design` call.

---

## 1. ID Generation — Never Set, Always Fetch

`I()` ignores any `id` property you pass. The system always generates its own ID.

**Pattern: two-call sequence for components with descendants**

```
// Call 1 — create the component
btn=I(document, {type:"frame", reusable:true, name:"Button", ...})
icon=I(btn, {type:"icon_font", ...})
label=I(btn, {type:"text", ...})
```

Read the returned binding map (`btn → GT3jz`, `icon → r6N3Y`, `label → ws37x`), then use real IDs in Call 2:

```
// Call 2 — create instances that reference descendant IDs
I(row, {type:"ref", ref:"GT3jz", descendants:{"ws37x":{fill:"$color-text"}}})
```

**Never** assume the ID you wanted was honored. Always use the binding output.

---

## 2. Variable Type Constraints

Not all properties accept variable references. Mismatches throw at execution time and roll back the entire call.

| Property     | Schema type       | What works                        |
|--------------|-------------------|-----------------------------------|
| `fontWeight` | `StringOrVariable`| `"600"` literal — **not** `$font-weight-semibold` (number variable) |
| `fontFamily` | `StringOrVariable`| `"Inter"` literal — variable ref may silently fail |
| `fontSize`   | `NumberOrVariable`| `"$font-size-base"` works fine     |
| `fill`       | `ColorOrVariable` | `"$color-accent"` works fine       |
| `cornerRadius`| `NumberOrVariable`| `"$radius-base"` works fine       |
| `padding`    | `NumberOrVariable[]`| `"$space-4"` works per element   |

**Rule:** if the variable type is `number` and the property is `StringOrVariable`, use the literal string value (`"600"`, `"Inter"`).

---

## 3. Transparent Fill

Two equivalent forms:

```json
// Explicit disable (preferred — intent is clear)
{ "type": "color", "enabled": false, "color": "#000000" }

// RGBA hex (also valid)
"#00000000"
```

Use the explicit form when overriding a component's fill to make an instance background-less (Secondary button pattern).

---

## 4. False Positives in `snapshot_layout`

Two known cases where `snapshot_layout` reports clipping that does not reflect the actual visual output:

**`enabled: false` on descendants** — the node is excluded from flex layout correctly; the parent collapses to fit visible children. `snapshot_layout` still reports the disabled node with an out-of-bounds position. Verify by confirming the parent's width/height matches only enabled children.

**`fill_container` text inside `ref` instances** — when a component contains a text node with `textGrowth:"fixed-width"` and `width:"fill_container"`, instances of that component will show all children as "fully clipped" in `snapshot_layout`. The visual rendering is correct. Verify with `get_screenshot` on a specific instance, not `snapshot_layout`.

---

## 5. Component Variant Pattern — 1 Base + Instance Overrides

Never create N separate reusable components for N visual states of the same widget.

```
// Anti-pattern (8 components)
Button / Primary
Button / Secondary
Button / Danger
Button / Primary / Small
...

// Correct (1 component + instances)
Button (reusable, default = Primary)
  ├── icon  (icon_font, enabled:false)
  └── label (text)
```

Instance overrides on the `ref` node drive all variants:

```javascript
// Secondary
I(row, {type:"ref", ref:"BtnBase",
  fill:{type:"color",enabled:false,color:"#000000"},
  stroke:{align:"inside",fill:"$color-border",thickness:1},
  descendants:{"<label-id>":{fill:"$color-text"}}
})

// Small
I(row, {type:"ref", ref:"BtnBase",
  padding:[6,12],
  descendants:{"<label-id>":{fontSize:"$font-size-sm"}}
})

// Icon-only
I(row, {type:"ref", ref:"BtnBase",
  padding:8,
  descendants:{"<icon-id>":{enabled:true},"<label-id>":{enabled:false}}
})
```

Go/templ maps 1:1 to this: one `Button(props ButtonProps)` struct, not eight functions.

---

## 6. Screenshot Verification Strategy

Large container frames (showcase, page) often render as blank white at screenshot scale because content is small relative to frame.

**Always screenshot the smallest meaningful unit:**

```
// Bad — entire showcase, likely blank
get_screenshot(showcaseFrameId)

// Good — individual rows or instances
get_screenshot(row1Id)
get_screenshot(row2Id)
get_screenshot(instanceId)
```

---

## 7. Deleting Organizer Frames

`D("frameId")` deletes the frame **and all children**, including any reusable components nested inside. If the old components live inside a container frame, deleting the frame is sufficient — do not also try to delete the component nodes individually.

---

## 8. Showcase Layout Pattern

Standard canvas layout for a component design file:

```
[0, 0]     — Base component (reusable, magenta)
[300, 0]   — Showcase frame containing ref instances
              ├── Row: Regular variants (horizontal, gap:12)
              ├── Row: Small variants   (horizontal, gap:12)
              └── Row: Icon-only        (horizontal, gap:12)
```

Showcase frame: `fill:"$color-surface"`, `layout:"vertical"`, `gap:16`, `padding:24`, `cornerRadius:"$radius-md"`.

---

## 9. Pencil CLI — Modes and When to Use Each

The `pencil` CLI is installed at `~/.nvm/versions/node/v20.19.3/bin/pencil`. It runs the same engine as the MCP server but headlessly.

**Four modes:**

| Mode | Command | Use for |
|---|---|---|
| AI prompt | `pencil --in a.pen --out b.pen --prompt "..."` | Bulk natural-language changes; rough generation before MCP refinement |
| Batch tasks | `pencil --tasks tasks.json` | Sequential prompt-driven runs across multiple files |
| Interactive shell | `pencil interactive` | Direct MCP tool calls from terminal; debugging without Claude Code |
| Export | `pencil --in a.pen --export out.png --export-type png` | Automated asset dumps; CI preview pipeline |

**Batch tasks format** — prompt-only, sequential, one editor instance per task:
```json
{
  "tasks": [
    { "out": "component.pen", "prompt": "Create a Button component..." },
    { "in": "component.pen", "out": "component-v2.pen", "prompt": "Add small variant" }
  ]
}
```

**Recommended workflow pattern:**
```
tokens.json → pencil --tasks (rough seed, AI-driven)
                        ↓
             MCP batch_design (precision token-binding, component authoring)
                        ↓
             pencil --export (PNG previews, asset pipeline)
```

**Key constraint:** `--tasks` is prompt-driven AI, not deterministic scripting. Don't use it for token-precise component work — use MCP for that. CLI adds value at the edges (seeding, export).

**Auth:** Set `PENCIL_CLI_KEY` env var for CI/CD. Interactive sessions store token at `~/.pencil/session-cli.json`.

---

## Checklist Before Any `batch_design` Call

- [ ] Do I need child IDs for `descendants`? → Two-call sequence (create first, fetch IDs, then instances)
- [ ] Am I using `$font-weight-*` or `$font-family-*`? → Use string literals instead
- [ ] Am I removing a fill? → Use `{type:"color",enabled:false,color:"#000000"}`
- [ ] Am I creating multiple components for one widget? → Collapse to 1 base + instance overrides
- [ ] Under 25 ops per call? → Split by logical section if not
