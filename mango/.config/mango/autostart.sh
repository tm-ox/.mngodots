#!/bin/sh

# Required by DankMaterialShell and some Wayland apps
export XDG_CURRENT_DESKTOP="wlroots"

# Disable matugen auto-theming on startup (apply manually when needed)
export DMS_DISABLE_MATUGEN=1

# Start DankMaterialShell — bar, notifications, launchers, etc.
# Requires: dms-shell-git (AUR)
dms run &

# Clipboard history daemon — stores entries, accessed via SUPER+SHIFT+r
# Requires: cliphist, wl-clipboard
wl-paste --watch cliphist store &

# Propagate Wayland env to D-Bus and systemd so portals and apps find the display
dbus-update-activation-environment --systemd WAYLAND_DISPLAY XDG_CURRENT_DESKTOP=wlroots

# Polkit agent — handles privilege escalation dialogs
# Requires: polkit-kde-agent
/usr/lib/polkit-kde-authentication-agent-1 &

# Tells Java apps this is LG3D — prevents blank windows in some apps
wmname LG3D &

# Start wlr XDG desktop portal (screen sharing, file picker for wlroots)
# Requires: xdg-desktop-portal-wlr
systemctl --user start xdg-desktop-portal-wlr.service

# Restart main portal to pick up wlr backend and correct environment
systemctl --user restart xdg-desktop-portal.service &

# Start MEGA sync daemon once network is available (30s timeout)
# Requires: megacmd (AUR)
(/usr/lib/systemd/systemd-networkd-wait-online --any -q --timeout=30 && /usr/bin/mega-sync --daemon) &

# Monitor layout overrides — uncomment if multi-monitor init order needs forcing
# mangowc focusmonitor eDP-1
# mangowc workspace 5
# mangowc focusmonitor HDMI-A-1
# mangowc workspace 1
