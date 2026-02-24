package com.briefplantrain.virtucam

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Binder
import android.os.Build
import android.os.Process
import android.os.Environment
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.briefplantrain.virtucam.util.VirtuCamIPC
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.FileWriter
import java.io.InputStreamReader
import java.io.IOException
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.zip.ZipFile
import java.util.concurrent.TimeUnit

class VirtuCamSettingsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val prefs: SharedPreferences by lazy {
        reactContext.getSharedPreferences("virtucam_config", Context.MODE_PRIVATE)
    }
    private val writeConfigLock = Any()
    private val companionRefreshLock = Any()
    @Volatile private var companionRefreshInFlight = false
    @Volatile private var companionRefreshLastScheduledAt = 0L
    
    companion object {
        private val PACKAGE_NAME_REGEX = Regex("^[a-zA-Z0-9._]+$")
    }

    override fun getName(): String {
        if (BuildConfig.DEBUG) {
            android.util.Log.d("VirtuCamSettings", "Native module registered")
        }
        return "VirtuCamSettings"
    }

    /**
     * Write configuration to SharedPreferences (world-readable for Xposed module)
     */
    @ReactMethod
    fun writeConfig(config: ReadableMap, promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }
        try {
            var prefsCommitted = false
            var prefsEpochMatched = false
            var ipcJsonWritten = false
            var persistentFallbackWritten = false
            var errorCode: String? = null
            var warningCode: String? = null
            var resolvedPrefsPath: String? = null

            synchronized(writeConfigLock) {
                val editor = prefs.edit()
                val writeEpoch = System.currentTimeMillis()
                editor.putLong("_bridge_write_epoch", writeEpoch)

                if (config.hasKey("enabled")) {
                    editor.putBoolean("enabled", config.getBoolean("enabled"))
                }
                if (config.hasKey("mediaSourcePath")) {
                    editor.putString("mediaSourcePath", config.getString("mediaSourcePath"))
                }
                if (config.hasKey("cameraTarget")) {
                    editor.putString("cameraTarget", config.getString("cameraTarget"))
                }
                if (config.hasKey("mirrored")) {
                    editor.putBoolean("mirrored", config.getBoolean("mirrored"))
                }
                if (config.hasKey("rotation")) {
                    editor.putInt("rotation", config.getInt("rotation"))
                }
                if (config.hasKey("scaleX")) {
                    editor.putFloat("scaleX", config.getDouble("scaleX").toFloat())
                }
                if (config.hasKey("scaleY")) {
                    editor.putFloat("scaleY", config.getDouble("scaleY").toFloat())
                }
                if (config.hasKey("offsetX")) {
                    editor.putFloat("offsetX", config.getDouble("offsetX").toFloat())
                }
                if (config.hasKey("offsetY")) {
                    editor.putFloat("offsetY", config.getDouble("offsetY").toFloat())
                }
                if (config.hasKey("scaleMode")) {
                    editor.putString("scaleMode", config.getString("scaleMode"))
                }
                if (config.hasKey("targetMode")) {
                    editor.putString("targetMode", config.getString("targetMode"))
                }
                if (config.hasKey("sourceMode")) {
                    editor.putString("sourceMode", config.getString("sourceMode"))
                }
                if (config.hasKey("targetPackages")) {
                    val packages = config.getArray("targetPackages")
                    val packageList = mutableListOf<String>()
                    if (packages != null) {
                        for (i in 0 until packages.size()) {
                            val pkg = packages.getString(i)
                            if (!pkg.isNullOrBlank()) {
                                packageList.add(pkg)
                            }
                        }
                    }
                    editor.putString("targetPackages", packageList.joinToString(","))
                }

                prefsCommitted = editor.commit()
                val readbackEpoch = prefs.getLong("_bridge_write_epoch", -1L)
                prefsEpochMatched = prefsCommitted && readbackEpoch == writeEpoch
                resolvedPrefsPath = resolveSharedPrefsXmlPath()

                if (!prefsCommitted) {
                    errorCode = "PREFS_COMMIT_FALSE"
                }

                if (prefsCommitted) {
                    try {
                        if (!resolvedPrefsPath.isNullOrBlank()) {
                            val prefsFile = File(resolvedPrefsPath).canonicalFile
                            val prefsDir = prefsFile.parentFile
                            prefsFile.setReadable(true, false)
                            if (prefsDir != null) {
                                executeRootCommand("chmod 755 ${escapeShellArg(prefsDir.absolutePath)}")
                            }
                            executeRootCommand("chmod 644 ${escapeShellArg(prefsFile.absolutePath)}")
                        }
                    } catch (e: Exception) {
                        android.util.Log.w("VirtuCamSettings", "Could not normalize prefs readability: ${e.message}")
                    }
                }

                val serializedConfig = buildPersistedConfigJson().toString()

                try {
                    ipcJsonWritten = writeConfigJsonToIpc(serializedConfig)
                } catch (e: Exception) {
                    android.util.Log.w("VirtuCamSettings", "IPC config write failed: ${e.message}")
                    if (errorCode == null) errorCode = "IPC_WRITE_FAILED"
                }

                if (!ipcJsonWritten) {
                    try {
                        persistentFallbackWritten = writePersistentFallbackJson(serializedConfig)
                    } catch (e: Exception) {
                        android.util.Log.w("VirtuCamSettings", "Persistent fallback write failed: ${e.message}")
                        if (errorCode == null) errorCode = "PERSISTENT_FALLBACK_FAILED"
                    }
                }

                if ((ipcJsonWritten || persistentFallbackWritten) && !prefsCommitted) {
                    warningCode = "prefs_commit_unconfirmed"
                } else if ((ipcJsonWritten || persistentFallbackWritten) && prefsCommitted && !prefsEpochMatched) {
                    warningCode = "prefs_epoch_mismatch"
                }
            }

            if (!ipcJsonWritten && !persistentFallbackWritten) {
                promise.reject(
                    "CONFIG_SYNC_FAILED",
                    "Config write failed for IPC and persistent fallback"
                )
                return
            }

            val companionRefreshScheduled = scheduleCompanionRefresh()
            if (!companionRefreshScheduled && warningCode == null) {
                warningCode = "companion_refresh_deferred"
            }

            val result = Arguments.createMap()
            result.putBoolean("prefsWritten", prefsCommitted && prefsEpochMatched)
            result.putBoolean("prefsCommitted", prefsCommitted)
            result.putBoolean("prefsEpochMatched", prefsEpochMatched)
            result.putBoolean("ipcJsonWritten", ipcJsonWritten)
            result.putBoolean("persistentFallbackWritten", persistentFallbackWritten)
            result.putBoolean("companionRefreshScheduled", companionRefreshScheduled)
            result.putString("prefsPathResolved", resolvedPrefsPath ?: "")
            result.putString("warningCode", warningCode ?: "")
            result.putString("errorCode", errorCode ?: "")

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("WRITE_ERROR", "Failed to write config: ${e.message}", e)
        }
    }

    /**
     * Read configuration from SharedPreferences
     */
    @ReactMethod
    fun readConfig(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }
        try {
            val config = Arguments.createMap()
            config.putBoolean("enabled", prefs.getBoolean("enabled", false))
            
            val mediaSourcePath = prefs.getString("mediaSourcePath", null)
            if (mediaSourcePath != null) {
                config.putString("mediaSourcePath", mediaSourcePath)
            } else {
                config.putNull("mediaSourcePath")
            }
            
            config.putString("cameraTarget", prefs.getString("cameraTarget", "front"))
            config.putBoolean("mirrored", prefs.getBoolean("mirrored", false))
            config.putInt("rotation", prefs.getInt("rotation", 0))
            config.putDouble("scaleX", prefs.getFloat("scaleX", 1.0f).toDouble())
            config.putDouble("scaleY", prefs.getFloat("scaleY", 1.0f).toDouble())
            config.putDouble("offsetX", prefs.getFloat("offsetX", 0.0f).toDouble())
            config.putDouble("offsetY", prefs.getFloat("offsetY", 0.0f).toDouble())
            config.putString("scaleMode", prefs.getString("scaleMode", "fit"))
            config.putString("targetMode", prefs.getString("targetMode", "all"))
            config.putString("sourceMode", prefs.getString("sourceMode", "black"))
            config.putString("targetPackages", prefs.getString("targetPackages", ""))
            
            promise.resolve(config)
        } catch (e: Exception) {
            promise.reject("READ_ERROR", "Failed to read config: ${e.message}", e)
        }
    }

    /**
     * Get the path to the SharedPreferences file
     */
    @ReactMethod
    fun getConfigPath(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }
        try {
            promise.resolve(resolveSharedPrefsXmlPath())
        } catch (e: Exception) {
            promise.reject("PATH_ERROR", "Failed to get config path: ${e.message}", e)
        }
    }

    /**
     * Stage media to companion-managed IPC storage for cross-process readability.
     * Returns absolute staged path in /dev/virtucam_ipc/media.
     */
    @ReactMethod
    fun stageMediaForHook(sourcePath: String, promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }

        Thread {
            try {
                val raw = sourcePath.trim()
                if (raw.isEmpty()) {
                    promise.reject("INVALID_MEDIA_PATH", "Source path is empty")
                    return@Thread
                }

                val normalizedSource = normalizeFilePath(raw)
                val sourceFile = File(normalizedSource).canonicalFile
                if (!sourceFile.exists() || !sourceFile.isFile) {
                    promise.reject("MEDIA_NOT_FOUND", "Source media does not exist")
                    return@Thread
                }

                if (!isAllowedMediaExtension(sourceFile.name)) {
                    promise.reject("MEDIA_TYPE_NOT_ALLOWED", "Unsupported media extension")
                    return@Thread
                }

                val mediaDir = File(VirtuCamIPC.MEDIA_DIR)
                if (!mediaDir.exists() && !mediaDir.mkdirs()) {
                    promise.reject("IPC_MEDIA_DIR_UNAVAILABLE", "Could not create IPC media directory")
                    return@Thread
                }

                val safeBaseName = sanitizeFileName(sourceFile.nameWithoutExtension)
                val extension = sourceFile.extension.lowercase()
                val stagedFile = File(
                    mediaDir,
                    "staged_${System.currentTimeMillis()}_${safeBaseName}.${extension}"
                ).canonicalFile

                if (!stagedFile.path.startsWith(VirtuCamIPC.MEDIA_DIR)) {
                    promise.reject("INVALID_STAGE_PATH", "Invalid staging destination")
                    return@Thread
                }

                sourceFile.inputStream().use { input ->
                    stagedFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }

                stagedFile.setReadable(true, false)

                try {
                    val escapedMediaDir = escapeShellArg(VirtuCamIPC.MEDIA_DIR)
                    val escapedMediaFile = escapeShellArg(stagedFile.absolutePath)
                    executeRootCommand("chmod 0777 $escapedMediaDir")
                    executeRootCommand("chmod 0644 $escapedMediaFile")
                    executeRootCommand("chcon u:object_r:tmpfs:s0 $escapedMediaDir")
                    executeRootCommand("chcon u:object_r:tmpfs:s0 $escapedMediaFile")
                } catch (e: Exception) {
                    android.util.Log.w("VirtuCamSettings", "Failed to normalize staged media context: ${e.message}")
                }

                cleanupStagedMediaFiles(mediaDir)
                scheduleCompanionRefresh()

                if (reactApplicationContext.hasActiveCatalystInstance()) {
                    promise.resolve(stagedFile.absolutePath)
                }
            } catch (e: Exception) {
                if (reactApplicationContext.hasActiveCatalystInstance()) {
                    promise.reject("STAGE_MEDIA_ERROR", "Failed to stage media: ${e.message}", e)
                }
            }
        }.start()
    }

    /**
     * IPC diagnostics for bridge and staged media troubleshooting.
     */
    @ReactMethod
    fun getIpcStatus(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }

        try {
            val result = Arguments.createMap()

            val ipcRoot = File(VirtuCamIPC.IPC_ROOT)
            val configJson = File(VirtuCamIPC.CONFIG_JSON)
            val configXml = File(VirtuCamIPC.CONFIG_XML)
            val mediaDir = File(VirtuCamIPC.MEDIA_DIR)
            val markerFile = File(VirtuCamIPC.MODULE_ACTIVE)
            val legacyMarkerFile = File(VirtuCamIPC.LEGACY_TMP_ACTIVE)
            val companionStatus = File(VirtuCamIPC.COMPANION_STATUS)
            val configStatus = File(VirtuCamIPC.CONFIG_STATUS)
            val markerStatus = File(VirtuCamIPC.MARKER_STATUS)
            val runtimeStatus = File(VirtuCamIPC.RUNTIME_STATUS)
            val prefsPathResolved = resolveSharedPrefsXmlPath()

            val stagedPath = prefs.getString("mediaSourcePath", null)
            val stagedFile = if (!stagedPath.isNullOrBlank()) {
                try { File(normalizeFilePath(stagedPath)).canonicalFile } catch (_: Exception) { null }
            } else {
                null
            }

            result.putBoolean("ipcRootExists", ipcRoot.exists())
            result.putBoolean("configJsonExists", configJson.exists())
            result.putBoolean("configJsonReadable", configJson.exists() && configJson.canRead())
            result.putBoolean("configXmlExists", configXml.exists())
            result.putBoolean("configXmlReadable", configXml.exists() && configXml.canRead())
            result.putBoolean("mediaDirExists", mediaDir.exists())
            val markerExistsIpc = markerFile.exists()
            val markerExistsLegacy = legacyMarkerFile.exists()
            val markerSource = when {
                markerExistsIpc -> "ipc"
                markerExistsLegacy -> "legacy"
                else -> "none"
            }

            result.putBoolean("moduleMarkerExists", markerExistsIpc || markerExistsLegacy)
            result.putBoolean("moduleMarkerExistsIpc", markerExistsIpc)
            result.putBoolean("moduleMarkerExistsLegacy", markerExistsLegacy)
            result.putString("moduleMarkerSource", markerSource)
            val companionRead = safeReadStateFile(companionStatus)
            val configRead = safeReadStateFile(configStatus)
            val markerRead = safeReadStateFile(markerStatus)
            val runtimeRead = safeReadStateFile(runtimeStatus)
            val stateReadSource = when {
                listOf(companionRead, configRead, markerRead, runtimeRead).any { it.source == "app_read" } ->
                    "app_read"
                listOf(companionRead, configRead, markerRead, runtimeRead).any { it.source == "root_read" } ->
                    "root_read"
                else -> "unreadable"
            }

            result.putString("companionStatus", companionRead.value)
            result.putString("configStatus", configRead.value)
            result.putString("markerStatus", markerRead.value)
            result.putString("runtimeStatus", runtimeRead.value)
            result.putString("stateReadSource", stateReadSource)
            result.putString("companionVersion", readCompanionVersion())
            result.putString("stagedMediaPath", stagedPath ?: "")
            result.putBoolean("stagedMediaExists", stagedFile?.exists() == true)
            result.putBoolean("stagedMediaReadable", stagedFile?.canRead() == true)
            result.putBoolean(
                "stagedMediaHookReadable",
                !stagedPath.isNullOrBlank() && isHookReadableMediaPath(stagedPath)
            )
            result.putBoolean("configStaged", configJson.exists() && configJson.canRead())
            result.putString("prefsPathResolved", prefsPathResolved ?: "")

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("IPC_STATUS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun refreshCompanionNow(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }

        try {
            val refreshed = refreshCompanionInternal()
            val result = Arguments.createMap()
            result.putBoolean("refreshed", refreshed)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("COMPANION_REFRESH_ERROR", "Failed to refresh companion: ${e.message}", e)
        }
    }

    /**
     * Check if root access is available
     * PERFORMANCE FIX: Runs on background thread to avoid ANR
     */
    @ReactMethod
    fun checkRootAccess(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        Thread {
            try {
                val process = ProcessBuilder("su", "-c", "id").redirectErrorStream(true).start()
                val output: String
                BufferedReader(InputStreamReader(process.inputStream)).use { reader ->
                    output = reader.readText()
                }
                BufferedReader(InputStreamReader(process.errorStream)).use { it.readText() }
                val exitCode = process.waitFor()
                
                val result = Arguments.createMap()
                result.putBoolean("granted", exitCode == 0 && output.contains("uid=0"))
                result.putString("output", output)
                result.putInt("exitCode", exitCode)
                
                if (reactApplicationContext.hasActiveCatalystInstance()) {
                    promise.resolve(result)
                }
            } catch (e: Exception) {
                if (reactApplicationContext.hasActiveCatalystInstance()) {
                    val result = Arguments.createMap()
                    result.putBoolean("granted", false)
                    putErrorMessage(result, e)
                    promise.resolve(result)
                }
            }
        }.start()
    }

    /**
     * Detect which root solution is installed (Magisk, KernelSU, APatch)
     */
    @ReactMethod
    fun detectRootSolution(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }
        try {
            val result = Arguments.createMap()
            
            // Check for Magisk
            val magiskVersion = executeCommand("magisk -v")
            if (magiskVersion.isNotEmpty() && !magiskVersion.contains("not found")) {
                result.putString("solution", "Magisk")
                result.putString("version", magiskVersion.trim())
                promise.resolve(result)
                return
            }
            
            // Check for KernelSU
            val ksudFile = File("/data/adb/ksud")
            // Validate path and extension to prevent unsafe file access (CWE-434)
            val isValidKsudFile = ksudFile.canonicalPath == "/data/adb/ksud" &&
                                  ksudFile.name == "ksud" &&
                                  ksudFile.extension.isEmpty()
            
            if (!isValidKsudFile) {
                android.util.Log.w("VirtuCamSettings", "Invalid KernelSU path")
            } else if (ksudFile.exists()) {
                val ksuVersion = executeCommand("/data/adb/ksud -V")
                result.putString("solution", "KernelSU")
                result.putString("version", ksuVersion.trim())
                promise.resolve(result)
                return
            }
            
            // Check for APatch
            val apatchFile = File("/data/adb/apatch")
            // Validate path and extension to prevent unsafe file access (CWE-434)
            val isValidApatchFile = apatchFile.canonicalPath == "/data/adb/apatch" &&
                                    apatchFile.name == "apatch" &&
                                    apatchFile.extension.isEmpty()
            
            if (!isValidApatchFile) {
                android.util.Log.w("VirtuCamSettings", "Invalid APatch path")
            } else if (apatchFile.exists()) {
                result.putString("solution", "APatch")
                result.putString("version", "Detected")
                promise.resolve(result)
                return
            }
            
            result.putString("solution", "None")
            result.putString("version", "")
            promise.resolve(result)
        } catch (e: Exception) {
            val result = Arguments.createMap()
            result.putString("solution", "Unknown")
            putErrorMessage(result, e)
            promise.resolve(result)
        }
    }

    /**
     * Get comprehensive system information
     */
    @ReactMethod
    fun getSystemInfo(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }
        Thread {
            try {
                val info = Arguments.createMap()
                
                info.putString("manufacturer", Build.MANUFACTURER)
                info.putString("model", Build.MODEL)
                info.putString("brand", Build.BRAND)
                info.putString("product", Build.PRODUCT)
                info.putString("device", Build.DEVICE)
                info.putString("androidVersion", Build.VERSION.RELEASE)
                info.putInt("sdkLevel", Build.VERSION.SDK_INT)
                info.putString("buildNumber", Build.DISPLAY)
                info.putString("fingerprint", Build.FINGERPRINT)
                
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    info.putString("securityPatch", Build.VERSION.SECURITY_PATCH)
                }
                
                val kernelVersion = executeCommand("uname -r")
                info.putString("kernelVersion", kernelVersion.trim())
                
                val selinuxStatus = executeCommand("getenforce")
                info.putString("selinuxStatus", selinuxStatus.trim())
                
                info.putString("abiList", Build.SUPPORTED_ABIS.joinToString(", "))
                
                val externalStorage = Environment.getExternalStorageDirectory()
                val totalSpace = externalStorage.totalSpace / (1024 * 1024 * 1024)
                val freeSpace = externalStorage.freeSpace / (1024 * 1024 * 1024)
                info.putString("storage", "$freeSpace GB free / $totalSpace GB total")
                
                val runtime = Runtime.getRuntime()
                val maxMemory = runtime.maxMemory() / (1024 * 1024)
                info.putString("maxMemory", "$maxMemory MB")
                
                if (reactApplicationContext.hasActiveCatalystInstance()) {
                    promise.resolve(info)
                }
            } catch (e: Exception) {
                if (reactApplicationContext.hasActiveCatalystInstance()) {
                    promise.reject("SYSTEM_INFO_ERROR", "Failed to get system info: ${e.message}", e)
                }
            }
        }.start()
    }

    /**
     * Check if LSPosed/Xposed is installed and module is active
     * Improved detection for ReLSPosed and modern LSPosed forks
     *
     * IMPORTANT: The Class.forName("XposedBridge") check only works INSIDE a hooked process,
     * NOT inside VirtuCam's own process. Since VirtuCam hooks OTHER apps (not itself),
     * we rely on the marker file and LSPosed config checks instead.
     */
    @ReactMethod
    fun checkXposedStatus(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }
        try {
            val result = Arguments.createMap()
            val modulePackageName = reactApplicationContext.packageName
            
            // Check for LSPosed installation via multiple methods
            var lsposedExists = false
            var detectedPath = ""
            
            // Check common LSPosed directories (expanded for ReLSPosed and forks)
            val lsposedPaths = listOf(
                "/data/adb/lspd",
                "/data/adb/modules/zygisk_lsposed",
                "/data/adb/modules/riru_lsposed",
                "/data/adb/modules/lsposed",  // ReLSPosed and some forks
                "/data/adb/modules/zygisk-lsposed",
                "/data/adb/modules/riru-lsposed"
            )
            
            for (path in lsposedPaths) {
                // Validate path to prevent directory traversal (CWE-434)
                val file = File(path)
                if (!file.canonicalPath.startsWith("/data/adb/") || 
                    path.contains("..")) {
                    android.util.Log.w("VirtuCamSettings", "Invalid LSPosed path: $path")
                    continue
                }
                if (file.exists()) {
                    lsposedExists = true
                    detectedPath = path
                    break
                }
            }
            
            // Fallback: Check via root if direct access fails
            if (!lsposedExists) {
                val lsposedCheck = executeRootCommand(
                    "ls -d /data/adb/lspd /data/adb/modules/*lsposed* /data/adb/modules/*LSPosed* 2>/dev/null | head -1"
                )
                if (lsposedCheck.isNotEmpty() && !lsposedCheck.contains("No such file")) {
                    lsposedExists = true
                    detectedPath = lsposedCheck.trim()
                }
            }
            
            result.putBoolean("lsposedInstalled", lsposedExists)
            result.putString("lsposedPath", detectedPath)
            
            // Check if module is loaded/scoped - split these signals to avoid false positives
            var moduleLoaded = false
            var moduleScoped = false
            var detectionMethod = "none"
            var markerSource = "none"
            var scopeEvaluationReason = "no_scope_match"
            
            // Method 1: Check marker files (IPC primary + legacy fallback).
            if (hasMarkerFile(
                    VirtuCamIPC.MODULE_ACTIVE,
                    expectedPath = VirtuCamIPC.MODULE_ACTIVE,
                    expectedName = "module_active"
                )) {
                moduleLoaded = true
                markerSource = "marker_ipc"
                detectionMethod = "marker_ipc"
            } else if (hasMarkerViaRoot(VirtuCamIPC.MODULE_ACTIVE, "module_active")) {
                moduleLoaded = true
                markerSource = "marker_ipc_root"
                detectionMethod = "marker_ipc_root"
            } else if (hasMarkerFile(
                    VirtuCamIPC.LEGACY_TMP_ACTIVE,
                    expectedPath = VirtuCamIPC.LEGACY_TMP_ACTIVE,
                    expectedName = "virtucam_module_active"
                )) {
                moduleLoaded = true
                markerSource = "marker_legacy"
                detectionMethod = "marker_legacy"
            } else if (hasMarkerViaRoot(VirtuCamIPC.LEGACY_TMP_ACTIVE, "virtucam_module_active")) {
                moduleLoaded = true
                markerSource = "marker_legacy_root"
                detectionMethod = "marker_legacy_root"
            }
            
            // Read configured targets for scope checks (do not use module package here)
            val targetPackagesRaw = prefs.getString("targetPackages", "") ?: ""
            val configuredTargets = targetPackagesRaw
                .split(',')
                .map { sanitizePackageName(it.trim()) }
                .filter { it.isNotEmpty() }
                .distinct()

            // Method 2/3/4: Check LSPosed scope against configured target apps
            val scopedTargets = mutableListOf<String>()
            if (lsposedExists && configuredTargets.isNotEmpty()) {
                for (targetPkg in configuredTargets) {
                    if (checkLSPosedDatabase(targetPkg)) {
                        scopedTargets.add(targetPkg)
                        detectionMethod = "lspd_database"
                        continue
                    }
                    if (checkLSPosedScope(targetPkg)) {
                        scopedTargets.add(targetPkg)
                        detectionMethod = "lspd_scope"
                        continue
                    }
                    if (checkLSPosedPrefs(targetPkg)) {
                        scopedTargets.add(targetPkg)
                        detectionMethod = "lspd_prefs"
                    }
                }
            }

            moduleScoped = scopedTargets.isNotEmpty()
            if (moduleScoped) {
                scopeEvaluationReason = "configured_targets_scoped"
            }

            val runtimeObservation = getRuntimeHookObservation()
            val runtimeHookObserved = runtimeObservation.observed
            val runtimeObservedAt = runtimeObservation.epochMillis
            if (runtimeHookObserved && detectionMethod == "none") {
                detectionMethod = "runtime_log"
            }
            moduleLoaded = moduleLoaded || runtimeHookObserved
            val mappingFailureReason = getLatestMappingFailureReason()

            val enabled = prefs.getBoolean("enabled", false)
            val mediaSourcePath = prefs.getString("mediaSourcePath", null)
            val targetMode = prefs.getString("targetMode", "all") ?: "all"
            val sourceMode = prefs.getString("sourceMode", "black") ?: "black"
            val hasTargets = configuredTargets.isNotEmpty()

            if (!moduleScoped && targetMode != "whitelist" && lsposedExists) {
                // In non-whitelist mode, LSPosed scope is managed externally and app targets are optional.
                moduleScoped = true
                scopeEvaluationReason = "non_whitelist_mode"
            }

            if (!moduleScoped && targetMode == "whitelist") {
                scopeEvaluationReason = if (hasTargets) {
                    "whitelist_targets_not_in_scope"
                } else {
                    "whitelist_no_targets_configured"
                }
            }

            val broadScopeCandidates = listOf(
                "android",
                "system",
                "com.android.systemui",
                "com.android.phone"
            )
            val broadScopePackages = broadScopeCandidates.filter {
                hasScopedPackageForModule(modulePackageName, it)
            }
            val broadScopeDetected = broadScopePackages.isNotEmpty()

            val sourceConfigured = when (sourceMode) {
                "black", "test" -> true
                else -> !mediaSourcePath.isNullOrEmpty()
            }
            val sourceNeedsFile = sourceMode == "file" || sourceMode == "stream"
            val stagedMediaReady = if (!sourceNeedsFile) {
                true
            } else {
                !mediaSourcePath.isNullOrBlank() && isHookReadableMediaPath(mediaSourcePath)
            }
            val ipcConfigReady = try {
                (File(VirtuCamIPC.CONFIG_JSON).exists() && File(VirtuCamIPC.CONFIG_JSON).canRead()) ||
                    (File(VirtuCamIPC.CONFIG_XML).exists() && File(VirtuCamIPC.CONFIG_XML).canRead())
            } catch (_: Exception) {
                false
            }
            val hookConfigured = enabled && sourceConfigured &&
                (targetMode != "whitelist" || hasTargets)
            val hookReady =
                moduleLoaded &&
                moduleScoped &&
                hookConfigured &&
                ipcConfigReady &&
                stagedMediaReady &&
                runtimeHookObserved
            
            // Backward-compatible fields
            result.putBoolean("xposedActive", moduleLoaded)
            result.putBoolean("moduleActive", hookReady)
            // New detailed fields
            result.putBoolean("moduleLoaded", moduleLoaded)
            result.putBoolean("moduleScoped", moduleScoped)
            result.putBoolean("hookConfigured", hookConfigured)
            result.putBoolean("hookReady", hookReady)
            result.putBoolean("ipcConfigReady", ipcConfigReady)
            result.putBoolean("stagedMediaReady", stagedMediaReady)
            result.putBoolean("runtimeHookObserved", runtimeHookObserved)
            result.putBoolean("markerRequired", false)
            result.putDouble("runtimeObservedAt", runtimeObservedAt.toDouble())
            result.putString("mappingFailureReason", mappingFailureReason ?: "")
            result.putString("detectionMethod", detectionMethod)
            result.putString("markerSource", markerSource)
            result.putInt("configuredTargetsCount", configuredTargets.size)
            result.putInt("scopedTargetsCount", scopedTargets.size)
            result.putString("configuredTargets", configuredTargets.joinToString(","))
            result.putString("scopedTargets", scopedTargets.joinToString(","))
            result.putString("scopeEvaluationReason", scopeEvaluationReason)
            result.putBoolean("broadScopeDetected", broadScopeDetected)
            result.putString("broadScopePackages", broadScopePackages.joinToString(","))
            
            android.util.Log.d("VirtuCamSettings",
                "Detection results: moduleLoaded=$moduleLoaded, moduleScoped=$moduleScoped, " +
                "hookConfigured=$hookConfigured, hookReady=$hookReady, lsposedInstalled=$lsposedExists, " +
                "ipcConfigReady=$ipcConfigReady, stagedMediaReady=$stagedMediaReady, runtimeHookObserved=$runtimeHookObserved, " +
                "method=$detectionMethod, markerSource=$markerSource, path=$detectedPath, configuredTargets=$configuredTargets, scopedTargets=$scopedTargets, " +
                "broadScope=$broadScopePackages, runtimeObservedAt=$runtimeObservedAt, mappingFailureReason=${mappingFailureReason ?: "none"}")
            
            promise.resolve(result)
        } catch (e: Exception) {
            android.util.Log.e("VirtuCamSettings", "checkXposedStatus error: ${e.message}")
            val result = Arguments.createMap()
            result.putBoolean("xposedActive", false)
            result.putBoolean("lsposedInstalled", false)
            result.putBoolean("moduleActive", false)
            result.putBoolean("moduleLoaded", false)
            result.putBoolean("moduleScoped", false)
            result.putBoolean("hookConfigured", false)
            result.putBoolean("hookReady", false)
            result.putBoolean("ipcConfigReady", false)
            result.putBoolean("stagedMediaReady", false)
            result.putBoolean("runtimeHookObserved", false)
            result.putBoolean("markerRequired", false)
            result.putDouble("runtimeObservedAt", 0.0)
            result.putString("mappingFailureReason", "")
            result.putString("detectionMethod", "error")
            result.putString("markerSource", "none")
            result.putInt("configuredTargetsCount", 0)
            result.putInt("scopedTargetsCount", 0)
            result.putString("configuredTargets", "")
            result.putString("scopedTargets", "")
            result.putString("scopeEvaluationReason", "error")
            result.putBoolean("broadScopeDetected", false)
            result.putString("broadScopePackages", "")
            promise.resolve(result)
        }
    }

    @ReactMethod
    fun isOverlayEnabled(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        try {
            promise.resolve(prefs.getBoolean("overlayEnabled", false))
        } catch (e: Exception) {
            promise.reject("OVERLAY_STATE_ERROR", e.message, e)
        }
    }

    /**
     * Check LSPosed's SQLite database for module enabled state
     * Works with ReLSPosed and modern LSPosed forks
     */
    private fun hasScopedPackageForModule(modulePackageName: String, targetPackage: String): Boolean {
        val safeModule = sanitizePackageName(modulePackageName)
        val safeTarget = sanitizePackageName(targetPackage)
        if (safeModule.isEmpty() || safeTarget.isEmpty()) return false

        val escapedTarget = escapeShellArg(safeTarget)
        val checks = listOf(
            "ls /data/adb/lspd/config/scope/$safeModule/$safeTarget 2>/dev/null",
            "ls /data/adb/modules/zygisk_lsposed/config/scope/$safeModule/$safeTarget 2>/dev/null",
            "ls /data/adb/modules/riru_lsposed/config/scope/$safeModule/$safeTarget 2>/dev/null",
            "cat /data/adb/lspd/config/modules/$safeModule/scope.json 2>/dev/null | grep $escapedTarget",
            "cat /data/adb/modules/zygisk_lsposed/config/modules/$safeModule/scope.json 2>/dev/null | grep $escapedTarget",
            "cat /data/adb/modules/riru_lsposed/config/modules/$safeModule/scope.json 2>/dev/null | grep $escapedTarget"
        )

        for (command in checks) {
            val output = executeRootCommand(command)
            if (output.isNotEmpty() &&
                !output.contains("No such file") &&
                !output.contains("cannot access")
            ) {
                return true
            }
        }

        return false
    }

    private fun checkLSPosedDatabase(packageName: String): Boolean {
        val escapedPkg = escapeShellArg(packageName)
        
        // LSPosed stores module info in SQLite databases
        val dbPaths = listOf(
            "/data/adb/lspd/config/modules_config.db",
            "/data/adb/lspd/db/lspd.db",
            "/data/adb/lspd/config/lspd.db",
            "/data/adb/modules/zygisk_lsposed/config/modules_config.db",
            "/data/adb/modules/zygisk_lsposed/config/lspd.db"
        )
        
        for (dbPath in dbPaths) {
            val query = executeRootCommand(
                "sqlite3 $dbPath \"SELECT enabled FROM modules WHERE module_pkg_name=$escapedPkg\" 2>/dev/null"
            )
            if (query.trim() == "1" || query.trim().lowercase() == "true") {
                return true
            }
            
            // Also check with different column names used by some forks
            val altQuery = executeRootCommand(
                "sqlite3 $dbPath \"SELECT * FROM modules WHERE pkgName=$escapedPkg OR package_name=$escapedPkg\" 2>/dev/null"
            )
            if (altQuery.isNotEmpty() && !altQuery.contains("Error") && !altQuery.contains("no such")) {
                return true
            }
            
        }
        
        return false
    }

    /**
     * Check LSPosed scope configuration for module
     */
    private fun checkLSPosedScope(packageName: String): Boolean {
        val escapedPkg = escapeShellArg(packageName)

        val scopeChecks = listOf(
            "ls /data/adb/lspd/config/$packageName 2>/dev/null",
            "ls /data/adb/lspd/config/scope/$packageName 2>/dev/null",
            "cat /data/adb/lspd/config/modules/$packageName/scope.json 2>/dev/null",
            "grep -r $escapedPkg /data/adb/lspd/config/scope/ 2>/dev/null | head -1",
            "ls /data/adb/modules/zygisk_lsposed/config/$packageName 2>/dev/null",
            "ls /data/adb/modules/zygisk_lsposed/config/scope/$packageName 2>/dev/null",
            "cat /data/adb/modules/zygisk_lsposed/config/modules/$packageName/scope.json 2>/dev/null",
            "grep -r $escapedPkg /data/adb/modules/zygisk_lsposed/config/scope/ 2>/dev/null | head -1"
        )

        for (command in scopeChecks) {
            val scopeCheck = executeRootCommand(command)
            if (scopeCheck.isNotEmpty() &&
                !scopeCheck.contains("No such file") &&
                !scopeCheck.contains("cannot access")
            ) {
                return true
            }
        }

        return false
    }

    /**
     * Check LSPosed prefs database (used by ReLSPosed and some forks)
     */
    private fun checkLSPosedPrefs(packageName: String): Boolean {
        val escapedPkg = escapeShellArg(packageName)

        val prefsChecks = listOf(
            "sqlite3 /data/adb/lspd/config/prefs.db \"SELECT value FROM prefs WHERE key LIKE '%$packageName%'\" 2>/dev/null",
            "cat /data/adb/lspd/config/enabled_modules 2>/dev/null | grep $escapedPkg",
            "cat /data/adb/lspd/config/modules.json 2>/dev/null | grep $escapedPkg",
            "sqlite3 /data/adb/modules/zygisk_lsposed/config/prefs.db \"SELECT value FROM prefs WHERE key LIKE '%$packageName%'\" 2>/dev/null",
            "cat /data/adb/modules/zygisk_lsposed/config/enabled_modules 2>/dev/null | grep $escapedPkg",
            "cat /data/adb/modules/zygisk_lsposed/config/modules.json 2>/dev/null | grep $escapedPkg"
        )

        for (command in prefsChecks) {
            val prefsCheck = executeRootCommand(command)
            if (prefsCheck.isNotEmpty() &&
                !prefsCheck.contains("Error") &&
                !prefsCheck.contains("no such")
            ) {
                return true
            }
        }

        return false
    }

    /**
     * Check if module exists in LSPosed's modules directory or is registered
     */
    private fun checkModulesDirectory(packageName: String): Boolean {
        val moduleCheck = executeRootCommand("pm path $packageName 2>/dev/null")
        
        if (moduleCheck.isEmpty()) {
            return false
        }
        
        val apkPath = moduleCheck.replace("package:", "").trim()
        if (!apkHasXposedInit(apkPath)) {
            return false
        }

        // Modern LSPosed forks can hide/relocate granular config entries behind SELinux.
        // If LSPosed base path exists and APK is a valid Xposed module, treat as registered.
        val lsposedBaseExists = executeRootCommand(
            "ls -d /data/adb/lspd /data/adb/modules/zygisk_lsposed /data/adb/modules/riru_lsposed 2>/dev/null | head -1"
        )
        if (lsposedBaseExists.isNotEmpty()) return true
        
        val lspdConfigCheck = executeRootCommand("ls /data/adb/lspd/config/ 2>/dev/null | grep '$packageName'")
        if (lspdConfigCheck.contains(packageName)) return true

        val relsposedConfigCheck = executeRootCommand("ls /data/adb/modules/zygisk_lsposed/config/ 2>/dev/null | grep '$packageName'")
        if (relsposedConfigCheck.contains(packageName)) return true

        val findLspdCheck = executeRootCommand("find /data/adb/lspd/ -name '*$packageName*' -type f 2>/dev/null | head -1")
        if (findLspdCheck.isNotEmpty()) return true

        val findReLsposedCheck = executeRootCommand("find /data/adb/modules/zygisk_lsposed/ -name '*$packageName*' -type f 2>/dev/null | head -1")
        return findReLsposedCheck.isNotEmpty()
    }

    private fun apkHasXposedInit(apkPath: String): Boolean {
        return try {
            val apkFile = File(apkPath).canonicalFile
            if (!apkFile.exists() || !apkFile.isFile || apkFile.extension.lowercase() != "apk") {
                android.util.Log.w("VirtuCamSettings", "Rejected invalid APK path: $apkPath")
                return false
            }
            ZipFile(apkFile).use { zip ->
                zip.getEntry("assets/xposed_init") != null
            }
        } catch (e: IOException) {
            android.util.Log.w("VirtuCamSettings", "I/O error while inspecting APK: ${e.message}", e)
            false
        } catch (e: SecurityException) {
            android.util.Log.w("VirtuCamSettings", "Security error while inspecting APK: ${e.message}", e)
            false
        }
    }

    /**
     * Check storage permission (READ_EXTERNAL_STORAGE or granular media permissions)
     * On Android 11+, checks MANAGE_EXTERNAL_STORAGE via isExternalStorageManager()
     * On Android 13+, also considers granular media permissions
     */
    @ReactMethod
    fun checkStoragePermission(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }
        try {
            val granted = when {
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.R -> {
                    // Android 11+: Check MANAGE_EXTERNAL_STORAGE
                    Environment.isExternalStorageManager()
                }
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M -> {
                    // Android 6-10: Check READ_EXTERNAL_STORAGE
                    val permission = android.Manifest.permission.READ_EXTERNAL_STORAGE
                    ContextCompat.checkSelfPermission(
                        reactApplicationContext,
                        permission
                    ) == android.content.pm.PackageManager.PERMISSION_GRANTED
                }
                else -> true
            }
            promise.resolve(granted)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Check if MANAGE_EXTERNAL_STORAGE permission is granted
     */
    @ReactMethod
    fun checkAllFilesAccess(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }
        try {
            val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Environment.isExternalStorageManager()
            } else {
                // On older Android versions, this permission doesn't exist
                true
            }
            promise.resolve(granted)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun checkOverlayPermission(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        try {
            val granted = Settings.canDrawOverlays(reactApplicationContext)
            promise.resolve(granted)
        } catch (e: Exception) {
            promise.reject("OVERLAY_CHECK_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                android.net.Uri.parse("package:${reactApplicationContext.packageName}")
            ).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("OVERLAY_REQUEST_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun startFloatingOverlay(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        try {
            if (!Settings.canDrawOverlays(reactApplicationContext)) {
                promise.reject("NO_PERMISSION", "Overlay permission not granted")
                return
            }
            // Persist that overlay was intentionally started
            reactApplicationContext
                .getSharedPreferences("virtucam_config", Context.MODE_PRIVATE)
                .edit().putBoolean("overlayEnabled", true).apply()

            val intent = Intent(reactApplicationContext, FloatingOverlayService::class.java).apply {
                `package` = reactApplicationContext.packageName
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_OVERLAY_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopFloatingOverlay(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        try {
            reactApplicationContext
                .getSharedPreferences("virtucam_config", Context.MODE_PRIVATE)
                .edit().putBoolean("overlayEnabled", false).apply()

            val intent = Intent(reactApplicationContext, FloatingOverlayService::class.java)
            reactApplicationContext.stopService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_OVERLAY_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isOverlayRunning(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        promise.resolve(FloatingOverlayService.isServiceRunning())
    }

    /**
     * Verify config file is readable by other processes (for Xposed module)
     */
    @ReactMethod
    fun verifyConfigReadable(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }
        Thread {
            try {
                val resolvedPath = resolveSharedPrefsXmlPath() ?: ""
                val prefsFile = if (resolvedPath.isNotBlank()) {
                    File(resolvedPath)
                } else {
                    File(reactApplicationContext.applicationInfo.dataDir, "shared_prefs/virtucam_config.xml")
                }
                val rootReadable = if (resolvedPath.isNotBlank()) {
                    executeRootCommand("ls -l ${escapeShellArg(resolvedPath)} 2>/dev/null").isNotBlank()
                } else {
                    false
                }
                
                val result = Arguments.createMap()
                result.putBoolean("exists", prefsFile.exists())
                result.putBoolean("readable", prefsFile.canRead() || rootReadable)
                result.putBoolean("rootReadable", rootReadable)
                result.putString("path", prefsFile.absolutePath)
                
                val permissions = executeCommand("ls -l ${escapeShellArg(prefsFile.absolutePath)}")
                result.putString("permissions", permissions.trim())
                
                if (reactApplicationContext.hasActiveCatalystInstance()) {
                    promise.resolve(result)
                }
            } catch (e: Exception) {
                if (reactApplicationContext.hasActiveCatalystInstance()) {
                    promise.reject("VERIFY_ERROR", "Failed to verify config: ${e.message}", e)
                }
            }
        }.start()
    }

    /**
     * Get Xposed/LSPosed logs related to VirtuCam
     */
    @ReactMethod
    fun getXposedLogs(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }
        try {
            val result = Arguments.createMap()

            val modulesLogs = executeRootCommand(
                "grep -h 'VirtuCam/XposedEntry:' /data/adb/lspd/log/modules_*.log /data/adb/lspd/log.old/modules_*.log 2>/dev/null | tail -n 800"
            )
            val source: String
            val logs: String
            if (modulesLogs.isNotBlank()) {
                source = "lsposed_modules"
                logs = modulesLogs
            } else {
                source = "logcat"
                logs = executeCommand("logcat -d -s VirtuCam:* Xposed:* LSPosed:* | tail -n 500")
            }

            result.putString("source", source)
            result.putString("logs", logs)
            result.putBoolean("success", logs.isNotEmpty())
            
            promise.resolve(result)
        } catch (e: Exception) {
            val result = Arguments.createMap()
            result.putString("source", "unknown")
            result.putString("logs", "")
            result.putBoolean("success", false)
            putErrorMessage(result, e)
            promise.resolve(result)
        }
    }

    /**
     * Get system logcat (last 1000 lines)
     */
    @ReactMethod
    fun getSystemLogs(lineCount: Int, promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }
        try {
            val count = if (lineCount > 0) lineCount else 1000
            val logcatCommand = "logcat -d | tail -n $count"
            val logs = executeCommand(logcatCommand)
            
            val result = Arguments.createMap()
            result.putString("logs", logs)
            result.putBoolean("success", logs.isNotEmpty())
            
            promise.resolve(result)
        } catch (e: Exception) {
            val result = Arguments.createMap()
            result.putString("logs", "")
            result.putBoolean("success", false)
            putErrorMessage(result, e)
            promise.resolve(result)
        }
    }

    /**
     * Clear logcat buffer
     */
    @ReactMethod
    fun clearSystemLogs(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }
        try {
            executeCommand("logcat -c")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Get detailed LSPosed diagnostic information for troubleshooting
     */
    @ReactMethod
    fun getLSPosedDiagnostics(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }
        Thread {
            try {
                val result = Arguments.createMap()
                val packageName = sanitizePackageName(reactApplicationContext.packageName)
                val escapedPackageName = escapeShellArg(packageName)
                
                val variants = buildString {
                    if (executeRootCommand("ls -d /data/adb/lspd 2>/dev/null").isNotEmpty()) append("standard\n")
                    if (executeRootCommand("ls -d /data/adb/modules/zygisk_lsposed 2>/dev/null").isNotEmpty()) append("zygisk\n")
                    if (executeRootCommand("ls -d /data/adb/modules/riru_lsposed 2>/dev/null").isNotEmpty()) append("riru\n")
                    if (executeRootCommand("ls -d /data/adb/modules/lsposed 2>/dev/null").isNotEmpty()) append("generic\n")
                }
                result.putString("lsposedVariants", variants.trim())
                
                var moduleListCheck = executeRootCommand("grep $escapedPackageName /data/adb/lspd/config/modules.list 2>/dev/null")
                if (moduleListCheck.isEmpty()) moduleListCheck = executeRootCommand("grep $escapedPackageName /data/adb/modules/zygisk_lsposed/config/modules.list 2>/dev/null")
                if (moduleListCheck.isEmpty()) moduleListCheck = executeRootCommand("grep $escapedPackageName /data/adb/modules/riru_lsposed/config/modules.list 2>/dev/null")
                if (moduleListCheck.isEmpty()) moduleListCheck = "not_in_list"
                result.putString("moduleListStatus", moduleListCheck.trim())
                
                var scopeCheck = executeRootCommand("ls -la /data/adb/lspd/config/scope/$escapedPackageName 2>/dev/null")
                if (scopeCheck.isEmpty()) scopeCheck = executeRootCommand("ls -la /data/adb/modules/zygisk_lsposed/config/scope/$escapedPackageName 2>/dev/null")
                if (scopeCheck.isEmpty()) scopeCheck = executeRootCommand("ls -la /data/adb/modules/riru_lsposed/config/scope/$escapedPackageName 2>/dev/null")
                if (scopeCheck.isEmpty()) scopeCheck = "no_scope_dir"
                result.putString("scopeConfiguration", scopeCheck.trim())
                
                // Check marker file
                val markerFile = File(VirtuCamIPC.MODULE_ACTIVE)
                // Validate file path, name, and extension to prevent unsafe file access (CWE-434)
                val expectedPath = VirtuCamIPC.MODULE_ACTIVE
                val isValidMarkerFile = markerFile.canonicalPath == expectedPath &&
                                        markerFile.name == "module_active" &&
                                        markerFile.extension.isEmpty()
                
                if (!isValidMarkerFile) {
                    result.putString("markerFileAge", "invalid path")
                    result.putBoolean("markerFileExists", false)
                } else if (markerFile.exists()) {
                    val age = (System.currentTimeMillis() - markerFile.lastModified()) / 1000
                    result.putString("markerFileAge", "${age}s ago")
                    result.putBoolean("markerFileExists", true)
                } else {
                    result.putString("markerFileAge", "not found")
                    result.putBoolean("markerFileExists", false)
                }
                
                val xposedInitCheck = executeCommand("unzip -l ${escapeShellArg(reactApplicationContext.applicationInfo.sourceDir)} | grep xposed_init")
                result.putBoolean("hasXposedInit", xposedInitCheck.contains("xposed_init"))
                
                if (reactApplicationContext.hasActiveCatalystInstance()) {
                    promise.resolve(result)
                }
            } catch (e: Exception) {
                if (reactApplicationContext.hasActiveCatalystInstance()) {
                    val result = Arguments.createMap()
                    putErrorMessage(result, e)
                    promise.resolve(result)
                }
            }
        }.start()
    }

    /**
     * Filter a list of package names to only those that are installed on the device
     * Used to show only installed apps in the target list (no false positives)
     */
    @ReactMethod
    fun getInstalledPackages(packageNames: ReadableArray, promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }
        try {
            val pm = reactApplicationContext.packageManager
            val result = Arguments.createArray()
            
            for (i in 0 until packageNames.size()) {
                val pkgName = packageNames.getString(i)
                try {
                    pm.getPackageInfo(pkgName, 0)
                    result.pushString(pkgName)
                } catch (e: android.content.pm.PackageManager.NameNotFoundException) {
                    // Not installed, skip
                }
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("PKG_ERROR", e.message, e)
        }
    }

    /**
     * Get all user-installed apps on the device (for "Add App" feature)
     * Returns list of {packageName, name} objects
     */
    @ReactMethod
    fun getAllInstalledApps(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }
        try {
            val pm = reactApplicationContext.packageManager
            val apps = pm.getInstalledApplications(android.content.pm.PackageManager.GET_META_DATA)
            val result = Arguments.createArray()
            
            for (app in apps) {
                // Only include user-installed apps (not system apps)
                if (app.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM == 0) {
                    val appMap = Arguments.createMap()
                    appMap.putString("packageName", app.packageName)
                    appMap.putString("name", pm.getApplicationLabel(app).toString())
                    result.pushMap(appMap)
                }
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("SCAN_ERROR", e.message, e)
        }
    }

    /**
     * Resolve package metadata for manual target-app entry flow.
     * Supports system-app validation without changing getAllInstalledApps behavior.
     */
    @ReactMethod
    fun resolvePackageMetadata(rawPackageName: String, promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }

        val packageName = rawPackageName.trim()
        if (!isValidPackageName(packageName)) {
            promise.reject("INVALID_PACKAGE", "Package name must match [a-zA-Z0-9._]+")
            return
        }

        try {
            val pm = reactApplicationContext.packageManager
            val result = Arguments.createMap()
            result.putString("packageName", packageName)

            try {
                val appInfo = pm.getApplicationInfo(packageName, 0)
                val label = pm.getApplicationLabel(appInfo).toString()
                val isSystemApp = (appInfo.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0 ||
                    (appInfo.flags and android.content.pm.ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0

                result.putBoolean("installed", true)
                result.putBoolean("systemApp", isSystemApp)
                result.putString("name", label)
            } catch (_: android.content.pm.PackageManager.NameNotFoundException) {
                result.putBoolean("installed", false)
                result.putBoolean("systemApp", false)
                result.putString("name", packageName)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("PACKAGE_LOOKUP_ERROR", e.message, e)
        }
    }

    /**
     * Detect which manager app to use for LSPosed configuration
     * Returns package name of the appropriate manager app
     */
    @ReactMethod
    fun detectLSPosedManager(promise: Promise) {
        if (!assertAuthenticated(promise)) return
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }
        try {
            val result = Arguments.createMap()
            val pm = reactApplicationContext.packageManager
            
            // List of possible LSPosed Manager package names
            val lsposedPackages = listOf(
                "org.lsposed.manager",
                "io.github.lsposed.manager",
                "org.lsposed.manager.parasitic"
            )
            
            // Check for LSPosed Manager (standalone)
            for (pkg in lsposedPackages) {
                try {
                    pm.getPackageInfo(pkg, 0)
                    result.putString("managerType", "lsposed")
                    result.putString("packageName", pkg)
                    result.putBoolean("isParasitic", false)
                    promise.resolve(result)
                    return
                } catch (e: Exception) {
                    // Continue checking
                }
            }
            
            // Check for KernelSU (which may host parasitic LSPosed)
            val kernelSUPackages = listOf(
                "me.weishu.kernelsu",
                "com.topjohnwu.magisk"  // Magisk can also host LSPosed
            )
            
            for (pkg in kernelSUPackages) {
                try {
                    pm.getPackageInfo(pkg, 0)
                    result.putString("managerType", if (pkg.contains("kernelsu")) "kernelsu" else "magisk")
                    result.putString("packageName", pkg)
                    result.putBoolean("isParasitic", true)
                    promise.resolve(result)
                    return
                } catch (e: Exception) {
                    // Continue checking
                }
            }
            
            // No manager found - LSPosed might be parasitic without a known host
            result.putString("managerType", "unknown")
            result.putNull("packageName")
            result.putBoolean("isParasitic", true)
            promise.resolve(result)
        } catch (e: Exception) {
            val result = Arguments.createMap()
            result.putString("managerType", "unknown")
            putErrorMessage(result, e)
            promise.resolve(result)
        }
    }

    private fun buildPersistedConfigJson(): JSONObject {
        val obj = JSONObject()
        obj.put("enabled", prefs.getBoolean("enabled", false))
        obj.put("mediaSourcePath", prefs.getString("mediaSourcePath", null))
        obj.put("cameraTarget", prefs.getString("cameraTarget", "front"))
        obj.put("mirrored", prefs.getBoolean("mirrored", false))
        obj.put("rotation", prefs.getInt("rotation", 0))
        obj.put("scaleX", prefs.getFloat("scaleX", 1.0f).toDouble())
        obj.put("scaleY", prefs.getFloat("scaleY", 1.0f).toDouble())
        obj.put("offsetX", prefs.getFloat("offsetX", 0.0f).toDouble())
        obj.put("offsetY", prefs.getFloat("offsetY", 0.0f).toDouble())
        obj.put("scaleMode", prefs.getString("scaleMode", "fit"))
        obj.put("targetMode", prefs.getString("targetMode", "all"))
        obj.put("sourceMode", prefs.getString("sourceMode", "black"))
        obj.put("targetPackages", prefs.getString("targetPackages", ""))
        return obj
    }

    private fun writeConfigJsonToIpc(serializedConfig: String): Boolean {
        val fallbackFile = File(VirtuCamIPC.CONFIG_JSON).canonicalFile
        val ipcConfigDir = File(VirtuCamIPC.CONFIG_DIR).canonicalFile

        if (!ipcConfigDir.exists() && !ipcConfigDir.mkdirs()) {
            throw IllegalStateException("IPC config dir unavailable")
        }
        if (!ipcConfigDir.path.startsWith(VirtuCamIPC.IPC_ROOT)) {
            throw SecurityException("Invalid IPC directory path")
        }
        if (fallbackFile.canonicalPath != VirtuCamIPC.CONFIG_JSON) {
            throw SecurityException("Invalid IPC config file path")
        }

        FileWriter(fallbackFile).use { writer ->
            writer.write(serializedConfig)
        }
        fallbackFile.setReadable(true, false)

        val escapedConfigDir = escapeShellArg(VirtuCamIPC.CONFIG_DIR)
        val escapedConfigFile = escapeShellArg(fallbackFile.absolutePath)
        executeRootCommand("chmod 0777 $escapedConfigDir")
        executeRootCommand("chmod 0644 $escapedConfigFile")
        executeRootCommand("chcon u:object_r:tmpfs:s0 $escapedConfigDir")
        executeRootCommand("chcon u:object_r:tmpfs:s0 $escapedConfigFile")

        return fallbackFile.exists() && fallbackFile.canRead()
    }

    private fun writePersistentFallbackJson(serializedConfig: String): Boolean {
        val tmpFile = File(
            reactApplicationContext.cacheDir,
            "virtucam_config_fallback_${System.currentTimeMillis()}.json"
        )
        FileWriter(tmpFile).use { writer ->
            writer.write(serializedConfig)
        }
        tmpFile.setReadable(true, false)

        val escapedTmp = escapeShellArg(tmpFile.absolutePath)
        val escapedPersistentDir = escapeShellArg(VirtuCamIPC.PERSISTENT_ROOT)
        val escapedPersistentJson = escapeShellArg(VirtuCamIPC.PERSISTENT_JSON)
        executeRootCommand("mkdir -p $escapedPersistentDir")
        executeRootCommand("cp $escapedTmp $escapedPersistentJson")
        executeRootCommand("chmod 0600 $escapedPersistentJson")
        executeRootCommand("chcon u:object_r:adb_data_file:s0 $escapedPersistentJson")
        executeRootCommand("rm -f $escapedTmp")

        val verifyOutput = executeRootCommand("ls $escapedPersistentJson 2>/dev/null")
        return verifyOutput.contains("virtucam_config.json")
    }

    private fun scheduleCompanionRefresh(): Boolean {
        synchronized(companionRefreshLock) {
            val now = System.currentTimeMillis()
            if (companionRefreshInFlight) {
                return false
            }
            if (now - companionRefreshLastScheduledAt < 600L) {
                return false
            }
            companionRefreshInFlight = true
            companionRefreshLastScheduledAt = now
        }

        Thread {
            try {
                refreshCompanionInternal()
            } catch (e: Exception) {
                android.util.Log.w("VirtuCamSettings", "Async companion refresh failed: ${e.message}")
            } finally {
                synchronized(companionRefreshLock) {
                    companionRefreshInFlight = false
                    companionRefreshLastScheduledAt = System.currentTimeMillis()
                }
            }
        }.start()

        return true
    }

    private fun refreshCompanionInternal(): Boolean {
        val actionScript = "/data/adb/modules/virtucam_companion/action.sh"
        val escapedAction = escapeShellArg(actionScript)
        val scriptExists = executeRootCommand("ls $escapedAction 2>/dev/null")
        if (!scriptExists.contains("action.sh")) {
            return false
        }
        val exitCode = executeRootScript(actionScript, timeoutSeconds = 20)
        if (exitCode != 0) {
            android.util.Log.w("VirtuCamSettings", "Companion action script exited with code $exitCode")
            return false
        }
        val statusOutput = safeReadStateFile(File(VirtuCamIPC.COMPANION_STATUS))
        if (statusOutput.value.isBlank()) {
            android.util.Log.w(
                "VirtuCamSettings",
                "Companion action executed but status file is unreadable in app context"
            )
        }
        return true
    }

    private fun executeRootScript(scriptPath: String, timeoutSeconds: Long = 15L): Int {
        return try {
            val escapedScript = escapeShellArg(scriptPath)
            val process = ProcessBuilder("su", "-c", "sh $escapedScript")
                .redirectErrorStream(true)
                .start()
            if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                process.destroyForcibly()
                return -1
            }
            process.exitValue()
        } catch (e: IOException) {
            android.util.Log.w("VirtuCamSettings", "Root script I/O error: ${e.message}", e)
            -1
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            android.util.Log.w("VirtuCamSettings", "Root script interrupted", e)
            -1
        }
    }

    private fun cleanupStagedMediaFiles(mediaDir: File) {
        try {
            val files = mediaDir.listFiles()?.filter { it.isFile } ?: return
            if (files.isEmpty()) return

            val now = System.currentTimeMillis()
            val maxKeep = 16
            val maxAgeMs = 2L * 24L * 60L * 60L * 1000L
            val sorted = files.sortedByDescending { it.lastModified() }

            sorted.forEachIndexed { index, file ->
                val tooOld = (now - file.lastModified()) > maxAgeMs
                val overLimit = index >= maxKeep
                if (tooOld || overLimit) {
                    runCatching { file.delete() }
                }
            }
        } catch (e: Exception) {
            android.util.Log.w("VirtuCamSettings", "Failed staged media cleanup: ${e.message}")
        }
    }

    private data class StateFileRead(
        val value: String,
        val source: String
    )

    private fun safeReadStateFile(file: File): StateFileRead {
        return try {
            if (file.exists() && file.canRead() && file.length() in 1..4096) {
                StateFileRead(file.readText().trim(), "app_read")
            } else {
                val rootRead = executeRootCommand(
                    "cat ${escapeShellArg(file.absolutePath)} 2>/dev/null | head -c 4096"
                ).trim()
                if (rootRead.isNotBlank()) {
                    StateFileRead(rootRead, "root_read")
                } else {
                    StateFileRead("", "unreadable")
                }
            }
        } catch (_: Exception) {
            val rootRead = executeRootCommand(
                "cat ${escapeShellArg(file.absolutePath)} 2>/dev/null | head -c 4096"
            ).trim()
            if (rootRead.isNotBlank()) {
                StateFileRead(rootRead, "root_read")
            } else {
                StateFileRead("", "unreadable")
            }
        }
    }

    private fun safeReadSmallFile(file: File): String {
        return safeReadStateFile(file).value
    }

    private fun readCompanionVersion(): String {
        val versionLine = executeRootCommand(
            "grep '^version=' /data/adb/modules/virtucam_companion/module.prop 2>/dev/null | head -n 1"
        ).trim()
        if (versionLine.startsWith("version=")) {
            return versionLine.substringAfter("version=").trim()
        }
        return ""
    }

    /**
     * Execute a shell command and return output.
     * Uses sh -c to correctly handle commands with spaces, pipes, and redirects.
     */
    private fun executeCommand(command: String): String {
        if (!isCommandSafe(command)) {
            android.util.Log.w("VirtuCamSettings", "Blocked unsafe command")
            return ""
        }
        return try {
            val process = ProcessBuilder("sh", "-c", command).redirectErrorStream(true).start()
            if (!process.waitFor(10, TimeUnit.SECONDS)) {
                process.destroyForcibly()
                android.util.Log.w("VirtuCamSettings", "Command timed out")
                return ""
            }
            val output: String
            BufferedReader(InputStreamReader(process.inputStream)).use { reader ->
                output = reader.readText()
            }
            BufferedReader(InputStreamReader(process.errorStream)).use { it.readText() }
            output
        } catch (e: IOException) {
            android.util.Log.w("VirtuCamSettings", "Command I/O error: ${e.message}", e)
            ""
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            android.util.Log.w("VirtuCamSettings", "Command interrupted", e)
            ""
        }
    }

    private fun executeRootCommand(command: String): String {
        if (!isCommandSafe(command)) {
            android.util.Log.w("VirtuCamSettings", "Blocked unsafe root command")
            return ""
        }
        return try {
            val process = ProcessBuilder("su", "-c", command).redirectErrorStream(true).start()
            if (!process.waitFor(10, TimeUnit.SECONDS)) {
                process.destroyForcibly()
                android.util.Log.w("VirtuCamSettings", "Root command timed out")
                return ""
            }
            val output: String
            BufferedReader(InputStreamReader(process.inputStream)).use { reader ->
                output = reader.readText()
            }
            BufferedReader(InputStreamReader(process.errorStream)).use { it.readText() }
            output
        } catch (e: IOException) {
            android.util.Log.w("VirtuCamSettings", "Root command I/O error: ${e.message}", e)
            ""
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            android.util.Log.w("VirtuCamSettings", "Root command interrupted", e)
            ""
        }
    }

    private fun isCommandSafe(command: String): Boolean {
        if (command.contains('\u0000') || command.contains('\n') || command.contains('\r') || 
            command.contains(';') || command.contains("&&") || command.contains("||")) return false
        val trimmed = command.trimStart()
        val allowedPrefixes = listOf(
            "magisk ", "ksud ", "apd ", "ls ", "chmod ", "unzip ", "su ",
            "/data/adb/", "pm ", "sqlite3 ", "cat ", "grep ", "strings ", "find ",
            "logcat ", "tail ", "getenforce", "uname ", "sh ", "id",
            "chcon ",
            "mkdir ",
            "cp ",
            "rm ",
            "cmd appops",
            "am ",
            "mountpoint"
        )
        return allowedPrefixes.any { trimmed.startsWith(it) }
    }

    private fun isAllowedMediaExtension(filePath: String): Boolean {
        val allowed = setOf("mp4", "mkv", "avi", "mov", "webm", "jpg", "jpeg", "png", "gif")
        val ext = filePath.substringAfterLast('.', "").lowercase().trim()
        return ext.isNotEmpty() && ext in allowed
    }

    private fun normalizeFilePath(rawPath: String): String {
        val trimmed = rawPath.trim()
        return if (trimmed.startsWith("file://")) {
            trimmed.removePrefix("file://")
        } else {
            trimmed
        }
    }

    private fun sanitizeFileName(raw: String): String {
        val cleaned = raw.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        return cleaned.take(64).ifEmpty { "media" }
    }

    private fun hasMarkerFile(path: String, expectedPath: String, expectedName: String): Boolean {
        return try {
            val markerFile = File(path)
            val validPath = markerFile.canonicalPath == expectedPath &&
                markerFile.name == expectedName &&
                markerFile.extension.isEmpty()
            validPath && markerFile.exists()
        } catch (e: Exception) {
            android.util.Log.w("VirtuCamSettings", "Marker path validation failed for $path: ${e.message}")
            false
        }
    }

    private fun hasMarkerViaRoot(path: String, expectedToken: String): Boolean {
        val markerRootCheck = executeRootCommand("ls ${escapeShellArg(path)} 2>/dev/null")
        return markerRootCheck.contains(expectedToken)
    }

    private data class RuntimeObservation(
        val observed: Boolean,
        val epochMillis: Long,
        val line: String
    )

    private fun getRuntimeHookObservation(): RuntimeObservation {
        val line = executeRootCommand(
            "grep -h 'VirtuCam/XposedEntry: module active in process:' /data/adb/lspd/log/modules_*.log /data/adb/lspd/log.old/modules_*.log 2>/dev/null | tail -n 1"
        ).trim()
        if (line.isBlank()) {
            return RuntimeObservation(false, 0L, "")
        }
        return RuntimeObservation(
            observed = true,
            epochMillis = parseLsposedTimestampEpoch(line),
            line = line
        )
    }

    private fun parseLsposedTimestampEpoch(line: String): Long {
        return try {
            val match = Regex("\\[\\s*(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2})(?:\\.\\d+)?").find(line)
                ?: return 0L
            val parsed = LocalDateTime.parse(
                match.groupValues[1],
                DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")
            )
            parsed.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        } catch (_: Exception) {
            0L
        }
    }

    private fun getLatestMappingFailureReason(): String? {
        val line = executeRootCommand(
            "grep -h -E 'failed to set mapped surface; rolled back|NoSuchMethodError: android.hardware.camera2.params.OutputConfiguration#setSurface' /data/adb/lspd/log/modules_*.log /data/adb/lspd/log.old/modules_*.log 2>/dev/null | tail -n 1"
        ).trim()
        if (line.isBlank()) return null
        return when {
            line.contains("NoSuchMethodError: android.hardware.camera2.params.OutputConfiguration#setSurface") ->
                "output_configuration_setsurface_missing"
            line.contains("failed to set mapped surface; rolled back") ->
                "mapped_surface_mutation_failed"
            else -> line
        }
    }

    private fun resolveSharedPrefsXmlPath(): String? {
        val pkg = reactApplicationContext.packageName
        val localCandidates = listOf(
            File(reactApplicationContext.applicationInfo.dataDir, "shared_prefs/virtucam_config.xml").absolutePath,
            "/data/user/0/$pkg/shared_prefs/virtucam_config.xml",
            "/data/data/$pkg/shared_prefs/virtucam_config.xml"
        )
        for (candidate in localCandidates) {
            try {
                val file = File(candidate).canonicalFile
                if (file.exists() && file.canRead()) {
                    return file.absolutePath
                }
            } catch (_: Exception) {
            }
        }

        val escapedPkg = sanitizePackageName(pkg)
        if (escapedPkg.isNotBlank()) {
            val sharedPrefsQuery = executeRootCommand(
                "find /data/user /data/data -type f -path '*/$escapedPkg/shared_prefs/virtucam_config.xml' 2>/dev/null | tail -n 1"
            ).trim()
            if (sharedPrefsQuery.isNotBlank()) {
                return sharedPrefsQuery.lineSequence().lastOrNull()?.trim()
            }

            val modernPrefsQuery = executeRootCommand(
                "find /data/misc -type f -path '*/prefs/$escapedPkg/virtucam_config.xml' 2>/dev/null | tail -n 1"
            ).trim()
            if (modernPrefsQuery.isNotBlank()) {
                return modernPrefsQuery.lineSequence().lastOrNull()?.trim()
            }
        }

        return null
    }

    private fun isHookReadableMediaPath(rawPath: String?): Boolean {
        if (rawPath.isNullOrBlank()) return false
        return try {
            val staged = File(normalizeFilePath(rawPath)).canonicalFile
            val stagedPath = staged.absolutePath
            if (stagedPath.startsWith(VirtuCamIPC.MEDIA_DIR)) {
                return staged.exists() && staged.canRead()
            }

            val privateAppPath = stagedPath.startsWith("/data/user/") || stagedPath.startsWith("/data/data/")
            if (privateAppPath) {
                return false
            }

            if (staged.exists() && staged.canRead()) {
                return true
            }

            val rootVisible = executeRootCommand("ls ${escapeShellArg(stagedPath)} 2>/dev/null")
            rootVisible.isNotBlank() && !rootVisible.contains("No such")
        } catch (_: Exception) {
            false
        }
    }

    private fun isValidPackageName(packageName: String): Boolean {
        return packageName.isNotEmpty() && PACKAGE_NAME_REGEX.matches(packageName)
    }

    /**
     * Sanitize package name for use in shell commands
     * Package names should only contain alphanumeric characters, dots, and underscores
     */
    private fun sanitizePackageName(packageName: String): String {
        // Android package names can only contain [a-zA-Z0-9._]
        // Remove any potentially dangerous characters
        return packageName.replace(Regex("[^a-zA-Z0-9._]"), "")
    }
    
    /**
     * Escape string for safe use in shell commands
     * Wraps the string in single quotes and escapes any embedded single quotes
     */
    private fun escapeShellArg(arg: String): String {
        // Replace single quotes with '\'' (end quote, escaped quote, start quote)
        return "'${arg.replace("'", "'\\''")}'"
    }
    
    /**
     * Safely put error message in result map, handling null messages
     */
    private fun putErrorMessage(result: WritableMap, error: Exception) {
        val message = error.message
        if (message != null) {
            result.putString("error", message)
        } else {
            result.putString("error", "Unknown error")
        }
    }

    private fun assertAuthenticated(promise: Promise): Boolean {
        val callerUid = Binder.getCallingUid()
        if (callerUid != Process.myUid()) {
            promise.reject("UNAUTHORIZED", "Caller is not authorized")
            return false
        }
        return true
    }

} // end of class VirtuCamSettingsModule
