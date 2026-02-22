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
import java.util.zip.ZipFile
import java.util.concurrent.TimeUnit

class VirtuCamSettingsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val prefs: SharedPreferences by lazy {
        reactContext.getSharedPreferences("virtucam_config", Context.MODE_PRIVATE)
    }
    
    companion object {
        // intentionally empty — no shared constants needed at this time
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
            val editor = prefs.edit()
            
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
                        packageList.add(packages.getString(i))
                    }
                }
                editor.putString("targetPackages", packageList.joinToString(","))
            }
            
            editor.apply()
            
            // ISSUE 1 FIX: Dual-strategy approach for Android 9+ compatibility
            // Strategy A: Use root to chmod the SharedPreferences file and directory
            try {
                val prefsFile = File(reactApplicationContext.applicationInfo.dataDir,
                    "shared_prefs/virtucam_config.xml")
                val prefsDir = File(reactApplicationContext.applicationInfo.dataDir,
                    "shared_prefs")
                
                if (prefsFile.exists()) {
                    // Try non-root first (will work on some devices)
                    prefsFile.setReadable(true, false)
                    
                    // Try root chmod for better compatibility
                    try {
                        val escapedPrefsDir = escapeShellArg(prefsDir.absolutePath)
                        val escapedPrefsFile = escapeShellArg(prefsFile.absolutePath)
                        
                        executeRootCommand("chmod 755 $escapedPrefsDir")
                        executeRootCommand("chmod 644 $escapedPrefsFile")
                        
                        android.util.Log.d("VirtuCamSettings", "Root chmod applied successfully")
                    } catch (e: Exception) {
                        android.util.Log.w("VirtuCamSettings", "Root chmod failed (non-fatal): ${e.message}")
                    }
                }
            } catch (e: Exception) {
                android.util.Log.w("VirtuCamSettings", "Could not set prefs file readable: ${e.message}")
            }
            
            // Strategy B: Write fallback JSON config to world-readable location
            try {
                val fallbackConfig = JSONObject()
                if (config.hasKey("enabled")) {
                    fallbackConfig.put("enabled", config.getBoolean("enabled"))
                }
                if (config.hasKey("mediaSourcePath")) {
                    fallbackConfig.put("mediaSourcePath", config.getString("mediaSourcePath"))
                }
                if (config.hasKey("cameraTarget")) {
                    fallbackConfig.put("cameraTarget", config.getString("cameraTarget"))
                }
                if (config.hasKey("mirrored")) {
                    fallbackConfig.put("mirrored", config.getBoolean("mirrored"))
                }
                if (config.hasKey("rotation")) {
                    fallbackConfig.put("rotation", config.getInt("rotation"))
                }
                if (config.hasKey("scaleX")) {
                    fallbackConfig.put("scaleX", config.getDouble("scaleX"))
                }
                if (config.hasKey("scaleY")) {
                    fallbackConfig.put("scaleY", config.getDouble("scaleY"))
                }
                if (config.hasKey("offsetX")) {
                    fallbackConfig.put("offsetX", config.getDouble("offsetX"))
                }
                if (config.hasKey("offsetY")) {
                    fallbackConfig.put("offsetY", config.getDouble("offsetY"))
                }
                if (config.hasKey("scaleMode")) {
                    fallbackConfig.put("scaleMode", config.getString("scaleMode"))
                }
                if (config.hasKey("targetMode")) {
                    fallbackConfig.put("targetMode", config.getString("targetMode"))
                }
                if (config.hasKey("sourceMode")) {
                    fallbackConfig.put("sourceMode", config.getString("sourceMode"))
                }
                if (config.hasKey("targetPackages")) {
                    val packages = config.getArray("targetPackages")
                    val packageList = mutableListOf<String>()
                    if (packages != null) {
                        for (i in 0 until packages.size()) {
                            packageList.add(packages.getString(i))
                        }
                    }
                    fallbackConfig.put("targetPackages", packageList.joinToString(","))
                }
                
                val fallbackFile = File(VirtuCamIPC.CONFIG_JSON)
                val ipcConfigDir = File(VirtuCamIPC.CONFIG_DIR)

                if (!ipcConfigDir.exists()) {
                    // Companion module missing/not ready: keep SharedPreferences as primary source.
                    android.util.Log.w("VirtuCamSettings", "IPC dir not ready, skipping JSON config write")
                } else if (!fallbackFile.canonicalPath.startsWith(VirtuCamIPC.IPC_ROOT) ||
                    fallbackFile.canonicalPath != VirtuCamIPC.CONFIG_JSON) {
                    throw SecurityException("Invalid file path")
                } else {
                    val allowedExtensions = setOf("json", "xml")
                    if (fallbackFile.extension.lowercase() !in allowedExtensions) {
                        throw SecurityException("Invalid file extension")
                    }
                    FileWriter(fallbackFile).use { writer ->
                        writer.write(fallbackConfig.toString())
                    }
                    fallbackFile.setReadable(true, false)
                    android.util.Log.d("VirtuCamSettings", "Fallback JSON config written successfully")
                }
            } catch (e: Exception) {
                android.util.Log.w("VirtuCamSettings", "Could not write fallback config: ${e.message}")
            }
            
            promise.resolve(true)
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
            config.putString("targetMode", prefs.getString("targetMode", "whitelist"))
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
            val prefsPath = File(reactApplicationContext.applicationInfo.dataDir, 
                "shared_prefs/virtucam_config.xml").absolutePath
            promise.resolve(prefsPath)
        } catch (e: Exception) {
            promise.reject("PATH_ERROR", "Failed to get config path: ${e.message}", e)
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
            var moduleLoadedInTargetProcess = false
            var moduleScoped = false
            var detectionMethod = "none"
            var scopeEvaluationReason = "no_scope_match"
            
            // Method 1: Check marker file (created when module hooks an app)
            // The marker file persists until reboot in companion-managed IPC storage.
            // No time-based validation needed - if it exists, module has loaded at least once since boot
            val markerFile = File(VirtuCamIPC.MODULE_ACTIVE)
            // Validate file path, name, and extension to prevent unsafe file access (CWE-434)
            val expectedPath = VirtuCamIPC.MODULE_ACTIVE
            val isValidPath = markerFile.canonicalPath == expectedPath &&
                              markerFile.name == "module_active" &&
                              markerFile.extension.isEmpty()
            
            if (!isValidPath) {
                android.util.Log.w("VirtuCamSettings", "Invalid marker file path")
            } else if (markerFile.exists()) {
                moduleLoaded = true
                moduleLoadedInTargetProcess = true
                detectionMethod = "marker_file"
                android.util.Log.d("VirtuCamSettings", "Module detected via marker file")
            } else {
                val markerRootCheck = executeRootCommand("ls ${escapeShellArg(VirtuCamIPC.MODULE_ACTIVE)} 2>/dev/null")
                if (markerRootCheck.contains("module_active")) {
                    moduleLoaded = true
                    detectionMethod = "marker_file_root"
                    android.util.Log.d("VirtuCamSettings", "Module detected via root marker file check")
                }
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

            // Method 5: Check modules directory registration (module package itself)
            if (checkModulesDirectory(modulePackageName)) {
                if (!moduleScoped) {
                    detectionMethod = "modules_dir"
                }
                moduleLoaded = true
            }

            val enabled = prefs.getBoolean("enabled", false)
            val mediaSourcePath = prefs.getString("mediaSourcePath", null)
            val targetMode = prefs.getString("targetMode", "whitelist") ?: "whitelist"
            val sourceMode = prefs.getString("sourceMode", "black") ?: "black"
            val hasTargets = configuredTargets.isNotEmpty()

            if (!moduleScoped && targetMode == "whitelist") {
                scopeEvaluationReason = if (hasTargets) {
                    "whitelist_targets_not_in_scope"
                } else {
                    "whitelist_no_targets_configured"
                }
            }

            val sourceConfigured = when (sourceMode) {
                "black", "test" -> true
                else -> !mediaSourcePath.isNullOrEmpty()
            }
            val hookConfigured = enabled && sourceConfigured &&
                (targetMode != "whitelist" || hasTargets)
            val hookReady = moduleLoaded && moduleScoped && hookConfigured
            
            // Backward-compatible fields
            result.putBoolean("xposedActive", moduleLoaded)
            result.putBoolean("moduleActive", hookReady)
            // New detailed fields
            result.putBoolean("moduleLoaded", moduleLoaded)
            result.putBoolean("moduleScoped", moduleScoped)
            result.putBoolean("hookConfigured", hookConfigured)
            result.putBoolean("hookReady", hookReady)
            result.putString("detectionMethod", detectionMethod)
            result.putInt("configuredTargetsCount", configuredTargets.size)
            result.putInt("scopedTargetsCount", scopedTargets.size)
            result.putString("configuredTargets", configuredTargets.joinToString(","))
            result.putString("scopedTargets", scopedTargets.joinToString(","))
            result.putString("scopeEvaluationReason", scopeEvaluationReason)
            
            android.util.Log.d("VirtuCamSettings",
                "Detection results: moduleLoaded=$moduleLoaded, moduleScoped=$moduleScoped, " +
                "hookConfigured=$hookConfigured, hookReady=$hookReady, lsposedInstalled=$lsposedExists, " +
                "method=$detectionMethod, path=$detectedPath, configuredTargets=$configuredTargets, scopedTargets=$scopedTargets")
            
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
            result.putString("detectionMethod", "error")
            result.putInt("configuredTargetsCount", 0)
            result.putInt("scopedTargetsCount", 0)
            result.putString("configuredTargets", "")
            result.putString("scopedTargets", "")
            result.putString("scopeEvaluationReason", "error")
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
            
            // If sqlite3 is not available, try using grep/strings on the database file
            val grepFallback = executeRootCommand(
                "strings $dbPath 2>/dev/null | grep $escapedPkg"
            )
            if (grepFallback.contains(packageName)) {
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
                val prefsFile = File(reactApplicationContext.applicationInfo.dataDir,
                    "shared_prefs/virtucam_config.xml")
                
                val result = Arguments.createMap()
                result.putBoolean("exists", prefsFile.exists())
                result.putBoolean("readable", prefsFile.canRead())
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
            
            // Try to get logcat entries related to VirtuCam and Xposed
            val logcatCommand = "logcat -d -s VirtuCam:* Xposed:* LSPosed:* | tail -n 500"
            val logs = executeCommand(logcatCommand)
            
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
