package com.briefplantrain.virtucam.util

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
    const val LOGS_DIR = "$IPC_ROOT/logs"

    // Config files
    const val CONFIG_XML = "$CONFIG_DIR/virtucam_config.xml"
    const val CONFIG_JSON = "$CONFIG_DIR/virtucam_config.json"

    // State files
    const val MODULE_ACTIVE = "$STATE_DIR/module_active"
    const val COMPANION_STATUS = "$STATE_DIR/companion_status"
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
        return File(MODULE_ACTIVE).exists()
    }

    @JvmStatic
    fun writeModuleActiveMarker() {
        try {
            val stateDir = File(STATE_DIR)
            if (!stateDir.exists()) {
                // Companion may not be installed or fully initialized yet.
                return
            }
            val marker = File(MODULE_ACTIVE)
            marker.writeText("active\n")
            marker.setLastModified(System.currentTimeMillis())
            marker.setReadable(true, false)
        } catch (_: Throwable) {
            // Never crash hooks if marker write fails.
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
