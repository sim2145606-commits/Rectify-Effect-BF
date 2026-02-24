#!/system/bin/sh
# VirtuCam Companion - post-fs-data.sh
# Runs before Zygote starts, as root.

VIRTUCAM_PKG="com.briefplantrain.virtucam"
IPC_DIR="/dev/virtucam_ipc"
MODULE_DIR="/data/adb/modules/virtucam_companion"
LOG_FILE="$MODULE_DIR/logs/post-fs-data.log"
PERSISTENT_ROOT="/data/adb/virtucam"
PERSISTENT_CFG_DIR="$PERSISTENT_ROOT/config"
PERSISTENT_STATE_DIR="$PERSISTENT_ROOT/state"
PERSISTENT_JSON="$PERSISTENT_CFG_DIR/virtucam_config.json"
PERSISTENT_JSON_LEGACY="$PERSISTENT_ROOT/virtucam_config.json"

# Rotate log if too large (>256KB)
if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)" -gt 262144 ]; then
    mv "$LOG_FILE" "${LOG_FILE}.old"
fi

mkdir -p "$MODULE_DIR/logs"

log() {
    printf '[%s] [post-fs-data] %s\n' "$(date '+%H:%M:%S')" "$1" >> "$LOG_FILE" 2>/dev/null
}

write_atomic_text() {
    local file="$1"
    local value="$2"
    local mode="${3:-0644}"
    local tmp="${file}.tmp.$$"
    printf '%s\n' "$value" > "$tmp" 2>/dev/null || return 1
    chmod "$mode" "$tmp" 2>/dev/null
    mv -f "$tmp" "$file" 2>/dev/null || return 1
    if command -v chcon >/dev/null 2>&1; then
        case "$file" in
            /dev/virtucam_ipc/*) chcon u:object_r:tmpfs:s0 "$file" 2>/dev/null ;;
            /data/adb/virtucam/*) chcon u:object_r:adb_data_file:s0 "$file" 2>/dev/null ;;
        esac
    fi
    return 0
}

discover_prefs_file() {
    local user0="/data/user/0/$VIRTUCAM_PKG/shared_prefs/virtucam_config.xml"
    local legacy="/data/data/$VIRTUCAM_PKG/shared_prefs/virtucam_config.xml"
    local modern=""

    if [ -f "$user0" ]; then
        echo "$user0"
        return
    fi
    if [ -f "$legacy" ]; then
        echo "$legacy"
        return
    fi

    modern="$(find /data/misc -type f -path "*/prefs/$VIRTUCAM_PKG/virtucam_config.xml" 2>/dev/null | head -n 1)"
    if [ -n "$modern" ] && [ -f "$modern" ]; then
        echo "$modern"
        return
    fi

    echo ""
}

init_runtime_state() {
    local now
    now="$(date '+%s000')"
    local runtime_json
    runtime_json="$(cat <<EOF
{"runtime_ready":false,"config_primary_readable":false,"config_ipc_readable":false,"hook_last_read_ok":false,"active_source_mode":"black","source_mode_effective":"black","last_error_code":"boot_pending","last_error_message":"companion boot in progress","last_ok_epoch_ms":0,"updated_epoch_ms":$now}
EOF
)"
    write_atomic_text "$IPC_DIR/state/runtime_state.json" "$runtime_json" 0644
    mkdir -p "$PERSISTENT_STATE_DIR" 2>/dev/null
    chmod 0700 "$PERSISTENT_ROOT" "$PERSISTENT_STATE_DIR" 2>/dev/null
    write_atomic_text "$PERSISTENT_STATE_DIR/runtime_state.json" "$runtime_json" 0644
}

sync_boot_config() {
    local staged=0
    if [ -r "$PERSISTENT_JSON" ]; then
        cp "$PERSISTENT_JSON" "$IPC_DIR/config/virtucam_config.json" 2>/dev/null && staged=1
    elif [ -r "$PERSISTENT_JSON_LEGACY" ]; then
        cp "$PERSISTENT_JSON_LEGACY" "$IPC_DIR/config/virtucam_config.json" 2>/dev/null && staged=1
    fi

    if [ "$staged" -eq 1 ]; then
        chmod 0644 "$IPC_DIR/config/virtucam_config.json" 2>/dev/null
        if command -v chcon >/dev/null 2>&1; then
            chcon u:object_r:tmpfs:s0 "$IPC_DIR/config/virtucam_config.json" 2>/dev/null
        fi
        log "Pre-staged config from persistent store"
        return
    fi

    local prefs_file
    prefs_file="$(discover_prefs_file)"
    if [ -n "$prefs_file" ] && [ -f "$prefs_file" ]; then
        cp "$prefs_file" "$IPC_DIR/config/virtucam_config.xml" 2>/dev/null
        chmod 0644 "$IPC_DIR/config/virtucam_config.xml" 2>/dev/null
        if command -v chcon >/dev/null 2>&1; then
            chcon u:object_r:tmpfs:s0 "$IPC_DIR/config/virtucam_config.xml" 2>/dev/null
        fi
        log "Pre-staged config from SharedPreferences: $prefs_file"
    else
        log "SharedPreferences config not found during pre-stage"
    fi
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
for subdir in config state logs media; do
    mkdir -p "$IPC_DIR/$subdir"
    chmod 0777 "$IPC_DIR/$subdir"
done
log "IPC subdirectories created"

# 3. Set SELinux contexts
if command -v chcon >/dev/null 2>&1; then
    if chcon -R u:object_r:tmpfs:s0 "$IPC_DIR" 2>/dev/null; then
        log "SELinux context applied to $IPC_DIR (tmpfs)"
    else
        log "WARNING: Failed to apply tmpfs SELinux context to $IPC_DIR"
    fi
fi

# 4. Initialize state
write_atomic_text "$IPC_DIR/state/boot_time" "$(date '+%s')" 0644
write_atomic_text "$IPC_DIR/state/companion_status" "pending" 0644
write_atomic_text "$IPC_DIR/state/config_status" "config_missing" 0644
write_atomic_text "$IPC_DIR/state/marker_status" "marker_missing" 0644
write_atomic_text "$IPC_DIR/state/marker_source" "none" 0644
write_atomic_text "$IPC_DIR/state/scope_status" "scope_mismatch" 0644
write_atomic_text "$IPC_DIR/state/runtime_status" "runtime_missing" 0644
init_runtime_state
log "Boot state initialized"

# 5. Pre-copy last known config to IPC dir
sync_boot_config

log "=== post-fs-data.sh completed ==="
