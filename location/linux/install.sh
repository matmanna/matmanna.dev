#!/usr/bin/env bash
# Installs the updater as a systemd user timer. Usage: ./install.sh <UPDATE_TOKEN>
set -euo pipefail
cd "$(dirname "$0")"

config="${XDG_CONFIG_HOME:-$HOME/.config}"
install -Dm755 matmanna-location "$HOME/.local/bin/matmanna-location"
install -Dm644 matmanna-location.service "$config/systemd/user/matmanna-location.service"
install -Dm644 matmanna-location.timer "$config/systemd/user/matmanna-location.timer"
if [[ -n ${1:-} ]]; then
  install -d -m700 "$config/matmanna-location"
  (umask 077; printf '%s' "$1" > "$config/matmanna-location/token")
fi

systemctl --user daemon-reload
systemctl --user enable --now matmanna-location.timer
