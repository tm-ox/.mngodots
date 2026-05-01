#!/bin/bash

export PATH="$HOME/.config/scripts:$PATH"
export NOTES_DIR=$HOME/projects
export EDITOR="vim"

kitty -e bash -c tdo &

sleep 0.5

pid=$!

class=$(hyprctl get class "$(pgrep -P $pid)")

# hyprctl dispatch movetoworkspace 10

wait $pid
