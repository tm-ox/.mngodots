#!/bin/bash

# Voice input toggle — press to start recording, press again to stop, transcribe, and inject.
#
# INSTALL (Arch/AUR)
#   yay -S wtype whisper.cpp
#   curl -L -o ~/.local/share/whisper.cpp/ggml-small.en.bin \
#     "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin"
#
# DOTFILES (stow from ~/.mngodots)
#   stow --adopt -vSt ~/. scripts   # links this script to ~/.config/scripts/
#   stow --adopt -vSt ~/. mango     # bind.conf contains: bind=SUPER,grave,spawn_shell,...
#
# KEYBINDING
#   SUPER+grave — set in ~/.mngodots/mango/.config/mango/bind.conf
#   Reload mangowc config with ALT+r after any bind.conf change.
#
# MODEL
#   Default: ~/.local/share/whisper.cpp/ggml-small.en.bin (~244MB)
#   Override per-run: VOICE_MODEL=/path/to/model.bin voice-input.sh
#   Available models: tiny.en (~75MB), base.en (~142MB), small.en, medium.en (~769MB)
#   Download any model from: https://huggingface.co/ggerganov/whisper.cpp
#
# RECOVERY
#   Script stuck / notification won't clear:
#     rm -f /tmp/voice-input.lock /tmp/voice-input.notify /tmp/voice-input-active.wav
#   No audio captured — check default source:
#     pactl get-default-source
#     pactl set-default-source <source-name>
#   wtype not injecting — verify Wayland display:
#     echo $WAYLAND_DISPLAY  (should be wayland-0)
#   whisper-cli not found:
#     yay -S whisper.cpp

LOCK=/tmp/voice-input.lock
NOTIFY=/tmp/voice-input.notify
AUDIO=/tmp/voice-input-active.wav
MODEL=${VOICE_MODEL:-$HOME/.local/share/whisper.cpp/ggml-small.en.bin}

close_notification() {
    if [ -f "$NOTIFY" ]; then
        gdbus call --session \
            --dest org.freedesktop.Notifications \
            --object-path /org/freedesktop/Notifications \
            --method org.freedesktop.Notifications.CloseNotification \
            "$(cat $NOTIFY)" 2>/dev/null
        rm -f "$NOTIFY"
    fi
}

if [ -f "$LOCK" ]; then
    # Stop recording
    kill -INT "$(cat $LOCK)" 2>/dev/null
    rm -f "$LOCK"
    sleep 0.3

    notify-send --print-id -r "$(cat $NOTIFY 2>/dev/null || echo 0)" \
        "Voice" "Transcribing…" -i audio-input-microphone > "$NOTIFY"

    TEXT=$(whisper-cli -m "$MODEL" -np -nt -f "$AUDIO" 2>/dev/null \
        | tr -d '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    rm -f "$AUDIO"

    if [ -n "$TEXT" ]; then
        printf '%s' "$TEXT" | wl-copy
        sleep 0.3
        wtype -M ctrl -M shift -k v -m shift -m ctrl
        sleep 0.3
        wl-copy --clear
    fi

    close_notification

else
    # Start recording
    rm -f "$AUDIO"
    arecord -q -f S16_LE -r 16000 -c 1 "$AUDIO" &
    echo $! > "$LOCK"
    notify-send --print-id "Voice" "Recording… (press again to stop)" \
        -i audio-input-microphone > "$NOTIFY"
fi
