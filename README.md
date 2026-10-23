## mngodots

Dotfiles for Arch Linux / MangoWM setup on workstation.

- **WM**: [mangowm](https://mangowc.vercel.app/) (official repo package `mangowm`, in `pkglist.txt`)
- **Shell**: [DankMaterialShell (dms)](https://danklinux.com/)

---

### Fresh Install

#### 1. Install yay

```bash
git clone https://aur.archlinux.org/yay.git && cd yay && makepkg -si && cd .. && rm -rf yay
```

#### 2. Install pacman packages

```bash
sudo pacman -S --needed - < pkglist.txt
```

#### 3. Install AUR packages

```bash
yay -S --needed - < pkglist-aur.txt
```

Key AUR packages: `dms-shell-git` (shell), `matugen-bin` (theming), `dsearch-bin` (launcher), `whisper.cpp` (voice input STT).

#### 4. Clone and stow dotfiles

```bash
git clone https://github.com/tm-ox/.mngodots.git
cd .mngodots
stow --adopt -vSt ~/. */
git restore .
```

> `--adopt` moves existing files into the stow package. `git restore .` reverts any overwrites back to dotfile versions.

#### 5. Post-install

**Whisper model** (voice input):
```bash
mkdir -p ~/.local/share/whisper.cpp
curl -L -o ~/.local/share/whisper.cpp/ggml-small.en.bin \
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin"
```

**System configs and services** (`/etc` is not stowed; run after packages are installed and dotfiles stowed):
```bash
~/.config/etc-dots/install.sh
```
Copies `greetd`, `keyd`, `tlp` and the quiet-console sysctl into `/etc` and enables `greetd iwd keyd nftables power-profiles-daemon tlp tailscaled` plus the user services `pipewire wireplumber syncthing`. `docker`, `postgresql` and `warp-svc` are enabled on the current machine but left out of the script. `--remember-session` is set in greetd; Mango is the only installed session. The sysctl keeps kernel warnings off the greeter.

**Default shell**:
```bash
chsh -s /bin/zsh
```

**Vivaldi settings** (themes, shortcuts, toolbars, profile list; no bookmarks, logins or extensions):
```bash
# Vivaldi must be closed; run after stow
~/.config/vivaldi-dots/vivaldi-dots.py restore
```
Profiles are listed in `vivaldi/.config/vivaldi-dots/MANIFEST.md`. Reinstall extensions manually. Before a reinstall, refresh the snapshot with `vivaldi-dots.py backup`.

---

### Keybindings

Full bindings in `mango/.config/mango/bind.conf`. Reload after changes: `ALT+r`.

| Key | Action |
|---|---|
| `SUPER+grave` | Voice input toggle |
| `SUPER+r` | Launcher (dsearch) |
| `SUPER+q` | Terminal (kitty) |
| `SUPER+w` / `SUPER+b` | Browser (Vivaldi) |
| `SUPER+x` | Zed (agents workspace) |
| `SUPER+F1` | Mic mute toggle |

---

### Voice Input

`SUPER+grave` — start recording, press again to stop. Transcribes via whisper.cpp (`small.en` model) and injects text into the focused Wayland window via `wtype`.

Full install, model options, and recovery notes in `scripts/.config/scripts/voice-input.sh`.

---

### Recovery

**Voice input stuck**:
```bash
rm -f /tmp/voice-input.lock /tmp/voice-input.notify /tmp/voice-input-active.wav
```

**Stow conflict**: re-run stow then `git restore .` to restore dotfile versions.

**Wrong audio source**:
```bash
pactl list sources short
pactl set-default-source <source-name>
```

**MangoWC won't start**: `dms run` in autostart must succeed — check `dms` is installed and `~/.config/DankMaterialShell/` exists.
