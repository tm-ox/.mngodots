#!/bin/bash

export PATH="$HOME/.config/scripts:$PATH"
export EDITOR="vim"

export FZF_DEFAULT_COMMAND="rg --files --hidden --follow --glob '!.git'"
export FZF_DEFAULT_OPTS='--no-height --border=sharp --color=fg:-1,fg+:#7dcfff,bg:-1,bg+:-1,hl:#ff9e64,hl+:#ff9e64,info:-1,marker:#87ff00,pointer:#7dcfff,prompt:#7dcfff,spinner:#af5fff,pointer:#7dcfff,header:#9ece6a,gutter:-1,border:#c0caf5,label:#aeaeae,query:#d9d9d9 --margin="1" --layout="reverse" --info="right"'

kitty -e bash -c fuz.sh
