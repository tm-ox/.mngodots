#!/bin/bash

vivaldi --args --profile-directory="Profile 1" &

pid=$!

sleep 1

class=$(hyprctl get class "$(pgrep -P $pid)")

hyprctl dispatch movetoworkspace 5

wait $pid
