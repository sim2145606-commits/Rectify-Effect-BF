package com.briefplantrain.virtucam.util

import android.util.Log
import java.io.File

/**
 * Single source of truth for all IPC path constants and helper functions.
 * Used by:
 * - VirtuCamSettingsModule.kt (writes config)
 * - XposedEntry.java (reads/writes hook state)
 */
object VirtuCamIPC {

    // IPC directory tree managed by companion module
    const val IPC_ROOT = "/dev/virtucam_ipc"
    const val CONFIG_DIR = "$IPC_ROOT/config"
    const val STATE_DIR = "$IPC_ROOT/state"
    const val MEDIA_DIR = "$IPC_ROOT/media"
    const val LOGS_DIR = "$IPC_ROOT/logs"

    // Config files
    const val CONFIG_XML = "$CONFIG_DIR/virtucam_config.xml"
    const val CONFIG_JSON = "$CONFIG_DIR/virtucam_config.json"

    // State files
    const val MODULE_ACTIVE = "$STATE_DIR/module_active"
    const val COMPANION_STATUS = "$STATE_DIR/companion_status"
    const val CONFIG_STATUS = "$STATE_DIR/config_status"
    const val MARKER_STATUS = "$STATE_DIR/marker_status"
    const val MARKER_SOURCE = "$STATE_DIR/marker_source"
    const val SCOPE_STATUS = "$STATE_DIR/scope_status"
    const val RUNTIME_STATUS = "$STATE_DIR/runtime_status"
    const val SERVICE_COMPLETE_TIME = "$STATE_DIR/service_complete_time"
    const val BOOT_TIME = "$STATE_DIR/boot_time"

    // Persistent root-only fallback store
    const val PERSISTENT_ROOT = "/data/adb/virtucam"
    const val PERSISTENT_JSON = "$PERSISTENT_ROOT/virtucam_config.json"
    const val PERSISTENT_XML = "$PERSISTENT_ROOT/virtucam_config.xml"

    // Legacy paths (read-only compatibility)
    const val LEGACY_TMP_JSON = "/data/local/tmp/virtucam_config.json"
    const val LEGACY_TMP_ACTIVE = "/data/local/tmp/virtucam_module_active"

    fun isIpcReady(): Boolean {
        val statusFile = File(COMPANION_STATUS)
        return try {
            statusFile.exists() && statusFile.readText().trim() == "ready"
        } catch (_: Throwable) {
            false
        }
    }

    fun isModuleActive(): Boolean {
        return File(MODULE_ACTIVE).exists() || File(LEGACY_TMP_ACTIVE).exists()
    }

    @JvmStatic
    fun writeModuleActiveMarker() {
        var wroteIpc = false
        var wroteLegacy = false
        try {
            val stateDir = File(STATE_DIR)
            if (stateDir.exists()) {
                wroteIpc = writeMarkerFile(File(MODULE_ACTIVE))
            } else {
                Log.w("VirtuCamIPC", "IPC state dir not ready; skipping IPC marker write")
            }

            wroteLegacy = writeMarkerFile(File(LEGACY_TMP_ACTIVE))
        } catch (t: Throwable) {
            Log.w("VirtuCamIPC", "Unexpected marker write error: ${t.message}")
        }

        if (!wroteIpc && !wroteLegacy) {
            Log.w("VirtuCamIPC", "Failed to write module marker to IPC and legacy paths")
        }
    }

    private fun writeMarkerFile(file: File): Boolean {
        return try {
            val parent = file.parentFile
            if (parent != null && !parent.exists()) {
                parent.mkdirs()
            }
            file.writeText("active\n")
            file.setLastModified(System.currentTimeMillis())
            file.setReadable(true, false)
            true
        } catch (t: Throwable) {
            Log.w("VirtuCamIPC", "Failed marker write at ${file.path}: ${t.message}")
            false
        }
    }

    @JvmStatic
    fun readConfigJson(): String? {
        return try {
            val file = File(CONFIG_JSON)
            if (file.exists() && file.canRead()) file.readText() else null
        } catch (_: Throwable) {
            null
        }
    }
}
