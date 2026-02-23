#!/system/bin/sh
# VirtuCam Companion - post-fs-data.sh
# Runs before Zygote starts, as root.

VIRTUCAM_PKG="com.briefplantrain.virtucam"
IPC_DIR="/dev/virtucam_ipc"
MODULE_DIR="/data/adb/modules/virtucam_companion"
LOG_FILE="$MODULE_DIR/logs/post-fs-data.log"

# Rotate log if too large (>256KB)
if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)" -gt 262144 ]; then
    mv "$LOG_FILE" "${LOG_FILE}.old"
fi

mkdir -p "$MODULE_DIR/logs"

log() {
    printf '[%s] [post-fs-data] %s\n' "$(date '+%H:%M:%S')" "$1" >> "$LOG_FILE" 2>/dev/null
}

log "=== Started ==="

# 1. Create and mount IPC tmpfs
if ! mountpoint -q "$IPC_DIR" 2>/dev/null; then
    mkdir -p "$IPC_DIR"
    mount -t tmpfs -o size=64m,mode=0777,uid=0,gid=0 tmpfs "$IPC_DIR" 2>/dev/null

    if mountpoint -q "$IPC_DIR" 2>/dev/null; then
        log "Mounted tmpfs at $IPC_DIR"
    else
        log "ERROR: Failed to mount tmpfs at $IPC_DIR"
        chmod 0777 "$IPC_DIR" 2>/dev/null
        log "Fallback: using regular directory $IPC_DIR"
    fi
else
    log "$IPC_DIR already mounted"
fi

# 2. Create IPC subdirectories
for subdir in config state logs; do
    mkdir -p "$IPC_DIR/$subdir"
    chmod 0777 "$IPC_DIR/$subdir"
done
log "IPC subdirectories created"

# 3. Set SELinux contexts
if command -v chcon >/dev/null 2>&1; then
    # Keep IPC tree as tmpfs label so system_server + hooked processes can read it.
    if chcon -R u:object_r:tmpfs:s0 "$IPC_DIR" 2>/dev/null; then
        log "SELinux context applied to $IPC_DIR (tmpfs)"
    else
        log "WARNING: Failed to apply tmpfs SELinux context to $IPC_DIR"
    fi
fi

# 4. Write boot timestamp
printf '%s\n' "$(date '+%s')" > "$IPC_DIR/state/boot_time"
printf 'pending\n' > "$IPC_DIR/state/companion_status"
chmod 0644 "$IPC_DIR/state/boot_time"
chmod 0644 "$IPC_DIR/state/companion_status"
log "Boot timestamp written"

# 5. Pre-copy last known config to IPC dir
PREFS_FILE="/data/data/$VIRTUCAM_PKG/shared_prefs/virtucam_config.xml"
if [ -f "$PREFS_FILE" ]; then
    cp "$PREFS_FILE" "$IPC_DIR/config/virtucam_config.xml" 2>/dev/null
    chmod 0644 "$IPC_DIR/config/virtucam_config.xml" 2>/dev/null
    log "Pre-staged config from SharedPreferences"
fi

FALLBACK_JSON="/data/adb/virtucam/virtucam_config.json"
if [ -f "$FALLBACK_JSON" ]; then
    cp "$FALLBACK_JSON" "$IPC_DIR/config/virtucam_config.json" 2>/dev/null
    chmod 0644 "$IPC_DIR/config/virtucam_config.json" 2>/dev/null
    log "Pre-staged fallback JSON config"
fi

log "=== post-fs-data.sh completed ==="
