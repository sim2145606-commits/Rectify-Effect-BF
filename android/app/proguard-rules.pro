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
