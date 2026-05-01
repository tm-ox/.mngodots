#!/bin/bash
# EXCLUDE_DIRS=(
#     -not -path '.git/*'
#     -not -path '*/.git/*'
#     -not -path '*/.cache/*'
#     -not -path '*/db_data/*'
#     -not -path '*/.docker/*'
#     -not -path '*/.hex/*'
#     -not -path '*/.BitwigStudio/*'
#     -not -path '*/*BitwigStudio/*'
#     -not -path '*/.Upwork/*'
#     -not -path '*/.mozilla/*'
#     -not -path '*/.var/*'
#     -not -path '*/yay/*'
#     -not -path '*/.rustup/*'
#     -not -path '*/.cargo/*'
#     -not -path '*/.nvm/*'
#     -not -path '*/pkg/*'
#     -not -path '*/_build/*'
#     -not -path '*/.elixir/*'
#     -not -path '*/lib/*'
#     -not -path '*/deps/*'
#     -not -path '*/node_modules/*'
#     -not -path '*/wordpress_data/*'
#     -not -path '*/.next/*'
#     -not -path '*/.nuxt/*'
# )
# find -type d \
find \
    -not -path '.git/*' \
    -not -path '*/.git/*' \
    -not -path '*/.cache/*' \
    -not -path '*/db_data/*' \
    -not -path '*/.docker/*' \
    -not -path '*/.hex/*' \
    -not -path '*/.BitwigStudio/*' \
    -not -path '*/*BitwigStudio/*' \
    -not -path '*/.Upwork/*' \
    -not -path '*/.mozilla/*' \
    -not -path '*/.var/*' \
    -not -path '*/yay/*' \
    -not -path '*/.rustup/*' \
    -not -path '*/.cargo/*' \
    -not -path '*/.nvm/*' \
    -not -path '*/pkg/*' \
    -not -path '*/_build/*' \
    -not -path '*/.elixir/*' \
    -not -path '*/lib/*' \
    -not -path '*/deps/*' \
    -not -path '*/node_modules/*' \
    -not -path '*/wordpress_data/*' \
    -not -path '*/.next/*' \
    -not -path '*/.nuxt/*' \
    2>/dev/null \
    | fzf --multi \
--preview='tree -C {}' --preview-window='45%,border-sharp' \
--prompt='Dirs > ' \
--bind='enter:execute($EDITOR {+})' \
--bind='del:execute(rm -ri {+})' \
--bind='ctrl-a:select-all' \
--bind='ctrl-x:deselect-all' \
--bind='ctrl-d:change-prompt(Dirs > )' \
--bind='ctrl-d:+reload-sync(eval "find -type d $EXCLUDE_DIRS 2>/dev/null")' \
--bind='ctrl-d:+change-preview(tree -C {})' \
--bind='ctrl-d:+refresh-preview' \
--bind='ctrl-f:change-prompt(Files > )' \
--bind='ctrl-f:+reload-sync(eval "find -type f $EXCLUDE_DIRS 2>/dev/null")' \
--bind='ctrl-f:+change-preview(bat --style=plain --color=always --line-range=:500 {} || cat {})' \
--bind='ctrl-f:+refresh-preview' \
--header '
CTRL-D directories | CTRL-F files
CTRL-A select all | CTRL-x deselect
ENTER edit | DEL delete | CTRL-P preview

'
