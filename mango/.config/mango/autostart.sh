#!/bin/sh

export XDG_CURRENT_DESKTOP="wlroots"
export DMS_DISABLE_MATUGEN=1
dms run &
wl-paste --watch cliphist store &

# dbus-update-activation-environment --systemd WAYLAND_DISPLAY XDG_CURRENT_DESKTOP &
dbus-update-activation-environment --systemd WAYLAND_DISPLAY XDG_CURRENT_DESKTOP=wlroots &
/usr/lib/polkit-kde-authentication-agent-1 &

wmname LG3D &
xdg-desktop-portal &
xdg-desktop-portal-wlr &
xdg-desktop-portal-gtk &

# # swaybg -i ~/Pictures/background.jpg &
# waybar -c ~/.config/waybar/config -s ~/.config/waybar/style.css &
# swaync &

sleep 3
/usr/bin/mega-sync --daemon

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
