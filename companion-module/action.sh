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
RUNTIME_STALE_MS=180000
DEFAULT_CAMERA_PKG="com.android.camera"

SCOPE_SYNC_OK="false"
SCOPE_SYNC_METHOD="none"

log() {
    echo "[INFO] $1"
}

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

config_json_source() {
    if [ -r "$PERSISTENT_JSON" ]; then
        echo "$PERSISTENT_JSON"
        return
    fi
    if [ -r "$CFG_JSON" ]; then
        echo "$CFG_JSON"
        return
    fi
    echo ""
}

read_json_string_from_config() {
    local key="$1"
    local src
    src="$(config_json_source)"
    if [ -z "$src" ]; then
        echo ""
        return
    fi
    tr -d '\n' < "$src" 2>/dev/null | sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | head -n 1
}

append_unique_pkg() {
    local pkg="$1"
    if [ -z "$pkg" ]; then
        return
    fi
    case "$pkg" in
        *[!a-zA-Z0-9._]*)
            return
            ;;
    esac
    case " $DESIRED_SCOPE_PACKAGES " in
        *" $pkg "*)
            ;;
        *)
            DESIRED_SCOPE_PACKAGES="${DESIRED_SCOPE_PACKAGES:+$DESIRED_SCOPE_PACKAGES }$pkg"
            ;;
    esac
}

resolve_stock_camera_package() {
    local resolved
    resolved="$(cmd package resolve-activity --brief "$DEFAULT_CAMERA_PKG" 2>/dev/null | tail -n 1 | tr -d '\r')"
    case "$resolved" in
        */*)
            resolved="${resolved%%/*}"
            ;;
    esac
    case "$resolved" in
        *[!a-zA-Z0-9._]*|"")
            resolved="$DEFAULT_CAMERA_PKG"
            ;;
    esac
    echo "$resolved"
}

build_desired_scope_packages() {
    local target_mode target_csv pkg stock_pkg
    DESIRED_SCOPE_PACKAGES=""
    target_mode="$(read_json_string_from_config targetMode | tr '[:upper:]' '[:lower:]')"
    target_csv="$(read_json_string_from_config targetPackages)"
    stock_pkg="$(resolve_stock_camera_package)"

    append_unique_pkg "$VIRTUCAM_PKG"
    append_unique_pkg "$stock_pkg"

    for pkg in $(printf '%s' "$target_csv" | tr ',' ' '); do
        append_unique_pkg "$pkg"
    done

    if [ "$target_mode" = "whitelist" ] && [ -z "$target_csv" ]; then
        log "Whitelist mode has no local targets; scope will include module + stock camera only"
    fi

    echo "$DESIRED_SCOPE_PACKAGES"
}

get_module_dump_line() {
    local db="$1"
    sqlite3 "$db" ".dump modules" 2>/dev/null | grep "INSERT INTO modules VALUES(.*'$VIRTUCAM_PKG'" | tail -n 1
}

get_module_mid() {
    local db="$1"
    local line
    line="$(get_module_dump_line "$db")"
    if [ -z "$line" ]; then
        echo ""
        return
    fi
    printf '%s\n' "$line" | sed -n 's/INSERT INTO modules VALUES(\([0-9][0-9]*\).*/\1/p'
}

ensure_module_list_entry() {
    local lspd_config="$1"
    local modules_list="$lspd_config/modules.list"
    if [ -f "$modules_list" ] && ! grep -qF "$VIRTUCAM_PKG" "$modules_list" 2>/dev/null; then
        printf '%s\n' "$VIRTUCAM_PKG" >> "$modules_list"
        log "Added $VIRTUCAM_PKG to modules.list"
    fi
}

sync_scope_db() {
    local lspd_config="$1"
    local desired="$2"
    local db="$lspd_config/modules_config.db"
    local mid dump_modules dump_scope tmp_sql verified_count pkg escaped_pkg

    if [ ! -f "$db" ] || ! command -v sqlite3 >/dev/null 2>&1; then
        return 1
    fi

    mid="$(get_module_mid "$db")"
    if [ -z "$mid" ]; then
        log "WARNING: VirtuCam module row missing in LSPosed DB"
        return 1
    fi

    dump_modules="$(sqlite3 "$db" ".dump modules" 2>/dev/null)"
    if printf '%s\n' "$dump_modules" | grep -q "INSERT INTO modules VALUES($mid,'$VIRTUCAM_PKG'.*,1,"; then
        log "Module is enabled in LSPosed DB (mid=$mid)"
    else
        log "WARNING: Module appears disabled in LSPosed DB (mid=$mid)"
    fi

    tmp_sql="$IPC_DIR/state/.scope_sync_$$.sql"
    {
        echo "BEGIN;"
        echo "DELETE FROM scope WHERE mid=$mid AND user_id=0;"
        for pkg in $desired; do
            escaped_pkg="$(printf '%s' "$pkg" | sed "s/'/''/g")"
            echo "INSERT OR REPLACE INTO scope(mid,app_pkg_name,user_id) VALUES($mid,'$escaped_pkg',0);"
        done
        echo "COMMIT;"
    } > "$tmp_sql"

    if ! sqlite3 "$db" < "$tmp_sql" >/dev/null 2>&1; then
        rm -f "$tmp_sql" 2>/dev/null
        return 1
    fi
    rm -f "$tmp_sql" 2>/dev/null

    dump_scope="$(sqlite3 "$db" ".dump scope" 2>/dev/null)"
    verified_count=0
    for pkg in $desired; do
        if printf '%s\n' "$dump_scope" | grep -q "INSERT INTO scope VALUES($mid,'$pkg',0);"; then
            verified_count=$((verified_count + 1))
        else
            log "WARNING: Scope verify missing package '$pkg' for mid=$mid"
            return 1
        fi
    done
    log "Scope DB sync complete (mid=$mid, packages=$verified_count)"
    return 0
}

sync_scope_dirs() {
    local lspd_config="$1"
    local desired="$2"
    local scope_root="$lspd_config/scope/$VIRTUCAM_PKG"
    local entry existing pkg

    mkdir -p "$scope_root" 2>/dev/null || return 1

    for entry in "$scope_root"/*; do
        [ -e "$entry" ] || continue
        existing="$(basename "$entry")"
        case " $desired " in
            *" $existing "*)
                ;;
            *)
                rm -rf "$entry" 2>/dev/null
                ;;
        esac
    done

    for pkg in $desired; do
        mkdir -p "$scope_root/$pkg" 2>/dev/null || return 1
    done

    for pkg in $desired; do
        [ -d "$scope_root/$pkg" ] || return 1
    done
    log "Scope dir sync complete (packages=$(printf '%s\n' "$desired" | wc -w | tr -d ' '))"
    return 0
}

ensure_lsposed_scope() {
    local lspd_config desired
    lspd_config="$(find_lspd_config)"
    if [ -z "$lspd_config" ]; then
        log "LSPosed config not found - skipping scope setup"
        SCOPE_SYNC_OK="false"
        SCOPE_SYNC_METHOD="none"
        return 1
    fi
    log "LSPosed config found at: $lspd_config"

    ensure_module_list_entry "$lspd_config"

    desired="$(build_desired_scope_packages)"
    if [ -z "$desired" ]; then
        log "WARNING: Desired scope set is empty"
        SCOPE_SYNC_OK="false"
        SCOPE_SYNC_METHOD="none"
        return 1
    fi
    log "Desired scope packages: $desired"

    if sync_scope_db "$lspd_config" "$desired"; then
        SCOPE_SYNC_OK="true"
        SCOPE_SYNC_METHOD="db"
        return 0
    fi

    if sync_scope_dirs "$lspd_config" "$desired"; then
        SCOPE_SYNC_OK="true"
        SCOPE_SYNC_METHOD="dir"
        return 0
    fi

    SCOPE_SYNC_OK="false"
    SCOPE_SYNC_METHOD="failed"
    log "WARNING: LSPosed scope reconciliation failed"
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
    if [ "$SCOPE_SYNC_OK" = "true" ]; then
        return 0
    fi

    local lspd_config
    lspd_config="$(find_lspd_config)"
    if [ -z "$lspd_config" ]; then
        return 1
    fi

    local desired
    desired="$(build_desired_scope_packages)"
    if [ -z "$desired" ]; then
        return 1
    fi

    local db="$lspd_config/modules_config.db"
    if [ -f "$db" ] && command -v sqlite3 >/dev/null 2>&1; then
        local mid scope_dump pkg
        mid="$(get_module_mid "$db")"
        if [ -n "$mid" ]; then
            scope_dump="$(sqlite3 "$db" ".dump scope" 2>/dev/null)"
            for pkg in $desired; do
                if ! printf '%s\n' "$scope_dump" | grep -q "INSERT INTO scope VALUES($mid,'$pkg',0);"; then
                    return 1
                fi
            done
            return 0
        fi
    fi

    local pkg
    for pkg in $desired; do
        if [ ! -d "$lspd_config/scope/$VIRTUCAM_PKG/$pkg" ]; then
            return 1
        fi
    done
    return 0
}

extract_line_timestamp_key() {
    printf '%s\n' "$1" | sed -n 's/^\[[[:space:]]*\([0-9][0-9-]*T[0-9:.]*\).*/\1/p' | head -n 1
}

get_latest_lspd_line() {
    local pattern="$1"
    local lines keyed
    lines="$(grep -h "$pattern" /data/adb/lspd/log/modules_*.log /data/adb/lspd/log.old/modules_*.log 2>/dev/null)"
    if [ -z "$lines" ]; then
        echo ""
        return
    fi
    keyed="$(printf '%s\n' "$lines" | sed -n 's/^\[[[:space:]]*\([0-9][0-9-]*T[0-9:.]*\).*$/\1|&/p')"
    if [ -z "$keyed" ]; then
        printf '%s\n' "$lines" | tail -n 1
        return
    fi
    printf '%s\n' "$keyed" | sort | tail -n 1 | cut -d'|' -f2-
}

parse_line_epoch_ms() {
    local line="$1"
    local iso iso_base sec busybox_bin
    iso="$(extract_line_timestamp_key "$line")"
    if [ -z "$iso" ]; then
        echo "0"
        return
    fi
    iso_base="$(printf '%s' "$iso" | cut -d'.' -f1)"
    busybox_bin="$(command -v busybox 2>/dev/null)"
    if [ -n "$busybox_bin" ] && [ -x "$busybox_bin" ]; then
        sec="$("$busybox_bin" date -D '%Y-%m-%dT%H:%M:%S' -d "$iso_base" +%s 2>/dev/null)"
        if [ -z "$sec" ]; then
            sec="$("$busybox_bin" date -d "$iso_base" +%s 2>/dev/null)"
        fi
    fi
    if [ -z "$sec" ]; then
        sec="$(date -d "$iso_base" +%s 2>/dev/null)"
    fi
    if [ -z "$sec" ]; then
        echo "0"
        return
    fi
    echo "$sec"
}

collect_runtime_observation() {
    local active_line mapping_line active_key mapping_key selected_line selected_key selected_source
    local now_s epoch_s age_s process_name stale_s

    RUNTIME_OBSERVED="false"
    RUNTIME_OBSERVED_PROCESS=""
    RUNTIME_OBSERVED_EPOCH_MS="0"
    RUNTIME_OBSERVED_AGE_MS="0"
    RUNTIME_OBSERVED_FRESH="false"
    RUNTIME_EVIDENCE_SOURCE="none"

    active_line="$(get_latest_lspd_line 'VirtuCam/XposedEntry: module active in process:')"
    mapping_line="$(get_latest_lspd_line 'VirtuCam/XposedEntry: createCaptureSession')"
    active_key="$(extract_line_timestamp_key "$active_line")"
    mapping_key="$(extract_line_timestamp_key "$mapping_line")"

    selected_line=""
    selected_key=""
    selected_source="none"
    if [ -n "$active_line" ] && [ -n "$mapping_line" ]; then
        if [ "$active_key" \> "$mapping_key" ]; then
            selected_line="$active_line"
            selected_key="$active_key"
            selected_source="module_active"
        else
            selected_line="$mapping_line"
            selected_key="$mapping_key"
            selected_source="mapping"
        fi
    elif [ -n "$active_line" ]; then
        selected_line="$active_line"
        selected_key="$active_key"
        selected_source="module_active"
    elif [ -n "$mapping_line" ]; then
        selected_line="$mapping_line"
        selected_key="$mapping_key"
        selected_source="mapping"
    fi

    if [ -z "$selected_line" ] || [ -z "$selected_key" ]; then
        return 1
    fi

    now_s="$(date '+%s')"
    epoch_s="$(parse_line_epoch_ms "$selected_line")"
    if [ "$epoch_s" -le 0 ] 2>/dev/null; then
        return 1
    fi

    age_s=$((now_s - epoch_s))
    if [ "$age_s" -lt 0 ] 2>/dev/null; then
        age_s=0
    fi

    process_name=""
    if [ "$selected_source" = "module_active" ]; then
        process_name="$(printf '%s\n' "$selected_line" | sed -n 's/.*module active in process:[[:space:]]*\([^[:space:]]\+\).*/\1/p' | head -n 1)"
    fi

    RUNTIME_OBSERVED="true"
    RUNTIME_OBSERVED_PROCESS="$process_name"
    RUNTIME_OBSERVED_EPOCH_MS="${epoch_s}000"
    RUNTIME_OBSERVED_AGE_MS="$((age_s * 1000))"
    RUNTIME_EVIDENCE_SOURCE="$selected_source"
    stale_s=$((RUNTIME_STALE_MS / 1000))

    if [ "$age_s" -le "$stale_s" ] 2>/dev/null; then
        RUNTIME_OBSERVED_FRESH="true"
    fi
    return 0
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
    local runtime_observed_process="${10}"
    local runtime_observed_epoch_ms="${11}"
    local runtime_observed_age_ms="${12}"
    local runtime_observed_fresh="${13}"
    local runtime_evidence_source="${14}"
    local now_ms
    now_ms="$(date '+%s000')"

    local escaped_error_code escaped_error_message escaped_active_mode escaped_effective_mode
    local escaped_observed_process escaped_evidence_source
    escaped_error_code="$(json_escape "$last_error_code")"
    escaped_error_message="$(json_escape "$last_error_message")"
    escaped_active_mode="$(json_escape "$active_source_mode")"
    escaped_effective_mode="$(json_escape "$source_mode_effective")"
    escaped_observed_process="$(json_escape "$runtime_observed_process")"
    escaped_evidence_source="$(json_escape "$runtime_evidence_source")"

    local payload
    payload="$(cat <<EOF
{"runtime_ready":$runtime_ready,"config_primary_readable":$config_primary_readable,"config_ipc_readable":$config_ipc_readable,"hook_last_read_ok":$hook_last_read_ok,"active_source_mode":"$escaped_active_mode","source_mode_effective":"$escaped_effective_mode","last_error_code":"$escaped_error_code","last_error_message":"$escaped_error_message","last_ok_epoch_ms":$last_ok_epoch_ms,"updated_epoch_ms":$now_ms,"runtime_observed_process":"$escaped_observed_process","runtime_observed_epoch_ms":$runtime_observed_epoch_ms,"runtime_observed_age_ms":$runtime_observed_age_ms,"runtime_observed_fresh":$runtime_observed_fresh,"runtime_evidence_source":"$escaped_evidence_source"}
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
    local runtime_observed_process=""
    local runtime_observed_epoch_ms="0"
    local runtime_observed_age_ms="0"
    local runtime_observed_fresh="false"
    local runtime_evidence_source="none"

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

    if collect_runtime_observation; then
        runtime_observed_process="$RUNTIME_OBSERVED_PROCESS"
        runtime_observed_epoch_ms="$RUNTIME_OBSERVED_EPOCH_MS"
        runtime_observed_age_ms="$RUNTIME_OBSERVED_AGE_MS"
        runtime_observed_fresh="$RUNTIME_OBSERVED_FRESH"
        runtime_evidence_source="$RUNTIME_EVIDENCE_SOURCE"
        if [ "$runtime_observed_fresh" = "true" ]; then
            runtime_state="runtime_observed"
        else
            runtime_state="runtime_stale"
            if [ -z "$last_error_code" ]; then
                last_error_code="runtime_stale"
                last_error_message="latest runtime evidence is stale"
            fi
        fi
    else
        if [ -z "$last_error_code" ]; then
            last_error_code="runtime_missing"
            last_error_message="no runtime evidence observed"
        fi
    fi

    if [ "$scope_state" = "scope_ok" ] && [ "$config_primary_readable" = "true" ] && [ "$hook_last_read_ok" = "true" ] && [ "$runtime_observed_fresh" = "true" ]; then
        runtime_ready="true"
    fi

    if [ "$scope_state" != "scope_ok" ]; then
        companion_state="scope_mismatch"
    elif [ "$config_primary_readable" != "true" ]; then
        companion_state="config_missing"
    elif [ "$hook_last_read_ok" != "true" ]; then
        companion_state="config_unreadable"
    elif [ "$runtime_ready" = "true" ]; then
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
        "$last_ok_epoch_ms" \
        "$runtime_observed_process" \
        "$runtime_observed_epoch_ms" \
        "$runtime_observed_age_ms" \
        "$runtime_observed_fresh" \
        "$runtime_evidence_source"

    local owner_uid
    owner_uid="${VIRTUCAM_UID:-}"
    if [ -z "$owner_uid" ]; then
        owner_uid="$(stat -c '%u' "$IPC_DIR/state/boot_time" 2>/dev/null)"
    fi
    if [ -n "$owner_uid" ]; then
        chown "$owner_uid:$owner_uid" \
            "$STATUS_FILE" "$CONFIG_STATE_FILE" "$MARKER_STATE_FILE" \
            "$MARKER_SOURCE_FILE" "$SCOPE_STATE_FILE" "$RUNTIME_STATE_FILE" "$COMPLETE_FILE" \
            "$RUNTIME_STATE_JSON" 2>/dev/null
    fi

    echo "[STATE] companion_status=$companion_state"
    echo "[STATE] config_primary_readable=$config_primary_readable"
    echo "[STATE] config_ipc_readable=$config_ipc_readable"
    echo "[STATE] hook_last_read_ok=$hook_last_read_ok"
    echo "[STATE] runtime_state=$runtime_state"
    echo "[STATE] runtime_observed_fresh=$runtime_observed_fresh"
    echo "[STATE] runtime_observed_age_ms=$runtime_observed_age_ms"
    echo "[STATE] runtime_observed_process=$runtime_observed_process"
    echo "[STATE] runtime_evidence_source=$runtime_evidence_source"
    echo "[STATE] runtime_ready=$runtime_ready"
    echo "[STATE] scope_sync_method=$SCOPE_SYNC_METHOD"
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

VIRTUCAM_UID="$(get_virtucam_uid)"

sync_persistent_and_ipc_config
if ensure_lsposed_scope; then
    echo "[OK] LSPosed scope sync complete via $SCOPE_SYNC_METHOD"
else
    echo "[WARN] LSPosed scope sync failed"
fi
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
