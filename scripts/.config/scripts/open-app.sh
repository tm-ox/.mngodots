#!/bin/bash
# Ask for a URL, then open it as a Vivaldi app window (no tab strip), tiled like any window.
url=$(zenity --entry --title="Open as app" --text="URL" --entry-text="${1:-localhost:8081}") || exit 0
[ -z "$url" ] && exit 0
case "$url" in
  http://*|https://*|file://*) ;;
  *) url="http://$url" ;;
esac
# Separate user-data-dir: own process, so it never blocks or hijacks normal Vivaldi profile launches.
exec vivaldi --user-data-dir="$HOME/.config/vivaldi-preview" --no-first-run --app="$url"
