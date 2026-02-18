# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# ============================================
# React Native Core (CRITICAL FOR APP STARTUP)
# ============================================
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.soloader.** { *; }

# Keep React Native modules
-keepclassmembers class * {
    @com.facebook.react.uimanager.annotations.ReactProp <methods>;
    @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>;
}

# Keep React Native bridge
-keepclassmembers class * extends com.facebook.react.bridge.JavaScriptModule { *; }
-keepclassmembers class * extends com.facebook.react.bridge.NativeModule { *; }
-keepclassmembers class * extends com.facebook.react.bridge.BaseJavaModule { *; }

# ============================================
# Expo Framework (CRITICAL FOR EXPO APPS)
# ============================================
-keep class expo.modules.** { *; }
-keep class expo.modules.core.** { *; }
-keep class expo.modules.kotlin.** { *; }

# Keep Expo module registry
-keepclassmembers class * {
    @expo.modules.kotlin.modules.Module *;
}

# ============================================
# New Architecture / Fabric / TurboModules (CRITICAL)
# ============================================
-keep class com.facebook.react.fabric.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-keep class com.facebook.react.views.** { *; }
-keep class com.facebook.react.animated.** { *; }

# Keep codegen classes
-keep class com.facebook.react.viewmanagers.** { *; }

# Keep TurboModule registry and core modules (FIXES CRASH)
-keep class com.facebook.react.turbomodule.core.** { *; }
-keep class com.facebook.react.turbomodule.core.interfaces.** { *; }
-keep class com.facebook.react.modules.core.** { *; }
-keep class com.facebook.react.modules.systeminfo.** { *; }

# Keep all TurboModule implementations
-keep @com.facebook.react.bridge.ReactModule class * { *; }
-keep @com.facebook.react.turbomodule.core.interfaces.TurboModule class * { *; }

# Keep PlatformConstants and other core modules
-keep class com.facebook.react.modules.systeminfo.AndroidInfoModule { *; }
-keep class com.facebook.react.modules.core.DeviceEventManagerModule { *; }
-keep class com.facebook.react.modules.core.ExceptionsManagerModule { *; }
-keep class com.facebook.react.modules.core.Timing { *; }
-keep class com.facebook.react.modules.core.HeadlessJsTaskSupportModule { *; }
-keep class com.facebook.react.modules.appstate.AppStateModule { *; }
-keep class com.facebook.react.modules.appearance.AppearanceModule { *; }
-keep class com.facebook.react.modules.deviceinfo.DeviceInfoModule { *; }

# ============================================
# VirtuCam Xposed Module — MUST KEEP
# ============================================

# Keep the main Xposed hook entry point (referenced in xposed_init)
-keep class com.briefplantrain.virtucam.CameraHook { *; }

# Keep all hook strategy classes (loaded dynamically by registry)
-keep class com.briefplantrain.virtucam.hooks.** { *; }

# Keep the streaming media source
-keep class com.briefplantrain.virtucam.StreamingMediaSource { *; }

# Keep JNI native methods
-keep class com.briefplantrain.virtucam.NativeEncoder {
    native <methods>;
    public static boolean isNativeAvailable();
}

# Keep React Native bridge modules
-keep class com.briefplantrain.virtucam.VirtuCamSettingsModule { *; }
-keep class com.briefplantrain.virtucam.VirtuCamSettingsPackage { *; }

# Keep FloatingOverlayService (referenced in AndroidManifest.xml)
-keep class com.briefplantrain.virtucam.FloatingOverlayService { *; }

# ============================================
# Xposed Framework
# ============================================
-keep class de.robv.android.xposed.** { *; }
-keepclassmembers class * {
    @de.robv.android.xposed.* <methods>;
}
-dontwarn de.robv.android.xposed.**

# ============================================
# ExoPlayer / Media3 (for streaming)
# ============================================
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**

# ============================================
# General
# ============================================
# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}
