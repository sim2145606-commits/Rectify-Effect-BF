#!/system/bin/sh
# VirtuCam Companion - service.sh
# Runs after Android boot, as root.

VIRTUCAM_PKG="com.briefplantrain.virtucam"
IPC_DIR="/dev/virtucam_ipc"
MODULE_DIR="/data/adb/modules/virtucam_companion"
LOG_FILE="$IPC_DIR/logs/service.log"
MODULE_LOG="$MODULE_DIR/logs/service.log"

log() {
    local msg
    msg="[$(date '+%Y-%m-%d %H:%M:%S')] [service] $1"
    printf '%s\n' "$msg" >> "$MODULE_LOG" 2>/dev/null
    if [ -d "$IPC_DIR/logs" ]; then
        printf '%s\n' "$msg" >> "$LOG_FILE" 2>/dev/null
    fi
}

# Wait for full Android boot
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

# Resolve VirtuCam UID
get_virtucam_uid() {
    local uid
    uid="$(stat -c '%u' "/data/data/$VIRTUCAM_PKG" 2>/dev/null)"
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

# LSPosed scope helper
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

    # Method A: SQLite database (modern LSPosed)
    local db="$lspd_config/modules_config.db"
    if [ -f "$db" ] && command -v sqlite3 >/dev/null 2>&1; then
        local enabled
        enabled="$(sqlite3 "$db" "SELECT enabled FROM modules WHERE module_pkg_name='$VIRTUCAM_PKG';" 2>/dev/null)"

        if [ "$enabled" = "1" ]; then
            log "Module already enabled in LSPosed DB"
        elif [ -z "$enabled" ]; then
            log "Module not in LSPosed DB - inserting..."
            sqlite3 "$db" \
                "INSERT INTO modules (module_pkg_name, enabled) VALUES ('$VIRTUCAM_PKG', 1);" \
                2>/dev/null && log "Module inserted into LSPosed DB" \
                            || log "WARNING: DB insert failed (may need manual scope add)"
        else
            log "Module in DB but disabled - enabling..."
            sqlite3 "$db" \
                "UPDATE modules SET enabled=1 WHERE module_pkg_name='$VIRTUCAM_PKG';" \
                2>/dev/null && log "Module enabled in LSPosed DB"
        fi
    fi

    # Method B: Scope directory (file-based LSPosed versions)
    local scope_dir="$lspd_config/scope/$VIRTUCAM_PKG"
    if [ -d "$lspd_config/scope" ] && [ ! -d "$scope_dir" ]; then
        mkdir -p "$scope_dir"
        log "Created scope directory: $scope_dir"
    fi

    # Method C: modules.list (some LSPosed forks)
    local modules_list="$lspd_config/modules.list"
    if [ -f "$modules_list" ]; then
        if ! grep -qF "$VIRTUCAM_PKG" "$modules_list" 2>/dev/null; then
            printf '%s\n' "$VIRTUCAM_PKG" >> "$modules_list"
            log "Added to modules.list"
        else
            log "Already in modules.list"
        fi
    fi

    return 0
}

# Fix SharedPreferences world-readability
fix_shared_prefs() {
    local prefs_dir="/data/data/$VIRTUCAM_PKG/shared_prefs"
    local prefs_file="$prefs_dir/virtucam_config.xml"

    if [ -d "$prefs_dir" ]; then
        chmod 0771 "$prefs_dir" 2>/dev/null
        log "Fixed shared_prefs dir: chmod 0771"
    fi

    if [ -f "$prefs_file" ]; then
        chmod 0644 "$prefs_file" 2>/dev/null
        log "Fixed virtucam_config.xml: chmod 0644"

        cp "$prefs_file" "$IPC_DIR/config/virtucam_config.xml" 2>/dev/null
        chmod 0644 "$IPC_DIR/config/virtucam_config.xml" 2>/dev/null
        log "Config synced to IPC dir"
    fi

    restorecon -R "$prefs_dir" 2>/dev/null && log "SELinux context restored on prefs dir"
}

# Grant permissions via appops
grant_permissions() {
    cmd appops set "$VIRTUCAM_PKG" SYSTEM_ALERT_WINDOW allow 2>/dev/null \
        && log "SYSTEM_ALERT_WINDOW: granted" \
        || log "SYSTEM_ALERT_WINDOW: grant failed (manual grant required)"

    cmd appops set "$VIRTUCAM_PKG" MANAGE_EXTERNAL_STORAGE allow 2>/dev/null \
        && log "MANAGE_EXTERNAL_STORAGE: granted"

    pm grant "$VIRTUCAM_PKG" android.permission.READ_EXTERNAL_STORAGE 2>/dev/null
    pm grant "$VIRTUCAM_PKG" android.permission.WRITE_EXTERNAL_STORAGE 2>/dev/null
    log "Storage permissions grant attempted"

    pm grant "$VIRTUCAM_PKG" android.permission.FOREGROUND_SERVICE 2>/dev/null
    log "FOREGROUND_SERVICE grant attempted"
}

# Fix IPC dir ownership after UID is known
fix_ipc_ownership() {
    local uid="$1"
    if [ -z "$uid" ]; then
        return
    fi
    chown -R "$uid:$uid" "$IPC_DIR" 2>/dev/null
    chmod -R 0777 "$IPC_DIR" 2>/dev/null
    log "IPC dir ownership fixed: UID=$uid"
}

# Keep IPC tree readable to system_server / hooked processes.
fix_ipc_contexts() {
    if ! command -v chcon >/dev/null 2>&1; then
        return
    fi

    if [ -d "$IPC_DIR" ]; then
        if chcon -R u:object_r:tmpfs:s0 "$IPC_DIR" 2>/dev/null; then
            log "IPC SELinux context normalized (tmpfs)"
        else
            log "WARNING: Failed to normalize IPC SELinux context"
        fi
    fi
}

# Restore FloatingOverlayService if it was running
restore_overlay_service() {
    local prefs_file="/data/data/$VIRTUCAM_PKG/shared_prefs/virtucam_config.xml"
    if [ ! -f "$prefs_file" ]; then
        return
    fi

    if grep -q 'name="overlayEnabled" value="true"' "$prefs_file" 2>/dev/null; then
        log "overlayEnabled=true detected - restarting FloatingOverlayService..."
        sleep 5
        am startservice --user 0 -n "$VIRTUCAM_PKG/.FloatingOverlayService" 2>/dev/null \
            && log "FloatingOverlayService restart sent" \
            || log "FloatingOverlayService restart failed (app may not be running yet)"
    fi
}

# Sync to persistent config store
sync_persistent_store() {
    local prefs_file="/data/data/$VIRTUCAM_PKG/shared_prefs/virtucam_config.xml"
    local persistent_dir="/data/adb/virtucam"

    mkdir -p "$persistent_dir"
    chmod 0700 "$persistent_dir"

    if [ -f "$prefs_file" ]; then
        cp "$prefs_file" "$persistent_dir/virtucam_config.xml" 2>/dev/null
        log "Config synced to persistent store: $persistent_dir"
    fi

    if [ -f "$IPC_DIR/config/virtucam_config.json" ]; then
        cp "$IPC_DIR/config/virtucam_config.json" "$persistent_dir/virtucam_config.json" 2>/dev/null
    fi
}

wait_for_boot

log "=== service.sh started ==="

VIRTUCAM_UID="$(get_virtucam_uid)"
log "VirtuCam UID resolved: '${VIRTUCAM_UID}'"

fix_ipc_ownership "$VIRTUCAM_UID"
fix_ipc_contexts
fix_shared_prefs
grant_permissions
ensure_lsposed_scope
sync_persistent_store
fix_ipc_contexts

# Write companion ready status to IPC
printf 'ready\n' > "$IPC_DIR/state/companion_status"
printf '%s\n' "$(date '+%s')" > "$IPC_DIR/state/service_complete_time"
chmod 0644 "$IPC_DIR/state/companion_status"
chmod 0644 "$IPC_DIR/state/service_complete_time"
log "Companion status: READY"

restore_overlay_service

log "=== service.sh completed ==="
