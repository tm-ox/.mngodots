#!/bin/bash

vivaldi --args --profile-directory=Default &

pid=$!

sleep 1

class=$(hyprctl get class "$(pgrep -P $pid)")

hyprctl dispatch movetoworkspace 1

wait $pid
