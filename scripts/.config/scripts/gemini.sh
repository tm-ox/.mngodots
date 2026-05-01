#!/bin/bash

GEMINI_DIR="$HOME/gemini"
NVM_PATH="$HOME/.nvm"
UNIQUE_CLASS="gemini" # <-- The unique identifier

mkdir -p "$GEMINI_DIR"

# Use the unique class when launching kitty
kitty --class "$UNIQUE_CLASS" bash -c "
    source $NVM_PATH/nvm.sh

    cd $GEMINI_DIR && gemini

    exec $SHELL
"
