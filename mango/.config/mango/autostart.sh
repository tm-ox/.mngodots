#!/bin/sh

dms run &

# # swaybg -i ~/Pictures/background.jpg &
# waybar -c ~/.config/waybar/config -s ~/.config/waybar/style.css &
# swaync &

dbus-update-activation-environment --systemd WAYLAND_DISPLAY XDG_CURRENT_DESKTOP &
/usr/lib/polkit-kde-authentication-agent-1 &

sleep 3
/usr/bin/mega-sync --daemon


# Focus Monitor eDP-1 (This usually happens by default)
mangowc focusmonitor eDP-1

# Move to Tag 5 on eDP-1 (Ensures the eDP-1 tags are initialized)
mangowc workspace 5

# Focus Monitor HDMI-A-1
mangowc focusmonitor HDMI-A-1

# Move to Tag 1 on HDMI-A-1 (Forces tags 1-4 to initialize on the external monitor)
mangowc workspace 1
