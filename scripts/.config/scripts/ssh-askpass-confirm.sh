#!/bin/bash
# SSH_ASKPASS helper for ssh-agent confirm-on-use (keychain --confirm) and passphrase prompts.
# ssh-agent calls it with "Allow use of key ...?" for confirmations; ssh-add calls it with a passphrase prompt.
# Dialog colours: private GTK config dir holding the tm herdr palette (scoped to this dialog, other GTK apps untouched).
THEME="$(dirname "$(readlink -f "$0")")/ssh-askpass-theme"
[ -d "$THEME" ] && export XDG_CONFIG_HOME="$THEME"
case "$1" in
  *"Allow use of key"*|*"Allow"*"?"*)
    zenity --question --title="SSH key use" --text="$1\n\nAlt+A = Approve   Alt+N = No   (Enter or Esc = No)" --ok-label="_Approve" --cancel-label="_No" --default-cancel --timeout=30 2>/dev/null
    exit $? ;;
  *)
    exec zenity --password --title="SSH" 2>/dev/null ;;
esac
