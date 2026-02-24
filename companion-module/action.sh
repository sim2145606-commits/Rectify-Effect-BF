#!/system/bin/sh
# VirtuCam Companion - action.sh
# Triggered by KSU/APatch Action button.

VIRTUCAM_PKG="com.briefplantrain.virtucam"
IPC_DIR="/dev/virtucam_ipc"
CFG_JSON="$IPC_DIR/config/virtucam_config.json"
CFG_XML="$IPC_DIR/config/virtucam_config.xml"
MARKER_IPC="$IPC_DIR/state/module_active"
MARKER_LEGACY="/data/local/tmp/virtucam_module_active"
STATUS_FILE="$IPC_DIR/state/companion_status"
CONFIG_STATE_FILE="$IPC_DIR/state/config_status"
MARKER_STATE_FILE="$IPC_DIR/state/marker_status"
MARKER_SOURCE_FILE="$IPC_DIR/state/marker_source"
SCOPE_STATE_FILE="$IPC_DIR/state/scope_status"
RUNTIME_STATE_FILE="$IPC_DIR/state/runtime_status"
COMPLETE_FILE="$IPC_DIR/state/service_complete_time"
PERSISTENT_DIR="/data/adb/virtucam"
PERSISTENT_JSON="$PERSISTENT_DIR/virtucam_config.json"
PERSISTENT_XML="$PERSISTENT_DIR/virtucam_config.xml"

write_state_file() {
    local file="$1"
    local value="$2"
    printf '%s\n' "$value" > "$file" 2>/dev/null
    chmod 0644 "$file" 2>/dev/null
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

has_runtime_observation() {
    local active_line
    local mapping_line

    active_line="$(grep -h 'VirtuCam/XposedEntry: module active in process:' \
        /data/adb/lspd/log/modules_*.log /data/adb/lspd/log.old/modules_*.log 2>/dev/null | tail -n 1)"
    if [ -n "$active_line" ]; then
        return 0
    fi

    mapping_line="$(grep -h 'VirtuCam/XposedEntry: createCaptureSession' \
        /data/adb/lspd/log/modules_*.log /data/adb/lspd/log.old/modules_*.log 2>/dev/null | tail -n 1)"
    if [ -n "$mapping_line" ]; then
        return 0
    fi

    return 1
}

find_lspd_config() {
    for dir in \
        /data/adb/lspd \
        /data/adb/modules/zygisk_lsposed \
        /data/adb/modules/riru_lsposed \
        /data/adb/modules/lsposed \
        /data/adb/modules/zygisk-lsposed; do
        if [ -d "$dir/config" ]; then
            echo "$dir/config"
            return 0
        fi
    done
    return 1
}

is_scope_enabled() {
    local lspd_config
    lspd_config="$(find_lspd_config)"
    if [ -z "$lspd_config" ]; then
        return 1
    fi

    local db="$lspd_config/modules_config.db"
    if [ -f "$db" ] && command -v sqlite3 >/dev/null 2>&1; then
        if sqlite3 "$db" ".dump modules" 2>/dev/null | grep -q "INSERT INTO modules VALUES(.*'$VIRTUCAM_PKG'.*,1,"; then
            return 0
        fi
    fi

    if [ -d "$lspd_config/scope/$VIRTUCAM_PKG" ]; then
        return 0
    fi

    local modules_list="$lspd_config/modules.list"
    if [ -f "$modules_list" ] && grep -qF "$VIRTUCAM_PKG" "$modules_list" 2>/dev/null; then
        return 0
    fi

    return 1
}

update_companion_state() {
    local config_state="config_missing"
    local marker_state="marker_missing"
    local marker_source="none"
    local scope_state="scope_mismatch"
    local runtime_state="runtime_missing"
    local companion_state="pending"

    if [ -r "$CFG_JSON" ] || [ -r "$CFG_XML" ]; then
        config_state="config_ready"
    fi

    if [ -e "$MARKER_IPC" ]; then
        marker_state="marker_present"
        marker_source="ipc"
    elif [ -e "$MARKER_LEGACY" ]; then
        marker_state="marker_present"
        marker_source="legacy"
    fi

    if is_scope_enabled; then
        scope_state="scope_ok"
    fi

    if has_runtime_observation; then
        runtime_state="runtime_observed"
    fi

    if [ "$scope_state" != "scope_ok" ]; then
        companion_state="scope_mismatch"
    elif [ "$config_state" != "config_ready" ]; then
        companion_state="config_missing"
    elif [ "$marker_state" = "marker_present" ] || [ "$runtime_state" = "runtime_observed" ]; then
        companion_state="ready"
    else
        companion_state="waiting_runtime"
    fi

    write_state_file "$STATUS_FILE" "$companion_state"
    write_state_file "$CONFIG_STATE_FILE" "$config_state"
    write_state_file "$MARKER_STATE_FILE" "$marker_state"
    write_state_file "$MARKER_SOURCE_FILE" "$marker_source"
    write_state_file "$SCOPE_STATE_FILE" "$scope_state"
    write_state_file "$RUNTIME_STATE_FILE" "$runtime_state"
    write_state_file "$COMPLETE_FILE" "$(date '+%s')"
    local state_uid
    state_uid="$(stat -c '%u' "$IPC_DIR/state/boot_time" 2>/dev/null)"
    if [ -n "$state_uid" ]; then
        chown "$state_uid:$state_uid" \
            "$STATUS_FILE" "$CONFIG_STATE_FILE" "$MARKER_STATE_FILE" \
            "$MARKER_SOURCE_FILE" "$SCOPE_STATE_FILE" "$RUNTIME_STATE_FILE" "$COMPLETE_FILE" 2>/dev/null
    fi

    echo "[STATE] companion_status=$companion_state"
    echo "[STATE] config_state=$config_state"
    echo "[STATE] marker_state=$marker_state"
    echo "[STATE] marker_source=$marker_source"
    echo "[STATE] scope_state=$scope_state"
    echo "[STATE] runtime_state=$runtime_state"
}

echo "======================================"
echo "  VirtuCam Companion - Manual Refresh"
echo "======================================"

mkdir -p "$IPC_DIR/config" "$IPC_DIR/state" "$IPC_DIR/logs" "$IPC_DIR/media" 2>/dev/null
chmod 0777 "$IPC_DIR" "$IPC_DIR/config" "$IPC_DIR/state" "$IPC_DIR/logs" "$IPC_DIR/media" 2>/dev/null

PREFS_FILE="$(discover_prefs_file)"
if [ -n "$PREFS_FILE" ] && [ -f "$PREFS_FILE" ]; then
    chmod 0644 "$PREFS_FILE"
    cp "$PREFS_FILE" "$CFG_XML" 2>/dev/null
    chmod 0644 "$CFG_XML" 2>/dev/null
    echo "[OK] SharedPrefs permissions fixed and XML synced ($PREFS_FILE)"
else
    echo "[WARN] SharedPrefs config missing (searched user0/data/misc prefs)"
fi

if [ -f "$PERSISTENT_JSON" ]; then
    cp "$PERSISTENT_JSON" "$CFG_JSON" 2>/dev/null
    chmod 0644 "$CFG_JSON" 2>/dev/null
    echo "[OK] Persistent JSON synced to IPC"
fi

if [ ! -f "$CFG_XML" ] && [ -f "$PERSISTENT_XML" ]; then
    cp "$PERSISTENT_XML" "$CFG_XML" 2>/dev/null
    chmod 0644 "$CFG_XML" 2>/dev/null
    echo "[OK] Persistent XML synced to IPC"
fi

if command -v chcon >/dev/null 2>&1; then
    if chcon -R u:object_r:tmpfs:s0 "$IPC_DIR" 2>/dev/null; then
        echo "[OK] IPC SELinux context normalized (tmpfs)"
    else
        echo "[WARN] Failed to normalize IPC SELinux context"
    fi
fi

cmd appops set "$VIRTUCAM_PKG" SYSTEM_ALERT_WINDOW allow 2>/dev/null
cmd appops set "$VIRTUCAM_PKG" MANAGE_EXTERNAL_STORAGE allow 2>/dev/null
echo "[OK] AppOps grants refreshed"

echo " "
echo "IPC Directory ($IPC_DIR):"
ls -la "$IPC_DIR" 2>/dev/null || echo "  Not mounted"

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
echo "Marker files:"
if [ -e "$MARKER_IPC" ]; then
    echo "  IPC marker: present"
else
    echo "  IPC marker: missing"
fi
if [ -e "$MARKER_LEGACY" ]; then
    echo "  Legacy marker: present"
else
    echo "  Legacy marker: missing"
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
update_companion_state

echo " "
echo "Recent service logs:"
tail -30 "$IPC_DIR/logs/service.log" 2>/dev/null || tail -30 /data/adb/modules/virtucam_companion/logs/service.log 2>/dev/null || echo "  No logs"

echo " "
echo "======================================"
echo "Refresh complete. No reboot needed."
