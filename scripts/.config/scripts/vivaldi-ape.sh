#!/bin/bash

vivaldi --args --profile-directory="Profile 2" &

pid=$!

sleep 1

class=$(hyprctl get class "$(pgrep -P $pid)")

hyprctl dispatch movetoworkspace 6

wait $pid
