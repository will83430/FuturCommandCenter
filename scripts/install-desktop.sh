#!/usr/bin/env bash
set -e

APPIMAGE="$HOME/FuturCommandCenter/dist-electron/FuturCommandCenter-1.0.0.AppImage"
ICON="$HOME/FuturCommandCenter/build/icon.png"
DESKTOP_FILE="$HOME/.local/share/applications/futur-command-center.desktop"
DESKTOP_SHORTCUT="$HOME/Bureau/FuturCommandCenter.desktop"

chmod +x "$APPIMAGE"

mkdir -p "$HOME/.local/share/applications"
mkdir -p "$HOME/.local/share/icons"
cp "$ICON" "$HOME/.local/share/icons/futur-command-center.png"

cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=FuturCommandCenter
Comment=Dashboard personnel — Finances, Santé, Domotique, IA
Exec=${APPIMAGE} --no-sandbox
Icon=$HOME/.local/share/icons/futur-command-center.png
Terminal=false
Categories=Utility;Finance;
StartupWMClass=futur-command-center
EOF

# Raccourci sur le bureau
cp "$DESKTOP_FILE" "$DESKTOP_SHORTCUT"
chmod +x "$DESKTOP_SHORTCUT"
gio set "$DESKTOP_SHORTCUT" metadata::trusted true 2>/dev/null || true

echo "✓ Raccourci créé dans le menu applications"
echo "✓ Icône sur le Bureau"
echo "  Tu peux aussi l'épingler dans ta barre des tâches."
