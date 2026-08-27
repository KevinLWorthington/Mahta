#!/bin/sh
# lginput-native-hook uninstaller for webOS 24+ (9.x)
# Usage: sh uninstall.sh

set -e

HOOK_SO="/home/root/lginput-hook.so"
INIT_SCRIPT="/var/lib/webosbrew/init.d/lginput-native-hook"
ENV_FILE="/var/systemd/system/env/lginput2.env"
CONFIG_DIR="/home/root/.config/lginputhook"

echo "[lginput-native-hook] Uninstalling..."

# --- Remove LD_PRELOAD env file ---
if [ -f "$ENV_FILE" ]; then
    rm -f "$ENV_FILE"
    echo "[lginput-native-hook] Removed: $ENV_FILE"
else
    echo "[lginput-native-hook] Not found (skipping): $ENV_FILE"
fi

# --- Remove boot init script ---
if [ -f "$INIT_SCRIPT" ]; then
    rm -f "$INIT_SCRIPT"
    echo "[lginput-native-hook] Removed: $INIT_SCRIPT"
else
    echo "[lginput-native-hook] Not found (skipping): $INIT_SCRIPT"
fi

# --- Remove hook library ---
if [ -f "$HOOK_SO" ]; then
    rm -f "$HOOK_SO"
    echo "[lginput-native-hook] Removed: $HOOK_SO"
else
    echo "[lginput-native-hook] Not found (skipping): $HOOK_SO"
fi

# --- Offer to remove config ---
if [ -f "$CONFIG_DIR/keybinds.json" ]; then
    echo ""
    printf "[lginput-native-hook] Remove keybinds config %s? [y/N] " "$CONFIG_DIR/keybinds.json"
    read -r answer
    if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
        rm -rf "$CONFIG_DIR"
        echo "[lginput-native-hook] Removed: $CONFIG_DIR"
    else
        echo "[lginput-native-hook] Config preserved at: $CONFIG_DIR"
    fi
fi

# --- Restore lginput2 ---
echo "[lginput-native-hook] Restarting lginput2..."
systemctl restart lginput2
sleep 2

if pgrep lginput2 > /dev/null; then
    echo ""
    echo "[lginput-native-hook] Uninstall complete. Remote restored to normal."
else
    echo "[lginput-native-hook] WARNING: lginput2 did not start cleanly." >&2
    echo "[lginput-native-hook] Try: systemctl restart lginput2" >&2
    exit 1
fi
