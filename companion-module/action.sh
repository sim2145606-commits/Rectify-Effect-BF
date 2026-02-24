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
RUNTIME_STATE_JSON="$IPC_DIR/state/runtime_state.json"
COMPLETE_FILE="$IPC_DIR/state/service_complete_time"
PERSISTENT_ROOT="/data/adb/virtucam"
PERSISTENT_CFG_DIR="$PERSISTENT_ROOT/config"
PERSISTENT_STATE_DIR="$PERSISTENT_ROOT/state"
PERSISTENT_JSON="$PERSISTENT_CFG_DIR/virtucam_config.json"
PERSISTENT_JSON_LEGACY="$PERSISTENT_ROOT/virtucam_config.json"
PERSISTENT_RUNTIME_JSON="$PERSISTENT_STATE_DIR/runtime_state.json"
LOCK_DIR="$IPC_DIR/state/.action_lock"

release_lock() {
    rm -f "$LOCK_DIR/pid" 2>/dev/null
    rmdir "$LOCK_DIR" 2>/dev/null
}

acquire_lock() {
    mkdir -p "$IPC_DIR/state" 2>/dev/null
    if mkdir "$LOCK_DIR" 2>/dev/null; then
        printf '%s\n' "$$" > "$LOCK_DIR/pid" 2>/dev/null
        return 0
    fi
    return 1
}

json_escape() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

write_state_file() {
    local file="$1"
    local value="$2"
    local tmp="${file}.tmp.$$"
    printf '%s\n' "$value" > "$tmp" 2>/dev/null || return 1
    chmod 0644 "$tmp" 2>/dev/null
    mv -f "$tmp" "$file" 2>/dev/null || return 1
    if command -v chcon >/dev/null 2>&1; then
        case "$file" in
            /dev/virtucam_ipc/*) chcon u:object_r:tmpfs:s0 "$file" 2>/dev/null ;;
        esac
    fi
    return 0
}

copy_file_atomic() {
    local src="$1"
    local dst="$2"
    local mode="${3:-0644}"
    local tmp="${dst}.tmp.$$"
    cat "$src" > "$tmp" 2>/dev/null || return 1
    chmod "$mode" "$tmp" 2>/dev/null
    mv -f "$tmp" "$dst" 2>/dev/null || return 1
    if command -v chcon >/dev/null 2>&1; then
        case "$dst" in
            /dev/virtucam_ipc/*) chcon u:object_r:tmpfs:s0 "$dst" 2>/dev/null ;;
            /data/adb/virtucam/*) chcon u:object_r:adb_data_file:s0 "$dst" 2>/dev/null ;;
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

allow_broad_scope_enabled() {
    local src=""
    if [ -r "$PERSISTENT_JSON" ]; then
        src="$PERSISTENT_JSON"
    elif [ -r "$CFG_JSON" ]; then
        src="$CFG_JSON"
    fi
    if [ -z "$src" ]; then
        return 1
    fi
    tr -d '\n' < "$src" 2>/dev/null | grep -q '"allowBroadScope"[[:space:]]*:[[:space:]]*true'
}

auto_prune_broad_scope() {
    local lspd_config
    lspd_config="$(find_lspd_config)"
    if [ -z "$lspd_config" ]; then
        return
    fi

    if allow_broad_scope_enabled; then
        echo "[INFO] Broad scope override enabled; skipping auto-prune"
        return
    fi

    local scope_root="$lspd_config/scope/$VIRTUCAM_PKG"
    if [ ! -d "$scope_root" ]; then
        return
    fi

    local removed=0
    for pkg in android system com.android.systemui com.android.phone; do
        if [ -e "$scope_root/$pkg" ]; then
            rm -rf "$scope_root/$pkg" 2>/dev/null
            removed=$((removed + 1))
        fi
    done
    if [ "$removed" -gt 0 ]; then
        echo "[OK] Auto-pruned broad LSPosed scope entries ($removed)"
    fi
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

hook_can_read_primary() {
    if [ -r "$PERSISTENT_JSON" ]; then
        return 0
    fi
    su 1000 -c "cat '$PERSISTENT_JSON' >/dev/null 2>&1" >/dev/null 2>&1 && return 0
    su 2000 -c "cat '$PERSISTENT_JSON' >/dev/null 2>&1" >/dev/null 2>&1 && return 0
    return 1
}

read_config_value() {
    local key="$1"
    local src=""
    if [ -r "$PERSISTENT_JSON" ]; then
        src="$PERSISTENT_JSON"
    elif [ -r "$CFG_JSON" ]; then
        src="$CFG_JSON"
    fi
    if [ -z "$src" ]; then
        echo ""
        return
    fi
    tr -d '\n' < "$src" 2>/dev/null | sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | head -n 1
}

read_previous_last_ok_epoch_ms() {
    local src=""
    if [ -r "$RUNTIME_STATE_JSON" ]; then
        src="$RUNTIME_STATE_JSON"
    elif [ -r "$PERSISTENT_RUNTIME_JSON" ]; then
        src="$PERSISTENT_RUNTIME_JSON"
    fi
    if [ -z "$src" ]; then
        echo "0"
        return
    fi
    tr -d '\n' < "$src" 2>/dev/null | sed -n 's/.*"last_ok_epoch_ms"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -n 1
}

write_runtime_state_json() {
    local runtime_ready="$1"
    local config_primary_readable="$2"
    local config_ipc_readable="$3"
    local hook_last_read_ok="$4"
    local active_source_mode="$5"
    local source_mode_effective="$6"
    local last_error_code="$7"
    local last_error_message="$8"
    local last_ok_epoch_ms="$9"
    local now_ms
    now_ms="$(date '+%s000')"

    local escaped_error_code escaped_error_message escaped_active_mode escaped_effective_mode
    escaped_error_code="$(json_escape "$last_error_code")"
    escaped_error_message="$(json_escape "$last_error_message")"
    escaped_active_mode="$(json_escape "$active_source_mode")"
    escaped_effective_mode="$(json_escape "$source_mode_effective")"

    local payload
    payload="$(cat <<EOF
{"runtime_ready":$runtime_ready,"config_primary_readable":$config_primary_readable,"config_ipc_readable":$config_ipc_readable,"hook_last_read_ok":$hook_last_read_ok,"active_source_mode":"$escaped_active_mode","source_mode_effective":"$escaped_effective_mode","last_error_code":"$escaped_error_code","last_error_message":"$escaped_error_message","last_ok_epoch_ms":$last_ok_epoch_ms,"updated_epoch_ms":$now_ms}
EOF
)"

    write_state_file "$RUNTIME_STATE_JSON" "$payload"
    mkdir -p "$PERSISTENT_STATE_DIR" 2>/dev/null
    chmod 0700 "$PERSISTENT_ROOT" "$PERSISTENT_STATE_DIR" 2>/dev/null
    write_state_file "$PERSISTENT_RUNTIME_JSON" "$payload"
}

sync_persistent_and_ipc_config() {
    local prefs_file
    prefs_file="$(discover_prefs_file)"

    mkdir -p "$PERSISTENT_ROOT" "$PERSISTENT_CFG_DIR" "$PERSISTENT_STATE_DIR" 2>/dev/null
    chmod 0700 "$PERSISTENT_ROOT" "$PERSISTENT_CFG_DIR" "$PERSISTENT_STATE_DIR" 2>/dev/null

    if [ ! -r "$PERSISTENT_JSON" ] && [ -r "$PERSISTENT_JSON_LEGACY" ]; then
        copy_file_atomic "$PERSISTENT_JSON_LEGACY" "$PERSISTENT_JSON" 0644
    fi

    if [ -r "$PERSISTENT_JSON" ]; then
        copy_file_atomic "$PERSISTENT_JSON" "$CFG_JSON" 0644
    fi

    if [ -n "$prefs_file" ] && [ -r "$prefs_file" ]; then
        chmod 0644 "$prefs_file" 2>/dev/null
        copy_file_atomic "$prefs_file" "$CFG_XML" 0644
    fi

    if [ -r "$CFG_JSON" ] && [ ! -r "$PERSISTENT_JSON" ]; then
        copy_file_atomic "$CFG_JSON" "$PERSISTENT_JSON" 0644
    fi

    if [ -r "$PERSISTENT_JSON" ]; then
        copy_file_atomic "$PERSISTENT_JSON" "$PERSISTENT_JSON_LEGACY" 0644
    fi
}

update_companion_state() {
    local config_primary_readable="false"
    local config_ipc_readable="false"
    local hook_last_read_ok="false"
    local runtime_ready="false"
    local config_state="config_missing"
    local marker_state="marker_missing"
    local marker_source="none"
    local scope_state="scope_mismatch"
    local runtime_state="runtime_missing"
    local companion_state="pending"
    local last_error_code=""
    local last_error_message=""

    if [ -r "$PERSISTENT_JSON" ]; then
        config_primary_readable="true"
        config_state="config_ready"
    else
        last_error_code="primary_config_missing"
        last_error_message="primary config unreadable"
    fi

    if [ -r "$CFG_JSON" ]; then
        config_ipc_readable="true"
    fi

    if hook_can_read_primary; then
        hook_last_read_ok="true"
    else
        last_error_code="hook_read_failed"
        last_error_message="hook process cannot read primary config"
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
    else
        last_error_code="scope_mismatch"
        last_error_message="scope not ready"
    fi

    if has_runtime_observation; then
        runtime_state="runtime_observed"
    fi

    if [ "$scope_state" = "scope_ok" ] && [ "$config_primary_readable" = "true" ] && [ "$hook_last_read_ok" = "true" ]; then
        runtime_ready="true"
    fi

    if [ "$scope_state" != "scope_ok" ]; then
        companion_state="scope_mismatch"
    elif [ "$config_primary_readable" != "true" ]; then
        companion_state="config_missing"
    elif [ "$hook_last_read_ok" != "true" ]; then
        companion_state="config_unreadable"
    elif [ "$marker_state" = "marker_present" ] || [ "$runtime_state" = "runtime_observed" ]; then
        companion_state="ready"
    else
        companion_state="waiting_runtime"
    fi

    local active_source_mode source_mode_effective staged_path
    active_source_mode="$(read_config_value sourceMode)"
    [ -z "$active_source_mode" ] && active_source_mode="black"
    source_mode_effective="$active_source_mode"
    staged_path="$(read_config_value mediaSourcePath)"
    if [ "$active_source_mode" = "file" ] || [ "$active_source_mode" = "stream" ]; then
        if [ -z "$staged_path" ] || [ ! -r "$staged_path" ]; then
            source_mode_effective="black"
        fi
    fi

    local prev_last_ok now_ms last_ok_epoch_ms
    prev_last_ok="$(read_previous_last_ok_epoch_ms)"
    [ -z "$prev_last_ok" ] && prev_last_ok="0"
    now_ms="$(date '+%s000')"
    if [ "$runtime_ready" = "true" ]; then
        last_ok_epoch_ms="$now_ms"
    else
        last_ok_epoch_ms="$prev_last_ok"
    fi

    write_state_file "$STATUS_FILE" "$companion_state"
    write_state_file "$CONFIG_STATE_FILE" "$config_state"
    write_state_file "$MARKER_STATE_FILE" "$marker_state"
    write_state_file "$MARKER_SOURCE_FILE" "$marker_source"
    write_state_file "$SCOPE_STATE_FILE" "$scope_state"
    write_state_file "$RUNTIME_STATE_FILE" "$runtime_state"
    write_state_file "$COMPLETE_FILE" "$(date '+%s')"
    write_runtime_state_json \
        "$runtime_ready" \
        "$config_primary_readable" \
        "$config_ipc_readable" \
        "$hook_last_read_ok" \
        "$active_source_mode" \
        "$source_mode_effective" \
        "$last_error_code" \
        "$last_error_message" \
        "$last_ok_epoch_ms"

    local state_uid
    state_uid="$(stat -c '%u' "$IPC_DIR/state/boot_time" 2>/dev/null)"
    if [ -n "$state_uid" ]; then
        chown "$state_uid:$state_uid" \
            "$STATUS_FILE" "$CONFIG_STATE_FILE" "$MARKER_STATE_FILE" \
            "$MARKER_SOURCE_FILE" "$SCOPE_STATE_FILE" "$RUNTIME_STATE_FILE" "$COMPLETE_FILE" \
            "$RUNTIME_STATE_JSON" 2>/dev/null
    fi

    echo "[STATE] companion_status=$companion_state"
    echo "[STATE] config_primary_readable=$config_primary_readable"
    echo "[STATE] config_ipc_readable=$config_ipc_readable"
    echo "[STATE] hook_last_read_ok=$hook_last_read_ok"
    echo "[STATE] runtime_ready=$runtime_ready"
    echo "[STATE] source_mode_effective=$source_mode_effective"
}

echo "======================================"
echo "  VirtuCam Companion - Manual Refresh"
echo "======================================"

mkdir -p "$IPC_DIR/config" "$IPC_DIR/state" "$IPC_DIR/logs" "$IPC_DIR/media" 2>/dev/null
chmod 0777 "$IPC_DIR" "$IPC_DIR/config" "$IPC_DIR/state" "$IPC_DIR/logs" "$IPC_DIR/media" 2>/dev/null
if command -v chcon >/dev/null 2>&1; then
    chcon -R u:object_r:tmpfs:s0 "$IPC_DIR" 2>/dev/null
fi

if ! acquire_lock; then
    echo "[INFO] Companion refresh already in progress; skipping overlap."
    exit 0
fi
trap 'release_lock' EXIT INT TERM

sync_persistent_and_ipc_config
auto_prune_broad_scope

cmd appops set "$VIRTUCAM_PKG" SYSTEM_ALERT_WINDOW allow 2>/dev/null
cmd appops set "$VIRTUCAM_PKG" MANAGE_EXTERNAL_STORAGE allow 2>/dev/null
echo "[OK] AppOps grants refreshed"

echo " "
echo "IPC Directory ($IPC_DIR):"
ls -la "$IPC_DIR" 2>/dev/null || echo "  Not mounted"

echo " "
echo "Config Visibility:"
echo "  Primary JSON: $([ -r "$PERSISTENT_JSON" ] && echo readable || echo missing/unreadable)"
echo "  IPC JSON: $([ -r "$CFG_JSON" ] && echo readable || echo missing/unreadable)"
echo "  IPC XML: $([ -r "$CFG_XML" ] && echo readable || echo missing/unreadable)"

echo " "
echo "Marker files:"
echo "  IPC marker: $([ -e "$MARKER_IPC" ] && echo present || echo missing)"
echo "  Legacy marker: $([ -e "$MARKER_LEGACY" ] && echo present || echo missing)"

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
