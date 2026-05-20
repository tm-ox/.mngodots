---
name: penpot-component
description: Build token-linked Penpot components via the MCP plugin API — binding patterns, naming rules, pre-flight, and constraints
triggers:
  - penpot component
  - penpot mcp
  - penpot token
  - library color
  - penpot library
argument-hint: "[component-name]"
---

# Penpot Component Authoring via MCP

Workflow for building Penpot library components through `mcp__penpot__execute_code`. The Penpot MCP connects to whichever file is open in the browser — it is a WebSocket bridge to the plugin runtime, not a persistent API.

---

## Core Principle — Maximise Token Coverage

**Always apply as many tokens as possible.** If a required library color or typography does not yet exist, create it before building the component. Never fall back to a hardcoded hex or raw font value when a library binding is achievable.

**Components must use variants.** Never create separate individual components for related states or sizes. Group every logical set (Type × Size, State × Size, etc.) into a single variant component. Build all visual boards first, then combine.

Pre-flight order for every component session:
1. Seed all library colors (`createColor` for every semantic token)
2. Seed all library typographies (`createTypography` for every type-scale combination in use)
3. Build component boards (using `asFill()`, `asStroke()`, `applyToText()` throughout)
4. Register as component + combine as variant group

---

## Token Binding — What Is and Isn't Possible

The plugin API exposes two bindable token types. Everything else must be a raw resolved value that matches the token exactly.

| Property | Bindable? | Mechanism |
|---|---|---|
| Fill color | ✅ | `LibraryColor.asFill()` → sets `fillColorRefId` |
| Stroke color | ✅ | `LibraryColor.asStroke()` + set width/alignment/style |
| Typography (family, size, weight, lineHeight, letterSpacing) | ✅ | `LibraryTypography.applyToText(shape)` |
| Padding / gap | ✗ | Raw number only — `board.flex.verticalPadding = 8` |
| Border radius | ✗ | Raw number only — `board.borderRadius = 8` |
| Width / height | ✗ | Raw number only |
| Shadows | ✗ | Raw shadow object, no ref slot |

**`penpot.library.local.tokens`** is readable in Penpot 2.14+ — exposes sets and token values. No `apply()` method exists; tokens cannot be bound to shapes programmatically.

```js
// Read token values (2.14+)
const sets = Array.from(local.tokens.sets); // [{ name, tokens }]
const globalSet = sets.find(s => s.name === 'global');
const allTokens = Array.from(globalSet.tokens);
// Each token: { id, name, type, value, description }
// e.g. { name: 'radius.base', type: 'dimension', value: '8px' }

// Helper: resolve rem/px to number
function toPx(val) {
  const s = String(val).trim();
  if (s.endsWith('rem')) return Math.round(parseFloat(s) * 16);
  if (s.endsWith('px'))  return parseFloat(s);
  return parseFloat(s);
}

// Build a token map for use when setting raw values
const tokenMap = {};
for (const t of allTokens) tokenMap[t.name] = { ...t, px: toPx(t.value) };
storage.tokenMap = tokenMap;
```

Spacing and radius binding requires the **Tokens Studio** plugin applied from the Penpot UI. Via MCP, read resolved values from `tokenMap` and apply as raw numbers.

**`tokens-penpot.json` must use absolute `px` units throughout.** Penpot cannot resolve `rem` values — spacing, font-size, and sizing tokens defined in rem will fail to apply from the tokens panel. The canonical `tokens.json` keeps rem; `tokens-penpot.json` is the Penpot-specific variant with all rem converted to px at base 16px.

---

## Pre-flight: Seed Library Colors

Run at the start of a component-authoring session. Reads colors from the live library; seeds any that are missing; stores the full map in `storage.colorMap` for reuse across subsequent `execute_code` calls (the `storage` object persists within a session).

```js
// Build or reuse the color map
const local = penpot.library.local;
const colorMap = {};
for (const c of local.colors) {
  colorMap[c.name] = c;
}

// Seed missing tokens from your project's token list
// Replace the array below with your actual token definitions
const TOKENS = [
  { name: 'Brand / Primary',  color: '#000000' },
  { name: 'Semantic / Text',  color: '#000000' },
  // ...
];

for (const t of TOKENS) {
  if (!colorMap[t.name]) {
    const c = local.createColor();
    c.name = t.name;
    c.color = t.color;
    colorMap[t.name] = c;
  }
}

storage.colorMap = colorMap;
return { total: local.colors.length };
```

Token names use `/` as a group separator — `'Brand / Primary'` appears under the "Brand" group in Penpot's color panel.

---

## Color Binding

```js
const cm = storage.colorMap;  // set by pre-flight

// Fill linked to library color
shape.fills = [cm['Semantic / Accent'].asFill()];

// Transparent fill (no token — e.g. ghost/outline backgrounds)
shape.fills = [{ fillType: 'solid', fillColor: '#ffffff', fillOpacity: 0 }];

// Stroke linked to library color
const sk = cm['Semantic / Border'].asStroke();
sk.strokeWidth = 1;
sk.strokeAlignment = 'inner';  // 'inner' | 'center' | 'outer'
sk.strokeStyle = 'solid';
shape.strokes = [sk];
```

`asFill()` returns a `Fill` object with `fillColorRefId` set. When the library color is edited, all linked shapes update automatically.

---

## Typography Tokens

```js
// Create a named typography in the library
function makeTypo(local, { name, fontFamily, fontSize, fontWeight, lineHeight = '1.4' }) {
  const t = local.createTypography();
  t.name = name;           // e.g. 'Scale / Body Regular' — "/" creates groups
  t.fontFamily = fontFamily;
  t.fontSize = String(fontSize);   // px as string
  t.fontWeight = String(fontWeight);
  t.lineHeight = lineHeight;
  return t;
}

// Apply to a text shape — links all type properties
typo.applyToText(textShape);

// Apply to a range within a text shape
typo.applyToTextRange(range);

// Store typographies for reuse across calls
storage.typos = { body: bodyTypo, label: labelTypo };
```

---

## Component Naming Rule

**Board name = simple leaf. Component name = full slash path.**

Penpot uses `/` as a group separator in component paths. If the board already carries the path, Penpot prefixes it again on `createComponent`, producing doubled names.

```js
// ✅ Correct — "Button" group, "Primary" component
board.name = 'Primary';
const comp = penpot.library.local.createComponent([board]);
comp.name = 'Button / Primary';

// ✗ Wrong — produces "Button / Button / Primary"
board.name = 'Button / Primary';
comp.name  = 'Button / Primary';
```

`comp.name` getter returns only the leaf segment (`'Primary'`), not the full path. This is correct Penpot behavior, not a bug.

---

## Board + Component Template

```js
function makeBoard({ leafName, x, y, w, h, fillToken, strokeToken, radius, padH, padV }) {
  const cm = storage.colorMap;
  const b = penpot.createBoard();
  b.name = leafName;        // leaf only
  b.x = x; b.y = y;
  b.resize(w, h);
  b.borderRadius = radius;  // raw px — not bindable

  b.fills = fillToken
    ? [cm[fillToken].asFill()]
    : [{ fillType: 'solid', fillColor: '#ffffff', fillOpacity: 0 }];

  if (strokeToken) {
    const sk = cm[strokeToken].asStroke();
    sk.strokeWidth = 1;
    sk.strokeAlignment = 'inner';
    sk.strokeStyle = 'solid';
    b.strokes = [sk];
  }

  b.addFlexLayout();
  b.flex.dir = 'row';
  b.flex.alignItems = 'center';
  b.flex.justifyContent = 'center';
  b.flex.verticalPadding = padV;    // raw px — not bindable
  b.flex.horizontalPadding = padH;

  return b;
}

function registerComponent(board, compPath) {
  const comp = penpot.library.local.createComponent([board]);
  comp.name = compPath;  // e.g. 'Button / Primary'
  return comp;
}
```

---

## Text in Components

```js
const t = penpot.createText('Label');
t.name = 'label';
t.fills = [cm['Semantic / Text'].asFill()];  // color token-linked
t.growType = 'auto-width';                   // auto | fixed-width | fixed-width-height

// Apply typography token if available (links family, size, weight, lineHeight)
storage.typos.label.applyToText(t);

board.appendChild(t);
```

---

## Flex Layout Reference

```js
board.addFlexLayout();           // call before appending children
board.flex.dir = 'row';          // 'row' | 'column' | 'row-reverse' | 'column-reverse'
board.flex.alignItems = 'center';
board.flex.justifyContent = 'center';  // 'start' | 'center' | 'end' | 'space-between' | 'space-around'
board.flex.verticalPadding = 8;        // or topPadding / bottomPadding individually
board.flex.horizontalPadding = 16;     // or leftPadding / rightPadding individually
board.flex.rowGap = 8;
board.flex.columnGap = 8;

// CRITICAL: for dir='row' or dir='column', children array order is reversed
// relative to visual order. Use board.appendChild() — NOT board.flex.appendChild() (broken).
```

---

## Page Cleanup

When rebuilding components from scratch, remove all top-level boards first:

```js
const page = penpot.currentPage;
const existing = penpotUtils.findShapes(s => s.parent?.id === page.root.id, page.root);
existing.forEach(s => s.remove());
```

---

## Verification Workflow

Board IDs change when boards are deleted and recreated. Always re-fetch after any rebuild.

```js
// Step 1: get fresh IDs after creation
return penpot.currentPage.root.children.map(c => ({ id: c.id, name: c.name }));

// Step 2: export spot-check using fresh IDs
// mcp__penpot__export_shape({ shapeId: '<id>', format: 'png', scale: 3 })
```

---

## Library Inspection Helpers

```js
// Check what's already in the library
const local = penpot.library.local;
return {
  colors: local.colors.map(c => ({ name: c.name, color: c.color })),
  typographies: local.typographies.map(t => ({ name: t.name, size: t.fontSize, weight: t.fontWeight })),
  components: local.components.map(c => ({ name: c.name, id: c.id })),
};

// Page structure overview (depth 2)
return penpotUtils.shapeStructure(penpot.currentPage.root, 2);
```

---

## Variants

Every component type must use variants — never create individual components for related states or sizes.

**`combineAsVariants(ids[])` only processes one ID per call.** Pass a single ID and call it in a loop, or use the `transformInVariant` + `addVariant` approach below. Passing an array of IDs silently ignores all but the first.

### Preferred workflow — transformInVariant + addVariant

Build all boards independently with correct appearances, register as components, then combine using `transformInVariant` on the first and `combineAsVariants` one-at-a-time for the rest.

**CRITICAL: `transformInVariant()` auto-creates one default property.** Rename it — do not add a new one first. Adding before renaming produces a spurious extra property.

```js
// 1. Create all boards with correct visual appearance (colors, sizing, padding)
//    Register each as a component first
const comp0 = penpot.library.local.createComponent([board0]);
const comp1 = penpot.library.local.createComponent([board1]);
// ...

// 2. Transform first component into variant — this creates 1 default property
comp0.transformInVariant();
const varComp0 = penpot.library.local.components.find(c => c.id === comp0.id);
const variants = varComp0.variants;

// 3. Set up properties: RENAME the existing one, then ADD one more
//    transformInVariant already added "Property 1" at index 0
variants.renameProperty(0, 'Type');  // rename existing — don't addProperty first
variants.addProperty();              // adds "Property 2" at index 1
variants.renameProperty(1, 'Size');

// 4. Set values for the first variant
varComp0.setVariantProperty(0, 'Primary');
varComp0.setVariantProperty(1, 'Default');

// 5. Combine remaining components one at a time (array silently drops all but first)
const main0 = varComp0.mainInstance(); // VariantContainer after transform
for (const d of remaining) {
  const comp = penpot.library.local.components.find(c => c.id === d.compId);
  main0.combineAsVariants([comp.mainInstance().id]); // one at a time
}

// 6. Set variant properties on each combined component
const allVC = variants.variantComponents();
for (const vc of allVC) {
  const s = vc.mainInstance();
  // Identify by visual properties — names are reset to container name after combine
  const type = s.fills[0]?.fillOpacity === 0 ? 'Secondary'
             : s.fills[0]?.fillColorRefId === ACCENT_REF ? 'Primary'
             : 'Danger';
  const size = s.flex?.topPadding === 6 ? 'Small' : 'Default';
  vc.setVariantProperty(0, type);
  vc.setVariantProperty(1, size);
}
```

### Key APIs

| Method | Where | Notes |
|---|---|---|
| `shape.combineAsVariants(ids[])` | ShapeBase | IDs = other shape IDs to group |
| `container.isVariantContainer()` | Board | Check if shape is a VariantContainer |
| `container.variants` | Board | Variants object (null if not a container) |
| `variants.properties` | Variants | `string[]` of property names |
| `variants.renameProperty(pos, name)` | Variants | 0-indexed |
| `variants.removeProperty(pos)` | Variants | 0-indexed |
| `variants.addProperty()` | Variants | Appends a new property |
| `variants.variantComponents()` | Variants | Returns `LibraryVariantComponent[]` |
| `vc.setVariantProperty(pos, value)` | LibraryVariantComponent | Sets value for property at pos |
| `vc.variantProps` | LibraryVariantComponent | `{ [property]: value }` current values |
| `shape.isVariantHead()` | ShapeBase | True if shape is root of a variant |

### Variant naming after combine

When `combineAsVariants` runs, Penpot renames all shapes to the container name (derived from the shared path prefix). Original names are lost. Always identify variants programmatically via fills, strokes, padding, or children — never by `shape.name`.

---

## MCP Server Notes

- Connects to whichever Penpot file is **open in the browser** — ensure the correct file is active before running code.
- Config in `~/.claude/mcp.json`: `"penpot": { "type": "http", "url": "http://localhost:4401/mcp" }`
- `storage` object persists within a browser session; cleared on page reload or reconnect.
- `penpotUtils` provides: `getPages()`, `getPageById()`, `findShape()`, `findShapes()`, `shapeStructure()`, `setParentXY()`, `addFlexLayout()`, `analyzeDescendants()`.
