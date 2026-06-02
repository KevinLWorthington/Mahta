#!/bin/bash
# build.sh — builds install.sh and uninstall.sh for lginput-native-hook
# Run from the project directory in WSL
# Requires: arm-linux-gnueabi-gcc, base64

set -e

echo "[*] Compiling lginput-hook.so..."
arm-linux-gnueabi-gcc -shared -fPIC -O2 \
    -o lginput-hook.so lginput-hook.c \
    -nostartfiles -march=armv7-a \
    -Wl,--dynamic-linker=/lib/ld-linux.so.3

echo "[*] Verifying GLIBC dependencies..."
GLIBC=$(objdump -p lginput-hook.so | grep GLIBC | grep -v "2\.4" || true)
if [ -n "$GLIBC" ]; then
    echo "[!] WARNING: Unexpected GLIBC versions found:"
    echo "$GLIBC"
    exit 1
fi
echo "[+] GLIBC check passed (only 2.4)"

echo "[*] Building install.sh..."
cat > install.sh << 'INSTALLEOF'
#!/bin/sh
# lginput-native-hook installer for webOS 24+ (9.x)
# Usage: sh install.sh
#
# What this does:
#   - Installs lginput-hook.so to /home/root/
#   - Installs a boot startup script to /var/lib/webosbrew/init.d/
#   - Creates a default keybinds config if none exists
#   - Activates the hook immediately (no reboot needed)
#
# Requires: root access, Homebrew Channel installed

set -e

HOOK_SO="/home/root/lginput-hook.so"
INIT_SCRIPT="/var/lib/webosbrew/init.d/lginput-native-hook"
CONFIG_DIR="/home/root/.config/lginputhook"
CONFIG_FILE="$CONFIG_DIR/keybinds.json"
ENV_DIR="/var/systemd/system/env"
ENV_FILE="$ENV_DIR/lginput2.env"

echo "[lginput-native-hook] Installing..."

# --- Extract embedded .so ---
echo "[lginput-native-hook] Extracting hook library..."
sed '1,/^PAYLOAD_START$/d' "$0" | base64 -d > "$HOOK_SO"
chmod 755 "$HOOK_SO"
echo "[lginput-native-hook] Installed: $HOOK_SO"

# --- Install boot init script ---
echo "[lginput-native-hook] Installing startup script..."
cat > "$INIT_SCRIPT" << 'INITEOF'
#!/bin/sh
# lginput-native-hook boot script
# Managed by lginput-native-hook installer

HOOK_SO="/home/root/lginput-hook.so"
ENV_DIR="/var/systemd/system/env"
ENV_FILE="$ENV_DIR/lginput2.env"

if [ ! -f "$HOOK_SO" ]; then
    echo "[lginput-native-hook] ERROR: $HOOK_SO not found, skipping" >&2
    exit 1
fi

mkdir -p "$ENV_DIR"
echo "LD_PRELOAD=$HOOK_SO" > "$ENV_FILE"
systemctl restart lginput2
sleep 2

if pgrep lginput2 > /dev/null; then
    echo "[lginput-native-hook] OK: lginput2 running with hook loaded"
else
    echo "[lginput-native-hook] ERROR: lginput2 failed to start, reverting" >&2
    rm -f "$ENV_FILE"
    systemctl restart lginput2
fi
INITEOF
chmod +x "$INIT_SCRIPT"
echo "[lginput-native-hook] Installed: $INIT_SCRIPT"

# --- Create default config if none exists ---
mkdir -p "$CONFIG_DIR"
if [ ! -f "$CONFIG_FILE" ]; then
    cat > "$CONFIG_FILE" << 'CONFIGEOF'
{
    "reload": "1"
}
CONFIGEOF
    echo "[lginput-native-hook] Created default config: $CONFIG_FILE"
else
    echo "[lginput-native-hook] Existing config preserved: $CONFIG_FILE"
fi

# --- Activate immediately ---
echo "[lginput-native-hook] Activating hook..."
mkdir -p "$ENV_DIR"
echo "LD_PRELOAD=$HOOK_SO" > "$ENV_FILE"
systemctl restart lginput2
sleep 2

if pgrep lginput2 > /dev/null; then
    echo ""
    echo "[lginput-native-hook] Installation complete!"
    echo ""
    echo "  Configure buttons by editing:"
    echo "  $CONFIG_FILE"
    echo ""
    echo "  View live log with:"
    echo "  tail -f /tmp/lginput-hook-native.log"
    echo ""
    echo "  To uninstall, run: sh uninstall.sh"
else
    echo "[lginput-native-hook] ERROR: lginput2 failed to start after hook, reverting..." >&2
    rm -f "$ENV_FILE"
    systemctl restart lginput2
    exit 1
fi

exit 0
PAYLOAD_START
INSTALLEOF

# Append the .so as base64
base64 lginput-hook.so >> install.sh
chmod +x install.sh
echo "[+] Built: install.sh ($(wc -c < install.sh) bytes)"

echo "[*] Building uninstall.sh..."
cat > uninstall.sh << 'UNINSTALLEOF'
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
UNINSTALLEOF
chmod +x uninstall.sh
echo "[+] Built: uninstall.sh"

echo ""
echo "=========================================="
echo " Build complete!"
echo "=========================================="
echo ""
echo " Files:"
echo "   install.sh    — copy to TV and run: sh install.sh"
echo "   uninstall.sh  — copy to TV and run: sh uninstall.sh"
echo ""
echo " Copy to TV:"
echo "   scp install.sh uninstall.sh root@<TV_IP>:/tmp/"
echo ""
echo " Install:"
echo "   ssh root@<TV_IP> 'sh /tmp/install.sh'"
echo ""
echo " Uninstall:"
echo "   ssh root@<TV_IP> 'sh /tmp/uninstall.sh'"
echo ""
