#!/bin/bash

vivaldi --args --profile-directory="Beyond" &

pid=$!

sleep 1

class=$(hyprctl get class "$(pgrep -P $pid)")

hyprctl dispatch movetoworkspace 4

wait $pid
