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
            putErrorMessage(result, e)
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
            putErrorMessage(result, e)
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
     */
    @ReactMethod
    fun checkXposedStatus(promise: Promise) {
        try {
            val result = Arguments.createMap()
            
            // Check if running in Xposed environment by checking for XposedBridge class
            // Note: This only works in hooked processes, not in the module app itself
            val isXposedActive = try {
                Class.forName("de.robv.android.xposed.XposedBridge")
                true
            } catch (e: ClassNotFoundException) {
                false
            }
            
            result.putBoolean("xposedActive", isXposedActive)
            
            // Check for LSPosed installation via multiple methods
            var lsposedExists = false
            
            // Method 1: Check for LSPosed directories
            if (File("/data/adb/lspd").exists() ||
                File("/data/adb/modules/zygisk_lsposed").exists() ||
                File("/data/adb/modules/riru_lsposed").exists()) {
                lsposedExists = true
            }
            
            // Method 2: Check for LSPosed Manager package
            if (!lsposedExists) {
                try {
                    reactApplicationContext.packageManager.getPackageInfo("org.lsposed.manager", 0)
                    lsposedExists = true
                } catch (e: Exception) {
                    // LSPosed Manager not installed
                }
            }
            
            // Method 3: Check via root command
            if (!lsposedExists) {
                val lsposedCheck = executeRootCommand("ls /data/adb/lspd 2>/dev/null || ls /data/adb/modules/*lsposed* 2>/dev/null")
                if (lsposedCheck.isNotEmpty() && !lsposedCheck.contains("No such file")) {
                    lsposedExists = true
                }
            }
            
            result.putBoolean("lsposedInstalled", lsposedExists)
            
            // Check if module is active by looking for marker file created by CameraHook
            // The module creates this file when it's loaded by LSPosed
            var moduleActive = false
            val markerFile = File("/data/local/tmp/virtucam_module_active")
            
            // Method 1: Check for marker file
            if (markerFile.exists()) {
                // Check if marker is recent (within last 24 hours)
                // Extended timeout: Module remains active until device reboot (marker file is in /data/local/tmp)
                // This prevents false negatives when user hasn't opened a target app recently
                val lastModified = markerFile.lastModified()
                val currentTime = System.currentTimeMillis()
                
                if (currentTime - lastModified < MARKER_FILE_TIMEOUT_MS) {
                    moduleActive = true
                    android.util.Log.d("VirtuCamSettings", "Module active via marker file (age: ${(currentTime - lastModified) / 1000}s)")
                }
            }
            
            // Method 2: Check LSPosed module configuration via root
            // This is the most reliable method for detecting if module is enabled and has scopes
            if (!moduleActive && lsposedExists) {
                val packageName = sanitizePackageName(reactApplicationContext.packageName)
                val escapedPackageName = escapeShellArg(packageName)
                
                // Check multiple LSPosed variant paths for module configuration
                // Includes support for ReLSPosed and other forks
                val moduleCheckScript = """
                    # Check if module is enabled in LSPosed's modules list
                    for path in \
                        /data/adb/lspd/config/modules.list \
                        /data/adb/modules/zygisk_lsposed/config/modules.list \
                        /data/adb/modules/riru_lsposed/config/modules.list \
                        /data/adb/modules/lsposed/config/modules.list \
                        /data/adb/lspd/modules.list; do
                        if [ -f "${'$'}path" ] && grep -q $escapedPackageName "${'$'}path" 2>/dev/null; then
                            echo "module_enabled"
                            # Also check if module has scopes assigned
                            for scope_path in \
                                /data/adb/lspd/config/scope/$escapedPackageName \
                                /data/adb/modules/zygisk_lsposed/config/scope/$escapedPackageName \
                                /data/adb/modules/riru_lsposed/config/scope/$escapedPackageName \
                                /data/adb/modules/lsposed/config/scope/$escapedPackageName; do
                                if [ -d "${'$'}scope_path" ] && [ -n "${'$'}(ls -A ${'$'}scope_path 2>/dev/null)" ]; then
                                    echo "has_scopes"
                                    exit 0
                                fi
                            done
                            exit 0
                        fi
                    done
                    echo "not_found"
                """.trimIndent()
                
                val moduleCheckResult = executeRootCommand(moduleCheckScript)
                
                if (moduleCheckResult.contains("module_enabled")) {
                    if (moduleCheckResult.contains("has_scopes")) {
                        moduleActive = true
                        android.util.Log.d("VirtuCamSettings", "Module active: Enabled with scopes configured")
                    } else {
                        // Module is enabled but no scopes - still consider it potentially active
                        // as some LSPosed versions may store scopes differently
                        moduleActive = true
                        android.util.Log.d("VirtuCamSettings", "Module active: Enabled (scope check inconclusive)")
                    }
                }
            }
            
            // Method 3: Fallback - Check if module has scope configuration files
            // This catches cases where module list check failed but scopes exist
            if (!moduleActive && lsposedExists) {
                val packageName = sanitizePackageName(reactApplicationContext.packageName)
                val escapedPackageName = escapeShellArg(packageName)
                
                val scopeCheckScript = """
                    # Look for any scope configuration for this module
                    for scope_base in \
                        /data/adb/lspd/config/scope \
                        /data/adb/modules/zygisk_lsposed/config/scope \
                        /data/adb/modules/riru_lsposed/config/scope \
                        /data/adb/modules/lsposed/config/scope; do
                        if [ -d "${'$'}scope_base/$escapedPackageName" ]; then
                            # Check if directory has any files (indicating configured scopes)
                            if [ -n "${'$'}(ls -A ${'$'}scope_base/$escapedPackageName 2>/dev/null)" ]; then
                                echo "scope_configured"
                                exit 0
                            fi
                        fi
                    done
                    echo "no_scopes"
                """.trimIndent()
                
                val scopeCheckResult = executeRootCommand(scopeCheckScript)
                
                if (scopeCheckResult.trim() == "scope_configured") {
                    moduleActive = true
                    android.util.Log.d("VirtuCamSettings", "Module active via scope configuration check")
                }
            }
            
            result.putBoolean("moduleActive", moduleActive)
            
            // Add debug info for troubleshooting
            android.util.Log.d("VirtuCamSettings", "LSPosed detection results: xposedActive=$isXposedActive, lsposedInstalled=$lsposedExists, moduleActive=$moduleActive")
            
            promise.resolve(result)
        } catch (e: Exception) {
            val result = Arguments.createMap()
            result.putBoolean("xposedActive", false)
            result.putBoolean("lsposedInstalled", false)
            result.putBoolean("moduleActive", false)
            putErrorMessage(result, e)
            promise.resolve(result)
        }
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
            putErrorMessage(result, e)
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
            putErrorMessage(result, e)
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
     * Get detailed LSPosed diagnostic information for troubleshooting
     */
    @ReactMethod
    fun getLSPosedDiagnostics(promise: Promise) {
        try {
            val result = Arguments.createMap()
            val packageName = sanitizePackageName(reactApplicationContext.packageName)
            val escapedPackageName = escapeShellArg(packageName)
            
            // Check which LSPosed variant is installed
            val variantCheckScript = """
                if [ -d /data/adb/lspd ]; then echo "standard"; fi
                if [ -d /data/adb/modules/zygisk_lsposed ]; then echo "zygisk"; fi
                if [ -d /data/adb/modules/riru_lsposed ]; then echo "riru"; fi
                if [ -d /data/adb/modules/lsposed ]; then echo "generic"; fi
            """.trimIndent()
            val variants = executeRootCommand(variantCheckScript)
            result.putString("lsposedVariants", variants.trim())
            
            // Check if module is in modules list
            val moduleListCheck = executeRootCommand(
                "grep $escapedPackageName /data/adb/lspd/config/modules.list 2>/dev/null || " +
                "grep $escapedPackageName /data/adb/modules/zygisk_lsposed/config/modules.list 2>/dev/null || " +
                "grep $escapedPackageName /data/adb/modules/riru_lsposed/config/modules.list 2>/dev/null || " +
                "echo 'not_in_list'"
            )
            result.putString("moduleListStatus", moduleListCheck.trim())
            
            // Check scope configuration
            val scopeCheck = executeRootCommand(
                "ls -la /data/adb/lspd/config/scope/$escapedPackageName 2>/dev/null || " +
                "ls -la /data/adb/modules/zygisk_lsposed/config/scope/$escapedPackageName 2>/dev/null || " +
                "ls -la /data/adb/modules/riru_lsposed/config/scope/$escapedPackageName 2>/dev/null || " +
                "echo 'no_scope_dir'"
            )
            result.putString("scopeConfiguration", scopeCheck.trim())
            
            // Check marker file
            val markerFile = File("/data/local/tmp/virtucam_module_active")
            if (markerFile.exists()) {
                val age = (System.currentTimeMillis() - markerFile.lastModified()) / 1000
                result.putString("markerFileAge", "${age}s ago")
                result.putBoolean("markerFileExists", true)
            } else {
                result.putString("markerFileAge", "not found")
                result.putBoolean("markerFileExists", false)
            }
            
            // Check xposed_init in APK
            val xposedInitCheck = executeCommand("unzip -l ${escapeShellArg(reactApplicationContext.applicationInfo.sourceDir)} | grep xposed_init")
            result.putBoolean("hasXposedInit", xposedInitCheck.contains("xposed_init"))
            
            promise.resolve(result)
        } catch (e: Exception) {
            val result = Arguments.createMap()
            putErrorMessage(result, e)
            promise.resolve(result)
        }
    }

    /**
     * Detect which manager app to use for LSPosed configuration
     * Returns package name of the appropriate manager app
     */
    @ReactMethod
    fun detectLSPosedManager(promise: Promise) {
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
}
