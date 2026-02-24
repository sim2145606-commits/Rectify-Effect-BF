#!/system/bin/sh
# VirtuCam Companion - service.sh
# Runs after Android boot, as root.

VIRTUCAM_PKG="com.briefplantrain.virtucam"
IPC_DIR="/dev/virtucam_ipc"
MODULE_DIR="/data/adb/modules/virtucam_companion"
LOG_FILE="$IPC_DIR/logs/service.log"
MODULE_LOG="$MODULE_DIR/logs/service.log"
CFG_JSON="$IPC_DIR/config/virtucam_config.json"
CFG_XML="$IPC_DIR/config/virtucam_config.xml"
MARKER_IPC="$IPC_DIR/state/module_active"
MARKER_LEGACY="/data/local/tmp/virtucam_module_active"
STATUS_FILE="$IPC_DIR/state/companion_status"
CONFIG_STATE_FILE="$IPC_DIR/state/config_status"
MARKER_STATE_FILE="$IPC_DIR/state/marker_status"
MARKER_SOURCE_FILE="$IPC_DIR/state/marker_source"
SCOPE_STATE_FILE="$IPC_DIR/state/scope_status"
COMPLETE_FILE="$IPC_DIR/state/service_complete_time"

log() {
    local msg
    msg="[$(date '+%Y-%m-%d %H:%M:%S')] [service] $1"
    printf '%s\n' "$msg" >> "$MODULE_LOG" 2>/dev/null
    if [ -d "$IPC_DIR/logs" ]; then
        printf '%s\n' "$msg" >> "$LOG_FILE" 2>/dev/null
    fi
}

write_state_file() {
    local file="$1"
    local value="$2"
    printf '%s\n' "$value" > "$file" 2>/dev/null
    chmod 0644 "$file" 2>/dev/null
}

wait_for_boot() {
    local timeout=120
    local elapsed=0
    log "Waiting for boot_completed..."
    while [ "$(getprop sys.boot_completed 2>/dev/null)" != "1" ]; do
        sleep 2
        elapsed=$((elapsed + 2))
        if [ "$elapsed" -ge "$timeout" ]; then
            log "WARNING: boot_completed timeout after ${timeout}s"
            break
        fi
    done
    sleep 3
    log "Boot completed (waited ${elapsed}s)"
}

get_virtucam_uid() {
    local uid
    uid="$(cmd package list packages -U 2>/dev/null | grep "package:$VIRTUCAM_PKG " | head -n1 | sed -n 's/.* uid:\([0-9][0-9]*\).*/\1/p')"
    if [ -n "$uid" ] && [ "$uid" -gt 1000 ]; then
        echo "$uid"
        return
    fi

    uid="$(stat -c '%u' "/data/user/0/$VIRTUCAM_PKG" 2>/dev/null)"
    if [ -n "$uid" ] && [ "$uid" -gt 1000 ]; then
        echo "$uid"
        return
    fi

    uid="$(stat -c '%u' "/data/data/$VIRTUCAM_PKG" 2>/dev/null)"
    if [ -n "$uid" ] && [ "$uid" -gt 1000 ]; then
        echo "$uid"
        return
    fi

    uid="$(dumpsys package "$VIRTUCAM_PKG" 2>/dev/null | grep -m1 "userId=" | sed -n 's/.*userId=\([0-9][0-9]*\).*/\1/p')"
    if [ -n "$uid" ] && [ "$uid" -gt 1000 ]; then
        echo "$uid"
        return
    fi

    uid="$(pm dump "$VIRTUCAM_PKG" 2>/dev/null | grep -m1 "userId=" | grep -o 'userId=[0-9]*' | cut -d= -f2)"
    if [ -n "$uid" ] && [ "$uid" -gt 1000 ]; then
        echo "$uid"
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

ensure_lsposed_scope() {
    local lspd_config
    lspd_config="$(find_lspd_config)"
    if [ -z "$lspd_config" ]; then
        log "LSPosed config not found - skipping scope setup"
        return 1
    fi
    log "LSPosed config found at: $lspd_config"

    local db="$lspd_config/modules_config.db"
    if [ -f "$db" ] && command -v sqlite3 >/dev/null 2>&1; then
        if sqlite3 "$db" ".dump modules" 2>/dev/null | grep -q "INSERT INTO modules VALUES(.*'$VIRTUCAM_PKG'.*,1,"; then
            log "Module is enabled in LSPosed DB"
        else
            log "WARNING: Module not enabled in LSPosed DB (enable manually in LSPosed)"
        fi
    fi

    local scope_dir="$lspd_config/scope/$VIRTUCAM_PKG"
    if [ -d "$lspd_config/scope" ] && [ ! -d "$scope_dir" ]; then
        mkdir -p "$scope_dir"
        log "Created scope directory: $scope_dir"
    fi

    local modules_list="$lspd_config/modules.list"
    if [ -f "$modules_list" ]; then
        if ! grep -qF "$VIRTUCAM_PKG" "$modules_list" 2>/dev/null; then
            printf '%s\n' "$VIRTUCAM_PKG" >> "$modules_list"
            log "Added to modules.list"
        fi
    fi

    return 0
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

fix_shared_prefs() {
    local prefs_dir="/data/data/$VIRTUCAM_PKG/shared_prefs"
    local prefs_file="$prefs_dir/virtucam_config.xml"
    local persistent_dir="/data/adb/virtucam"
    local persistent_json="$persistent_dir/virtucam_config.json"
    local persistent_xml="$persistent_dir/virtucam_config.xml"

    if [ -d "$prefs_dir" ]; then
        chmod 0771 "$prefs_dir" 2>/dev/null
        restorecon -R "$prefs_dir" 2>/dev/null
    fi

    if [ -f "$prefs_file" ]; then
        chmod 0644 "$prefs_file" 2>/dev/null
        cp "$prefs_file" "$CFG_XML" 2>/dev/null
        chmod 0644 "$CFG_XML" 2>/dev/null
        log "SharedPreferences config synced to IPC"
    else
        log "WARNING: SharedPreferences config missing ($prefs_file)"
    fi

    if [ -f "$persistent_json" ]; then
        cp "$persistent_json" "$CFG_JSON" 2>/dev/null
        chmod 0644 "$CFG_JSON" 2>/dev/null
        log "Persistent JSON config synced to IPC"
    fi

    if [ ! -f "$CFG_XML" ] && [ -f "$persistent_xml" ]; then
        cp "$persistent_xml" "$CFG_XML" 2>/dev/null
        chmod 0644 "$CFG_XML" 2>/dev/null
        log "Persistent XML config synced to IPC"
    fi
}

grant_permissions() {
    cmd appops set "$VIRTUCAM_PKG" SYSTEM_ALERT_WINDOW allow 2>/dev/null \
        && log "SYSTEM_ALERT_WINDOW granted" \
        || log "SYSTEM_ALERT_WINDOW grant failed (manual grant may be required)"

    cmd appops set "$VIRTUCAM_PKG" MANAGE_EXTERNAL_STORAGE allow 2>/dev/null \
        && log "MANAGE_EXTERNAL_STORAGE granted"

    pm grant "$VIRTUCAM_PKG" android.permission.READ_EXTERNAL_STORAGE 2>/dev/null
    pm grant "$VIRTUCAM_PKG" android.permission.WRITE_EXTERNAL_STORAGE 2>/dev/null
    pm grant "$VIRTUCAM_PKG" android.permission.FOREGROUND_SERVICE 2>/dev/null
}

normalize_ipc_permissions() {
    mkdir -p "$IPC_DIR" "$IPC_DIR/config" "$IPC_DIR/state" "$IPC_DIR/logs" "$IPC_DIR/media" 2>/dev/null
    chmod 0777 "$IPC_DIR" "$IPC_DIR/config" "$IPC_DIR/state" "$IPC_DIR/logs" "$IPC_DIR/media" 2>/dev/null
    log "IPC permissions normalized (ownership preserved)"
}

fix_ipc_contexts() {
    if command -v chcon >/dev/null 2>&1; then
        if chcon -R u:object_r:tmpfs:s0 "$IPC_DIR" 2>/dev/null; then
            log "IPC SELinux context normalized (tmpfs)"
        else
            log "WARNING: Failed to normalize IPC SELinux context"
        fi
    fi
}

sync_persistent_store() {
    local prefs_file="/data/data/$VIRTUCAM_PKG/shared_prefs/virtucam_config.xml"
    local persistent_dir="/data/adb/virtucam"

    mkdir -p "$persistent_dir"
    chmod 0700 "$persistent_dir"

    if [ -f "$prefs_file" ]; then
        cp "$prefs_file" "$persistent_dir/virtucam_config.xml" 2>/dev/null
    fi

    if [ -f "$CFG_JSON" ]; then
        cp "$CFG_JSON" "$persistent_dir/virtucam_config.json" 2>/dev/null
    fi
}

restore_overlay_service() {
    local prefs_file="/data/data/$VIRTUCAM_PKG/shared_prefs/virtucam_config.xml"
    if [ ! -f "$prefs_file" ]; then
        return
    fi

    if grep -q 'name="overlayEnabled" value="true"' "$prefs_file" 2>/dev/null; then
        log "overlayEnabled=true detected - restarting FloatingOverlayService"
        sleep 5
        am startservice --user 0 -n "$VIRTUCAM_PKG/.FloatingOverlayService" 2>/dev/null \
            && log "FloatingOverlayService restart sent" \
            || log "FloatingOverlayService restart failed"
    fi
}

update_companion_state() {
    local config_state="config_missing"
    local marker_state="marker_missing"
    local marker_source="none"
    local scope_state="scope_mismatch"
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

    if [ "$scope_state" != "scope_ok" ]; then
        companion_state="scope_mismatch"
    elif [ "$config_state" != "config_ready" ]; then
        companion_state="config_missing"
    elif [ "$marker_state" != "marker_present" ]; then
        companion_state="marker_missing"
    else
        companion_state="ready"
    fi

    write_state_file "$STATUS_FILE" "$companion_state"
    write_state_file "$CONFIG_STATE_FILE" "$config_state"
    write_state_file "$MARKER_STATE_FILE" "$marker_state"
    write_state_file "$MARKER_SOURCE_FILE" "$marker_source"
    write_state_file "$SCOPE_STATE_FILE" "$scope_state"
    write_state_file "$COMPLETE_FILE" "$(date '+%s')"
    if [ -n "$VIRTUCAM_UID" ]; then
        chown "$VIRTUCAM_UID:$VIRTUCAM_UID" \
            "$STATUS_FILE" "$CONFIG_STATE_FILE" "$MARKER_STATE_FILE" \
            "$MARKER_SOURCE_FILE" "$SCOPE_STATE_FILE" "$COMPLETE_FILE" 2>/dev/null
    fi

    log "Companion status: $companion_state (config=$config_state marker=$marker_state/$marker_source scope=$scope_state)"
}

log_ipc_snapshot() {
    local media_count="0"
    local staged_path=""

    if [ -d "$IPC_DIR/media" ]; then
        media_count="$(ls -1 "$IPC_DIR/media" 2>/dev/null | wc -l | tr -d ' ')"
        [ -z "$media_count" ] && media_count="0"
    fi

    if [ -r "$CFG_JSON" ]; then
        staged_path="$(tr -d '\n' < "$CFG_JSON" 2>/dev/null | sed -n 's/.*"mediaSourcePath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
    fi

    log "IPC snapshot: cfg_json=$( [ -r "$CFG_JSON" ] && echo yes || echo no ), cfg_xml=$( [ -r "$CFG_XML" ] && echo yes || echo no ), marker_ipc=$( [ -e "$MARKER_IPC" ] && echo yes || echo no ), marker_legacy=$( [ -e "$MARKER_LEGACY" ] && echo yes || echo no ), media_files=$media_count, staged_path='${staged_path}'"
}

mkdir -p "$MODULE_DIR/logs" 2>/dev/null
chmod 0755 "$MODULE_DIR" "$MODULE_DIR/logs" 2>/dev/null
normalize_ipc_permissions

wait_for_boot
log "=== service.sh started ==="

VIRTUCAM_UID="$(get_virtucam_uid)"
log "VirtuCam UID resolved: '${VIRTUCAM_UID}'"

fix_ipc_contexts
fix_shared_prefs
grant_permissions
ensure_lsposed_scope
sync_persistent_store
fix_ipc_contexts
update_companion_state
log_ipc_snapshot
restore_overlay_service

log "=== service.sh completed ==="
