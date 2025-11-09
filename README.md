#### Ref

- https://mangowc.vercel.app/
- https://danklinux.com/

```bash
sudo pacman -Syu git stow
```

```bash
git clone https://aur.archlinux.org/yay.git && cd yay && makepkg -si && cd .. && rm -rf yay
```

```bash
yay mangowc-git dms-shell-git
```

```bash
git clone https://github.com/tm-ox/.mngodots.git && cd .mngodots && stow --adopt -vSt ~ * && git restore .
```
