eval "$(starship init zsh)"

# SSH agent
eval $(keychain --eval --quiet ~/.ssh/id_ed25519)

# Plugins
source ~/repos/zsh-autocomplete/zsh-autocomplete.plugin.zsh
source ~/.zsh/plugins/zsh-autosuggestions.zsh
source ~/.zsh/plugins/zsh-history-substring-search.zsh
source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
source ~/.zsh/plugins/you-should-use.plugin.zsh


# History
SAVEHIST=1000
HISTFILE=~/.zsh/history
HISTTIMEFORMAT="[%F %T] "
setopt HIST_EXPIRE_DUPS_FIRST
setopt HIST_FIND_NO_DUPS
setopt HIST_IGNORE_DUPS
setopt HIST_SAVE_NO_DUPS
setopt share_history

# Binds
bindkey -s '^f' 'fuz.sh\n'
bindkey -s '^g' 'rrg.sh\n'
bindkey -v

# Shortcuts
alias ll='ls -la'
alias zrc='$EDITOR $HOME/.zshrc'
alias vrc='$EDITOR $HOME/.vimrc'
alias yrc='$EDITOR $HOME/.mngodots/yazi/.config/yazi/yazi.toml'
alias lfrc='$EDITOR $HOME/.config/lf/lfrc'
alias alc='$EDITOR $HOME/.alacritty.toml'
alias sts='$EDITOR $HOME/.config/starship.toml'
alias cnk='$EDITOR $HOME/.conkyrc'
alias mik='$EDITOR $HOME/.config/micro/bindings.json'

alias .d='cd $HOME/.mngodots'
alias .dB='cd $HOME/projects/dB'
alias .k='cd $HOME/Documents/wrk'
alias .p='cd $HOME/projects'
alias .w='cd $HOME/Documents/web'
alias .r='cd $HOME/repos'
alias .c='codium .'
alias .h='helix'
alias .rd='ripdrag -W 800 -H 600 -s 48 -r -a $(fzf -m +s)'
alias .v='vim'
alias .z='zeditor .'
alias .lb='cd $HOME/repos/livebook && MIX_ENV=prod mix phx.server'

alias g.='git add .'
alias gc='git commit -m'
alias gp='git push'

alias .g='gemini --prompt'

alias pacS='sudo pacman -S'
alias pacSyu='sudo pacman -Syu'
alias pacQ='pacman -Q'
alias yayS='yay -S'
alias pacSs='pacman -Ss'
alias yaySs='yay -Ss'

alias E='sudo shutdown -r now'

# fzf
command -v fzf > /dev/null && [ -f /usr/share/fzf/key-bindings.zsh ] && . /usr/share/fzf/key-bindings.zsh || true

export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow'
export FZF_DEFAULT_OPTS='--no-height --border=sharp --color=fg:-1,fg+:#7dcfff,bg:-1,bg+:-1,hl:#ff9e64,hl+:#ff9e64,info:-1,marker:#87ff00,pointer:#7dcfff,prompt:#7dcfff,spinner:#af5fff,pointer:#7dcfff,header:#9ece6a,gutter:-1,border:#c0caf5,label:#aeaeae,query:#d9d9d9 --margin="1" --layout="reverse" --info="right"'

export NVM_DIR=~/.nvm
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/.config/scripts:$PATH"
export PATH="$HOME/go/bin:$PATH"
export NOTES_DIR=$HOME/projects
export DB_DIR=$HOME/projects/dB
export EDITOR="vim"
export SYSTEMD_EDITOR=vim
export EDITOR='/usr/bin/vim'
export VISUAL="$EDITOR"
export TERMINAL="kitty"
export BAT_THEME="Dracula"
export TERM=xterm-kitty
export TERM_PROGRAM=kitty

export ELIXIR_ERL_OPTIONS="-epmd_module Elixir.Livebook.EPMD"

# Custom function to compile Markdown to PDF using Pandoc and Typst
pandoc-typst() {
  if [[ -z "$1" ]]; then
    echo "Usage: pandoc-typst <input_markdown_file.md>"
    return 1
  fi

  INPUT_MD="$1"
  BASE_NAME="${INPUT_MD%.md}"
  OUTPUT_PDF="${BASE_NAME}.pdf"
  TYPST_TEMPLATE="typst-temp.typ"

  if [[ ! -f "$TYPST_TEMPLATE" ]]; then
    echo "Error: Typst template '$TYPST_TEMPLATE' not found in the current directory."
    return 1
  fi

  pandoc "$INPUT_MD" \
         --to typst \
         --template "$TYPST_TEMPLATE" \
         --pdf-engine=typst \
         -o "$OUTPUT_PDF"

  if [[ $? -eq 0 ]]; then
    echo "Successfully created '$OUTPUT_PDF'"
  else
    echo "Pandoc conversion failed for '$INPUT_MD'!"
    return 1
  fi
}
