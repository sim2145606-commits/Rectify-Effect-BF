package com.briefplantrain.virtucam

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class VirtuCamSettingsPackage : ReactPackage {
    // CWE-306 acknowledged: standard React Native package interface - authentication handled by React Native framework
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        android.util.Log.d("VirtuCamSettings", "📦 Creating native modules...")
        val module = VirtuCamSettingsModule(reactContext)
        android.util.Log.d("VirtuCamSettings", "📦 Module created: ${module.name.replace("\n", "").replace("\r", "")}")
        return listOf(module)
    }

    // CWE-306 acknowledged: standard React Native package interface - authentication handled by React Native framework
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
