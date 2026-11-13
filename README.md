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

**Helper scripts** (`scripts/.local/bin/`, stowed into `~/.local/bin` by the step 4 stow):
- `tm-mount`: mounts tm-serve's home at `~/tm-serve` over sshfs (toggle; `-u` unmounts). Needs `sshfs` (in `pkglist.txt`) and the `tm-serve` host in `~/.ssh/config`. Run `mkdir ~/tm-serve` once. For PCManFM add the sidebar bookmark: `echo "file://$HOME/tm-serve tm-serve" >> ~/.config/gtk-3.0/bookmarks`.
- `openbot`: starts the newest `~/Applications/OpenBot-*-x86_64.AppImage`; the OpenBot desktop entry (`Exec="$HOME/.local/bin/openbot" %U`) and the SUPER+z scratchpad bind use it, so updates need no path edits.

**Custom fonts** (`~/.local/share/fonts`, not in this repo; some are not redistributable): only the fonts that can't be re-downloaded are backed up, as `~/Documents/wrk/assets/fonts/fonts-keep-YYYYMMDD.tar.gz` (MEGA-synced, private): Dicotype, Monotype Imaging, Tokotype, Unknown Vendor, Satoshi, Poppins (Fontmirror), Avenir Light, Vintage Moon, Scandia, Widescreen. Restore: `tar -xzf ~/Documents/wrk/assets/fonts/fonts-keep-*.tar.gz -C ~/.local/share/fonts && fc-cache -f`. Re-download from Google Fonts: Atkinson Hyperlegible (and Next), Be Vietnam Pro, Figtree, Fredoka, Hanken Grotesk, Inter, Instrument Sans, JetBrains Mono, Manrope, Mona Sans, Outfit, Public Sans, Questrial, Raleway, Urbanist, Zalando Sans SemiExpanded, Roboto; URW Gothic from the URW/gsfonts package. Refresh the tarball after adding a non-free font.

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
