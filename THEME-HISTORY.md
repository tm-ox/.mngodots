# Theme history (colour changes of 2026-10-31)

Original values before the consistency pass, for files that cannot hold comments (JSON). Files that can hold
comments carry them in place (`was` lines in Zed settings, kitty confs, Joplin CSS).

Original: background `#242835`, foreground `#929292`, active pane border = theme `accent`.
Now: background `#1e222e` (tried `#181d27`, too dark), foreground `#cccac2`, Herdr active pane border `#ff9e64`.

| File | Original |
|---|---|
| `herdr-app/.config/herdr-app/themes/tm-dk.json` | v1: bg `#242835`, fg `#929292`, cursor `#c0caf5`, selection `#364a82`, accent `#7aa2f7`, working `#e0af68`, blocked `#f7768e`, done `#9ece6a`; no `chrome`/`popover`/`hover`/`selected`/`muted`/`dim` overrides (derived). Also `themes/tm-dk.previous.txt` |
| `herdr-app/.config/herdr-app/layouts/tm.json` | pane `focus.color`: `"accent"`; `theme.dark`: `"ink"` |
| `dms/.config/DankMaterialShell/tm-dk.json` | `primaryText`, `primaryContainer`, `surface`, `surfaceVariant`, `background`, `surfaceContainer`: `#242835` (text colours untouched) |
| `tuios/.config/tuios/themes/tm.json` | `bg` `#242835`, `fg` `#929292` (also `_was` key) |
| `pi/.pi/agent/themes/tm-dk.json` | `bg` and `cardBg` `#242835`, `fg` `#929292` (also `bgWas`/`fgWas` vars) |
| `zed/.config/zed/settings.json` | `theme_overrides` background, title_bar, status_bar, panel: `#242835ff`; `terminal.background` and `editor.background` were not overridden |

Herdr accent: `#7aa2f7` (v1), `#72cffe` (v2), now orange `#ff9e64` with `accent_foreground`/`solid_foreground` `#1e222e`; `solid` `#ff9e64`. All own mods use theme colours only, so they follow.

Joplin (`joplin/.config/joplin-desktop/userchrome.css`, `userstyle.css`, symlinked, originals in `/* was */` comments): `--tm-dk-sf` `#24283b`, Macchiato `base`/`mantle`/`crust` `#24273a` (chrome) and `#24273a`/`#1e2030`/`#181926` (style), style `text` `#cad3f5`, style `lavender` `#b7bdf8` (now orange). Restart Joplin to load.

Not changed: `themes/.themes/tm-gtk` (generated, hundreds of baked `#242835` / `#929292` assets; regenerate via `assets/sed.sh` if wanted), mango `tab_bar_decorate_fg_color` (`0x929292ff`) and its tab-bar comment.
