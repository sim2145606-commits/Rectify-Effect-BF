#!/system/bin/sh
# VirtuCam Companion - action.sh
# Triggered by KSU/APatch Action button. Re-runs setup tasks on demand.

VIRTUCAM_PKG="com.briefplantrain.virtucam"
IPC_DIR="/dev/virtucam_ipc"
CFG_JSON="$IPC_DIR/config/virtucam_config.json"
CFG_XML="$IPC_DIR/config/virtucam_config.xml"
MARKER_FILE="$IPC_DIR/state/module_active"
STATUS_FILE="$IPC_DIR/state/companion_status"
COMPLETE_FILE="$IPC_DIR/state/service_complete_time"

echo "======================================"
echo "  VirtuCam Companion - Manual Refresh"
echo "======================================"

# Re-fix SharedPreferences permissions
PREFS_FILE="/data/data/$VIRTUCAM_PKG/shared_prefs/virtucam_config.xml"
if [ -f "$PREFS_FILE" ]; then
    chmod 0644 "$PREFS_FILE"
    cp "$PREFS_FILE" "$CFG_XML" 2>/dev/null
    echo "[OK] Config permissions fixed and synced"
else
    echo "[WARN] virtucam_config.xml not found (app not configured yet)"
fi

# Normalize SELinux label on IPC dir/files
if command -v chcon >/dev/null 2>&1; then
    if chcon -R u:object_r:tmpfs:s0 "$IPC_DIR" 2>/dev/null; then
        echo "[OK] IPC SELinux context normalized (tmpfs)"
    else
        echo "[WARN] Failed to normalize IPC SELinux context"
    fi
fi

# Re-grant SYSTEM_ALERT_WINDOW
cmd appops set "$VIRTUCAM_PKG" SYSTEM_ALERT_WINDOW allow 2>/dev/null
echo "[OK] SYSTEM_ALERT_WINDOW re-granted"

echo " "
echo "IPC Directory ($IPC_DIR):"
ls -la "$IPC_DIR" 2>/dev/null || echo "  Not mounted"

echo " "
echo "Config:"
ls -la "$IPC_DIR/config/" 2>/dev/null || echo "  Empty"

echo " "
echo "Bridge Config Files:"
if [ -r "$CFG_JSON" ]; then
    echo "  JSON: readable"
else
    echo "  JSON: missing or unreadable"
fi
if [ -r "$CFG_XML" ]; then
    echo "  XML: readable"
else
    echo "  XML: missing or unreadable"
fi

STAGED_PATH=""
if [ -r "$CFG_JSON" ]; then
    STAGED_PATH="$(tr -d '\n' < "$CFG_JSON" 2>/dev/null | sed -n 's/.*"mediaSourcePath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
fi

if [ -n "$STAGED_PATH" ]; then
    echo "  Staged path in config: $STAGED_PATH"
    if [ -r "$STAGED_PATH" ]; then
        echo "  Staged media readable: yes"
    else
        echo "  Staged media readable: no"
    fi
else
    echo "  Staged path in config: (none)"
fi

echo " "
echo "Media staging:"
if [ -d "$IPC_DIR/media" ]; then
    MEDIA_COUNT="$(ls -1 "$IPC_DIR/media" 2>/dev/null | wc -l | tr -d ' ')"
    [ -z "$MEDIA_COUNT" ] && MEDIA_COUNT="0"
    echo "  File count: $MEDIA_COUNT"
    ls -lat "$IPC_DIR/media" 2>/dev/null | head -n 5
else
    echo "  Media dir missing"
fi

echo " "
echo "State:"
cat "$STATUS_FILE" 2>/dev/null | xargs echo "  Status:"
cat "$MARKER_FILE" 2>/dev/null | xargs echo "  Module active:"
cat "$COMPLETE_FILE" 2>/dev/null | xargs echo "  Service complete epoch:"
if [ -e "$MARKER_FILE" ]; then
    ls -l "$MARKER_FILE" 2>/dev/null | xargs echo "  Marker file:"
else
    echo "  Marker file: missing"
fi

echo " "
echo "======================================"
echo "Refresh complete. No reboot needed."
