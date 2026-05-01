#!/bin/sh

export XDG_CURRENT_DESKTOP="wlroots"
export DMS_DISABLE_MATUGEN=1
dms run &
wl-paste --watch cliphist store &

# Propagate Wayland env to D-Bus and systemd user session before portal init
dbus-update-activation-environment --systemd WAYLAND_DISPLAY XDG_CURRENT_DESKTOP=wlroots
/usr/lib/polkit-kde-authentication-agent-1 &

wmname LG3D &

# Start wlr backend via systemd (blocks until active and registered on D-Bus)
systemctl --user start xdg-desktop-portal-wlr.service
# Restart main portal in background to pick up wlr backend and correct env
systemctl --user restart xdg-desktop-portal.service &

# # swaybg -i ~/Pictures/background.jpg &
# waybar -c ~/.config/waybar/config -s ~/.config/waybar/style.css &
# swaync &

(/usr/lib/systemd/systemd-networkd-wait-online --any -q --timeout=30 && /usr/bin/mega-sync --daemon) &

# swayidle -w \
#   timeout 600 'swaylock -f && systemctl suspend' \
#   before-sleep 'swaylock -f' &

# # Focus Monitor eDP-1 (This usually happens by default)
# mangowc focusmonitor eDP-1

# # Move to Tag 5 on eDP-1 (Ensures the eDP-1 tags are initialized)
# mangowc workspace 5

# # Focus Monitor HDMI-A-1
# mangowc focusmonitor HDMI-A-1

# # Move to Tag 1 on HDMI-A-1 (Forces tags 1-4 to initialize on the external monitor)
# mangowc workspace 1
