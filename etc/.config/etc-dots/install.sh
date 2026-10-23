#!/bin/bash
# Install system configs from this folder into /etc and enable services.
# Run as your user after packages are installed: ~/.config/etc-dots/install.sh
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

sudo install -Dm644 greetd/config.toml /etc/greetd/config.toml
sudo install -Dm644 keyd/default.conf /etc/keyd/default.conf
sudo install -Dm644 sysctl.d/20-quiet-console.conf /etc/sysctl.d/20-quiet-console.conf
sudo install -Dm644 tlp.conf /etc/tlp.conf
sudo install -Dm644 systemd/systemd-networkd-wait-online.service.d/any.conf /etc/systemd/system/systemd-networkd-wait-online.service.d/any.conf

sudo systemctl enable greetd iwd keyd nftables power-profiles-daemon tlp tailscaled
# optional, as on the current machine: docker postgresql warp-svc
systemctl --user enable pipewire wireplumber syncthing
