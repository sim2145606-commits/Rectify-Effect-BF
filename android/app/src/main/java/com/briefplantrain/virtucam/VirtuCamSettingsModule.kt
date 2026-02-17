package com.briefplantrain.virtucam

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.os.Environment
import android.provider.Settings
import com.facebook.react.bridge.*
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

class VirtuCamSettingsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val prefs: SharedPreferences by lazy {
        reactContext.getSharedPreferences("virtucam_config", Context.MODE_WORLD_READABLE)
    }
    
    companion object {
        // Marker file timeout: Module remains active until device reboot
        // (marker file is in /data/local/tmp which is cleared on reboot)
        private val MARKER_FILE_TIMEOUT_MS = TimeUnit.HOURS.toMillis(24)
    }

    override fun getName(): String = "VirtuCamSettings"

    /**
     * Write configuration to SharedPreferences (world-readable for Xposed module)
     */
    @ReactMethod
    fun writeConfig(config: ReadableMap, promise: Promise) {
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
            if (config.hasKey("targetPackages")) {
                val packages = config.getArray("targetPackages")
                val packageList = mutableListOf<String>()
                if (packages != null) {
                    for (i in 0 until packages.size()) {
                        packages.getString(i)?.let { packageList.add(it) }
                    }
                }
                editor.putString("targetPackages", packageList.joinToString(","))
            }
            
            editor.apply()
            
            // Make file world-readable for Xposed
            try {
                val prefsFile = File(reactApplicationContext.applicationInfo.dataDir, 
                    "shared_prefs/virtucam_config.xml")
                if (prefsFile.exists()) {
                    prefsFile.setReadable(true, false)
                }
            } catch (e: Exception) {
                // Non-fatal, just log
                android.util.Log.w("VirtuCamSettings", "Could not set prefs file readable: ${e.message}")
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
        try {
            val config = Arguments.createMap()
            config.putBoolean("enabled", prefs.getBoolean("enabled", false))
            config.putString("mediaSourcePath", prefs.getString("mediaSourcePath", null))
            config.putString("cameraTarget", prefs.getString("cameraTarget", "front"))
            config.putBoolean("mirrored", prefs.getBoolean("mirrored", false))
            config.putInt("rotation", prefs.getInt("rotation", 0))
            config.putDouble("scaleX", prefs.getFloat("scaleX", 1.0f).toDouble())
            config.putDouble("scaleY", prefs.getFloat("scaleY", 1.0f).toDouble())
            config.putDouble("offsetX", prefs.getFloat("offsetX", 0.0f).toDouble())
            config.putDouble("offsetY", prefs.getFloat("offsetY", 0.0f).toDouble())
            config.putString("scaleMode", prefs.getString("scaleMode", "fit"))
            config.putString("targetMode", prefs.getString("targetMode", "whitelist"))
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
     */
    @ReactMethod
    fun checkRootAccess(promise: Promise) {
        try {
            val process = Runtime.getRuntime().exec("su -c id")
            val reader = BufferedReader(InputStreamReader(process.inputStream))
            val output = reader.readText()
            val exitCode = process.waitFor()
            
            val result = Arguments.createMap()
            result.putBoolean("granted", exitCode == 0 && output.contains("uid=0"))
            result.putString("output", output)
            result.putInt("exitCode", exitCode)
            
            promise.resolve(result)
        } catch (e: Exception) {
            val result = Arguments.createMap()
            result.putBoolean("granted", false)
            result.putString("error", e.message)
            promise.resolve(result)
        }
    }

    /**
     * Detect which root solution is installed (Magisk, KernelSU, APatch)
     */
    @ReactMethod
    fun detectRootSolution(promise: Promise) {
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
            if (File("/data/adb/ksud").exists()) {
                val ksuVersion = executeCommand("/data/adb/ksud -V")
                result.putString("solution", "KernelSU")
                result.putString("version", ksuVersion.trim())
                promise.resolve(result)
                return
            }
            
            // Check for APatch
            if (File("/data/adb/apatch").exists()) {
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
            result.putString("error", e.message)
            promise.resolve(result)
        }
    }

    /**
     * Get comprehensive system information
     */
    @ReactMethod
    fun getSystemInfo(promise: Promise) {
        try {
            val info = Arguments.createMap()
            
            // Device info
            info.putString("manufacturer", Build.MANUFACTURER)
            info.putString("model", Build.MODEL)
            info.putString("brand", Build.BRAND)
            info.putString("product", Build.PRODUCT)
            info.putString("device", Build.DEVICE)
            
            // Android version
            info.putString("androidVersion", Build.VERSION.RELEASE)
            info.putInt("sdkLevel", Build.VERSION.SDK_INT)
            info.putString("buildNumber", Build.DISPLAY)
            info.putString("fingerprint", Build.FINGERPRINT)
            
            // Security patch
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                info.putString("securityPatch", Build.VERSION.SECURITY_PATCH)
            }
            
            // Kernel version
            val kernelVersion = executeCommand("uname -r")
            info.putString("kernelVersion", kernelVersion.trim())
            
            // SELinux status
            val selinuxStatus = executeCommand("getenforce")
            info.putString("selinuxStatus", selinuxStatus.trim())
            
            // ABI list
            info.putString("abiList", Build.SUPPORTED_ABIS.joinToString(", "))
            
            // Storage info
            val externalStorage = Environment.getExternalStorageDirectory()
            val totalSpace = externalStorage.totalSpace / (1024 * 1024 * 1024) // GB
            val freeSpace = externalStorage.freeSpace / (1024 * 1024 * 1024) // GB
            info.putString("storage", "$freeSpace GB free / $totalSpace GB total")
            
            // RAM info
            val runtime = Runtime.getRuntime()
            val maxMemory = runtime.maxMemory() / (1024 * 1024) // MB
            info.putString("maxMemory", "$maxMemory MB")
            
            promise.resolve(info)
        } catch (e: Exception) {
            promise.reject("SYSTEM_INFO_ERROR", "Failed to get system info: ${e.message}", e)
        }
    }

    /**
     * Check if LSPosed/Xposed is installed and module is active
     * Improved detection for ReLSPosed and modern LSPosed forks
     */
    @ReactMethod
    fun checkXposedStatus(promise: Promise) {
        try {
            val result = Arguments.createMap()
            val packageName = reactApplicationContext.packageName
            
            // Check if running in Xposed environment
            val isXposedActive = try {
                Class.forName("de.robv.android.xposed.XposedBridge")
                true
            } catch (e: ClassNotFoundException) {
                false
            }
            
            result.putBoolean("xposedActive", isXposedActive)
            
            // Check for LSPosed installation via multiple methods
            var lsposedExists = false
            var detectedPath = ""
            
            // Check common LSPosed directories
            val lsposedPaths = listOf(
                "/data/adb/lspd",
                "/data/adb/modules/zygisk_lsposed",
                "/data/adb/modules/riru_lsposed",
                "/data/adb/modules/lsposed"  // Some forks use this
            )
            
            for (path in lsposedPaths) {
                if (File(path).exists()) {
                    lsposedExists = true
                    detectedPath = path
                    break
                }
            }
            
            // Fallback: Check via root if direct access fails
            if (!lsposedExists) {
                val lsposedCheck = executeRootCommand(
                    "ls -d /data/adb/lspd /data/adb/modules/*lsposed* 2>/dev/null | head -1"
                )
                if (lsposedCheck.isNotEmpty() && !lsposedCheck.contains("No such file")) {
                    lsposedExists = true
                    detectedPath = lsposedCheck.trim()
                }
            }
            
            result.putBoolean("lsposedInstalled", lsposedExists)
            result.putString("lsposedPath", detectedPath)
            
            // Check if module is active - multiple methods for different LSPosed forks
            var moduleActive = false
            var detectionMethod = "none"
            
            // Method 1: Check marker file (created when module hooks an app)
            val markerFile = File("/data/local/tmp/virtucam_module_active")
            if (markerFile.exists()) {
                val lastModified = markerFile.lastModified()
                val currentTime = System.currentTimeMillis()
                if (currentTime - lastModified < MARKER_FILE_TIMEOUT_MS) {
                    moduleActive = true
                    detectionMethod = "marker_file"
                    android.util.Log.d("VirtuCamSettings", "Module detected via marker file")
                }
            }
            
            // Method 2: Check LSPosed database (most reliable for modern forks including ReLSPosed)
            if (!moduleActive && lsposedExists) {
                val dbCheckResult = checkLSPosedDatabase(packageName)
                if (dbCheckResult) {
                    moduleActive = true
                    detectionMethod = "lspd_database"
                    android.util.Log.d("VirtuCamSettings", "Module detected via LSPosed database")
                }
            }
            
            // Method 3: Check scope configuration files
            if (!moduleActive && lsposedExists) {
                val scopeCheckResult = checkLSPosedScope(packageName)
                if (scopeCheckResult) {
                    moduleActive = true
                    detectionMethod = "scope_config"
                    android.util.Log.d("VirtuCamSettings", "Module detected via scope configuration")
                }
            }
            
            // Method 4: Check prefs.db for module enabled state (ReLSPosed specific)
            if (!moduleActive && lsposedExists) {
                val prefsCheckResult = checkLSPosedPrefs(packageName)
                if (prefsCheckResult) {
                    moduleActive = true
                    detectionMethod = "prefs_db"
                    android.util.Log.d("VirtuCamSettings", "Module detected via prefs database")
                }
            }
            
            // Method 5: Check if module APK is in LSPosed's modules directory
            if (!moduleActive && lsposedExists) {
                val moduleDirCheck = checkModulesDirectory(packageName)
                if (moduleDirCheck) {
                    moduleActive = true
                    detectionMethod = "modules_dir"
                    android.util.Log.d("VirtuCamSettings", "Module detected via modules directory")
                }
            }
            
            result.putBoolean("moduleActive", moduleActive)
            result.putString("detectionMethod", detectionMethod)
            
            android.util.Log.d("VirtuCamSettings",
                "Detection results: xposedActive=$isXposedActive, lsposedInstalled=$lsposedExists, " +
                "moduleActive=$moduleActive, method=$detectionMethod, path=$detectedPath")
            
            promise.resolve(result)
        } catch (e: Exception) {
            val result = Arguments.createMap()
            result.putBoolean("xposedActive", false)
            result.putBoolean("lsposedInstalled", false)
            result.putBoolean("moduleActive", false)
            result.putString("detectionMethod", "error")
            result.putString("error", e.message)
            promise.resolve(result)
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
            "/data/adb/modules/zygisk_lsposed/config/modules_config.db"
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
        
        // Check if module has any scope configured (meaning it's enabled and has target apps)
        val scopeCheck = executeRootCommand(
            "ls /data/adb/lspd/config/$packageName 2>/dev/null || " +
            "ls /data/adb/lspd/config/scope/$packageName 2>/dev/null || " +
            "cat /data/adb/lspd/config/modules/$packageName/scope.json 2>/dev/null || " +
            "grep -r $escapedPkg /data/adb/lspd/config/scope/ 2>/dev/null | head -1"
        )
        
        return scopeCheck.isNotEmpty() &&
               !scopeCheck.contains("No such file") &&
               !scopeCheck.contains("cannot access")
    }

    /**
     * Check LSPosed prefs database (used by ReLSPosed and some forks)
     */
    private fun checkLSPosedPrefs(packageName: String): Boolean {
        val escapedPkg = escapeShellArg(packageName)
        
        // ReLSPosed and some forks store module state in prefs.db or shared_prefs
        val prefsCheck = executeRootCommand(
            "sqlite3 /data/adb/lspd/config/prefs.db \"SELECT value FROM prefs WHERE key LIKE '%$packageName%'\" 2>/dev/null || " +
            "cat /data/adb/lspd/config/enabled_modules 2>/dev/null | grep $escapedPkg || " +
            "cat /data/adb/lspd/config/modules.json 2>/dev/null | grep $escapedPkg"
        )
        
        return prefsCheck.isNotEmpty() &&
               !prefsCheck.contains("Error") &&
               !prefsCheck.contains("no such")
    }

    /**
     * Check if module exists in LSPosed's modules directory or is registered
     */
    private fun checkModulesDirectory(packageName: String): Boolean {
        // Check if our package is registered as a module
        val moduleCheck = executeRootCommand(
            "pm path $packageName 2>/dev/null"
        )
        
        if (moduleCheck.isEmpty()) {
            return false
        }
        
        // Verify the APK contains xposed_init (confirms it's a valid Xposed module)
        val apkPath = moduleCheck.replace("package:", "").trim()
        val escapedApkPath = escapeShellArg(apkPath)
        
        val xposedInitCheck = executeRootCommand(
            "unzip -l $escapedApkPath 2>/dev/null | grep -q 'assets/xposed_init' && echo 'found'"
        )
        
        if (xposedInitCheck.trim() != "found") {
            return false
        }
        
        // Now check if LSPosed knows about this module
        val lspdModuleCheck = executeRootCommand(
            "ls /data/adb/lspd/config/ 2>/dev/null | grep -q '$packageName' && echo 'registered' || " +
            "find /data/adb/lspd/ -name '*$packageName*' -type f 2>/dev/null | head -1"
        )
        
        return lspdModuleCheck.contains("registered") || lspdModuleCheck.isNotEmpty()
    }

    /**
     * Check if MANAGE_EXTERNAL_STORAGE permission is granted
     */
    @ReactMethod
    fun checkAllFilesAccess(promise: Promise) {
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

    /**
     * Check if overlay permission (SYSTEM_ALERT_WINDOW) is granted
     */
    @ReactMethod
    fun checkOverlayPermission(promise: Promise) {
        try {
            val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(reactApplicationContext)
            } else {
                // On older Android versions, this permission is granted by default
                true
            }
            promise.resolve(granted)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Verify config file is readable by other processes (for Xposed module)
     */
    @ReactMethod
    fun verifyConfigReadable(promise: Promise) {
        try {
            val prefsFile = File(reactApplicationContext.applicationInfo.dataDir, 
                "shared_prefs/virtucam_config.xml")
            
            val result = Arguments.createMap()
            result.putBoolean("exists", prefsFile.exists())
            result.putBoolean("readable", prefsFile.canRead())
            result.putString("path", prefsFile.absolutePath)
            
            // Try to read permissions
            val permissions = executeCommand("ls -l ${prefsFile.absolutePath}")
            result.putString("permissions", permissions.trim())
            
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("VERIFY_ERROR", "Failed to verify config: ${e.message}", e)
        }
    }

    /**
     * Get Xposed/LSPosed logs related to VirtuCam
     */
    @ReactMethod
    fun getXposedLogs(promise: Promise) {
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
            result.putString("error", e.message)
            promise.resolve(result)
        }
    }

    /**
     * Get system logcat (last 1000 lines)
     */
    @ReactMethod
    fun getSystemLogs(lineCount: Int, promise: Promise) {
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
            result.putString("error", e.message)
            promise.resolve(result)
        }
    }

    /**
     * Clear logcat buffer
     */
    @ReactMethod
    fun clearSystemLogs(promise: Promise) {
        try {
            executeCommand("logcat -c")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Execute a shell command and return output
     */
    private fun executeCommand(command: String): String {
        return try {
            val process = Runtime.getRuntime().exec(command)
            val reader = BufferedReader(InputStreamReader(process.inputStream))
            val output = reader.readText()
            process.waitFor()
            output
        } catch (e: Exception) {
            ""
        }
    }
    
    /**
     * Execute a root command and return output
     */
    private fun executeRootCommand(command: String): String {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("su", "-c", command))
            val reader = BufferedReader(InputStreamReader(process.inputStream))
            val output = reader.readText()
            process.waitFor()
            output
        } catch (e: Exception) {
            ""
        }
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
}
