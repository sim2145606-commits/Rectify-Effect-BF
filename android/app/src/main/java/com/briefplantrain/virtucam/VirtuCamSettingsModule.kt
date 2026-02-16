package com.briefplantrain.virtucam

import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableArray
import android.util.Log

class VirtuCamSettingsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "VirtuCamSettings"
    }

    @ReactMethod
    fun writeConfig(config: ReadableMap, promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences(
                "virtucam_config",
                Context.MODE_WORLD_READABLE or Context.MODE_MULTI_PROCESS
            )
            val editor = prefs.edit()

            // Write all config values
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
            
            // Make the file world-readable so Xposed can access it
            try {
                val prefsFile = reactApplicationContext.getSharedPreferences(
                    "virtucam_config",
                    Context.MODE_PRIVATE
                ).edit().commit()
                
                val prefsPath = reactApplicationContext.applicationInfo.dataDir + 
                    "/shared_prefs/virtucam_config.xml"
                val file = java.io.File(prefsPath)
                file.setReadable(true, false)
                file.setExecutable(true, false)
                
                val parentDir = file.parentFile
                parentDir?.setReadable(true, false)
                parentDir?.setExecutable(true, false)
            } catch (e: Exception) {
                Log.w("VirtuCam", "Could not set file permissions: ${e.message}")
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("WRITE_ERROR", "Failed to write config: ${e.message}", e)
        }
    }

    @ReactMethod
    fun readConfig(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences(
                "virtucam_config",
                Context.MODE_WORLD_READABLE or Context.MODE_MULTI_PROCESS
            )

            val config = mutableMapOf<String, Any?>()
            config["enabled"] = prefs.getBoolean("enabled", false)
            config["mediaSourcePath"] = prefs.getString("mediaSourcePath", null)
            config["cameraTarget"] = prefs.getString("cameraTarget", "front")
            config["mirrored"] = prefs.getBoolean("mirrored", false)
            config["rotation"] = prefs.getInt("rotation", 0)
            config["scaleMode"] = prefs.getString("scaleMode", "fit")
            config["targetMode"] = prefs.getString("targetMode", "whitelist")
            config["targetPackages"] = prefs.getString("targetPackages", "")

            promise.resolve(config)
        } catch (e: Exception) {
            promise.reject("READ_ERROR", "Failed to read config: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getConfigPath(promise: Promise) {
        try {
            val path = reactApplicationContext.applicationInfo.dataDir + 
                "/shared_prefs/virtucam_config.xml"
            promise.resolve(path)
        } catch (e: Exception) {
            promise.reject("PATH_ERROR", "Failed to get config path: ${e.message}", e)
        }
    }
}
