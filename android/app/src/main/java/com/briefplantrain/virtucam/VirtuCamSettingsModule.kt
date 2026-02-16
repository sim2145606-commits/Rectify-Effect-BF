package com.briefplantrain.virtucam

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.os.Environment
import com.facebook.react.bridge.*
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader

class VirtuCamSettingsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val prefs: SharedPreferences by lazy {
        reactContext.getSharedPreferences("virtucam_config", Context.MODE_WORLD_READABLE)
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
                        packageList.add(packages.getString(i))
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
     */
    @ReactMethod
    fun checkXposedStatus(promise: Promise) {
        try {
            val result = Arguments.createMap()
            
            // Check if running in Xposed environment
            val isXposedActive = try {
                Class.forName("de.robv.android.xposed.XposedBridge")
                true
            } catch (e: ClassNotFoundException) {
                false
            }
            
            result.putBoolean("xposedActive", isXposedActive)
            
            // Check for LSPosed
            val lsposedExists = File("/data/adb/lspd").exists() || 
                               File("/data/adb/modules/zygisk_lsposed").exists()
            result.putBoolean("lsposedInstalled", lsposedExists)
            
            // Module activation can only be truly verified by the Xposed framework itself
            // This is a best-effort check
            result.putBoolean("moduleActive", isXposedActive)
            
            promise.resolve(result)
        } catch (e: Exception) {
            val result = Arguments.createMap()
            result.putBoolean("xposedActive", false)
            result.putBoolean("lsposedInstalled", false)
            result.putBoolean("moduleActive", false)
            result.putString("error", e.message)
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
}
