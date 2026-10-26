# Pi — Clipboard Copy Warning (known, accepted, do not patch)

Pi sometimes shows this on its own "copy to clipboard" action (the `/copy`
command, message-copy key, or selection copy):

```
Clipboard unavailable: install `wl-clipboard` (`wl-copy`) or check Wayland access
```

## What it actually is

A cosmetic, Pi-internal race — **not** a missing dependency and **not** a broken
workflow. `wl-copy` is installed and works standalone. The warning fires when
Pi's `copyToClipboard()` (in `@earendil-works/pi-coding-agent` dist) can't
confirm a successful write:

1. It spawns `wl-copy` with text piped to stdin, a **5s timeout**, and
   `detached: true` (so `wl-copy` can background to hold clipboard ownership).
2. Under wayland (mango/DMS) the forking `wl-copy` can exit-report before its
   background process fully takes ownership, or the 5s window is exceeded
   during ownership contention —— so the `close` handler sees a non-zero /
   ambiguous code and treats it as failure.
3. There is no X11 fallback (`DISPLAY` is unset — pure Wayland) and no OSC 52
   path (not a remote/WSL session), so Pi's only fallback is gone and it throws.

## Why it's left alone

- **The only real fixes patch Pi's `node_modules` dist** — forbidden by
  tm's standing rule (see `feedback_pi-no-dist-patches.md`: never patch
  `@mariozechner/pi-coding-agent/dist/` or any installed package dist).
- `PI_CLIPBOARD_OSC52=1` *adds* an OSC 52 path (for multiplexer/remote clients)
  but does **not** suppress the warning, and would just retry success more often.
- There is **no** settings key or env var to silence the error — the `throw` is
  unconditional.

## How to copy from Pi (what actually works, unaffected by this warning)

The warning only concerns Pi's *own* "copy button". Copying text out of the
terminal is done at the TUIOS layer and works fine:

- `ctrl+b [` → copy/scrollback mode, then `c` to yank
- `ctrl+b F` → hints mode, type the label
- `ctrl+b E` → open scrollback in `$EDITOR`
- paste with `ctrl+b ]` or the host clipboard (`ctrl+shift+v` / `super+v` / middle)

## Revisit only if

- A future Pi release adds a clipboard-suppress setting, or
- tm decides the warning noise is worth a proper upstream fix rather than a
  local patch (file/search the Pi issue tracker, do not patch dist here).
