#!/bin/sh
# Play a sound for an agent state. Run by tuios [hooks] after-agent-state.
S="$HOME/.mngodots/herdr/.config/herdr/sounds"
case "$TUIOS_AGENT_STATE" in
  done)        f="$S/done.mp3" ;;
  needs_input) f="$S/request.mp3" ;;
  errored)     f="$S/notification.mp3" ;;
  *)           exit 0 ;;
esac
[ -f "$f" ] && pw-play "$f" >/dev/null 2>&1 &
