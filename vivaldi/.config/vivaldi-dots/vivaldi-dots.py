#!/usr/bin/env python3
"""Back up / restore Vivaldi UI settings (allowlist only; repo is PUBLIC).

  vivaldi-dots.py backup    live ~/.config/vivaldi -> this folder
  vivaldi-dots.py restore   this folder -> ~/.config/vivaldi (Vivaldi must be closed)

Never copied: bookmarks, notes, history, logins, cookies, sessions, start page,
account/sync tokens, mail/calendar/feeds. Profiles are listed in PROFILES.
"""
import json, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIVE = Path.home() / ".config/vivaldi"

# directory name -> (display name, keybind)
PROFILES = {
    "Default":   ("tm",     "SUPER+w"),
    "Profile 2": ("ape",    "SUPER+SHIFT+w"),
    "Beyond":    ("beyond", "SUPER+b"),
}

# vivaldi.* keys that are UI/behaviour settings only
VIVALDI_KEYS = [
    "actions", "address_bar", "appearance", "auto_hide", "chained_commands",
    "clear_private_data", "context_dialogs", "downloads", "features", "keyboard",
    "layouts", "menu", "mouse_wheel", "pip_placement", "privacy",
    "quick_commands", "settings", "status_bar", "system", "tabs", "theme",
    "themes", "toolbars", "translate", "windows",
]
TOP_KEYS = ["default_search_provider", "default_search_provider_data", "site_search_settings"]


def pick(prefs):
    out = {k: prefs[k] for k in TOP_KEYS if k in prefs}
    v = prefs.get("vivaldi", {})
    out["vivaldi"] = {k: v[k] for k in VIVALDI_KEYS if k in v}
    # new-tab / homepage URLs can point at private hosts
    out["vivaldi"].get("tabs", {}).get("new_page", {}).pop("custom_url", None)
    return out


def merge(dst, src):
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            merge(dst[k], v)
        else:
            dst[k] = v


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, sort_keys=True) + "\n")


def backup():
    for p in PROFILES:
        prefs = json.loads((LIVE / p / "Preferences").read_text())
        dump(HERE / "profiles" / p / "Preferences.json", pick(prefs))
    apps = HERE / "applications"
    apps.mkdir(exist_ok=True)
    for f in (Path.home() / ".local/share/applications").glob("*.desktop"):
        if "vivaldi" in f.read_text():
            (apps / f.name).write_text(f.read_text())
    man = ["# Vivaldi profiles", "", "| Directory | Name | Keybind |", "|---|---|---|"]
    man += [f"| `{d}` | {n} | `{k}` |" for d, (n, k) in PROFILES.items()]
    (HERE / "MANIFEST.md").write_text("\n".join(man) + "\n")
    print("backup done")


def restore():
    if subprocess.run(["pgrep", "-x", "vivaldi-bin"], capture_output=True).returncode == 0:
        sys.exit("Vivaldi is running; close it first")
    ls_path = LIVE / "Local State"
    ls = json.loads(ls_path.read_text()) if ls_path.exists() else {}
    prof = ls.setdefault("profile", {})
    cache = prof.setdefault("info_cache", {})
    order = prof.setdefault("profiles_order", [])
    for p, (name, _) in PROFILES.items():
        (LIVE / p).mkdir(parents=True, exist_ok=True)
        pf = LIVE / p / "Preferences"
        cur = json.loads(pf.read_text()) if pf.exists() else {}
        merge(cur, json.loads((HERE / "profiles" / p / "Preferences.json").read_text()))
        cur.setdefault("profile", {})["name"] = name
        pf.write_text(json.dumps(cur, separators=(",", ":")))
        cache.setdefault(p, {})["name"] = name
        if p not in order:
            order.append(p)
    prof.setdefault("last_used", "Default")
    LIVE.mkdir(parents=True, exist_ok=True)
    ls_path.write_text(json.dumps(ls, separators=(",", ":")))
    apps = Path.home() / ".local/share/applications"
    apps.mkdir(parents=True, exist_ok=True)
    for f in (HERE / "applications").glob("*.desktop"):
        (apps / f.name).write_text(f.read_text())
    print("restore done. Reinstall extensions manually")


if __name__ == "__main__":
    {"backup": backup, "restore": restore}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit(__doc__))()
