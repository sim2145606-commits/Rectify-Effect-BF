#!/system/bin/sh
# VirtuCam Companion - action.sh
# Triggered by KSU/APatch Action button. Re-runs setup tasks on demand.

VIRTUCAM_PKG="com.briefplantrain.virtucam"
IPC_DIR="/dev/virtucam_ipc"

echo "======================================"
echo "  VirtuCam Companion - Manual Refresh"
echo "======================================"

# Re-fix SharedPreferences permissions
PREFS_FILE="/data/data/$VIRTUCAM_PKG/shared_prefs/virtucam_config.xml"
if [ -f "$PREFS_FILE" ]; then
    chmod 0644 "$PREFS_FILE"
    cp "$PREFS_FILE" "$IPC_DIR/config/virtucam_config.xml" 2>/dev/null
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

# Show IPC dir status
echo " "
echo "IPC Directory ($IPC_DIR):"
ls -la "$IPC_DIR" 2>/dev/null || echo "  Not mounted"

echo " "
echo "Config:"
ls -la "$IPC_DIR/config/" 2>/dev/null || echo "  Empty"

echo " "
echo "State:"
cat "$IPC_DIR/state/companion_status" 2>/dev/null | xargs echo "  Status:"
cat "$IPC_DIR/state/module_active" 2>/dev/null | xargs echo "  Module active:"

echo " "
echo "======================================"
echo "Refresh complete. No reboot needed."
