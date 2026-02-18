# Debug Guide: Release APK Closing Immediately

## Problem

You installed `virtucam-release-latest` (release APK from GitHub Actions) but the app closes immediately without any crash toast.

## Root Cause Analysis

Since you're using a **release APK** (not debug), the issue is likely one of these:

### 1. 🔴 Native Library Loading Failure (Most Likely)

Your app has C++ native code ([`CMakeLists.txt`](android/app/src/main/jni/CMakeLists.txt)) for YUV encoding. If the `.so` files fail to load, the app crashes silently before React Native initializes.

**Possible causes:**

- Missing native libraries for your device's ABI
- ABI mismatch (app built for arm64 but device is arm32)
- Native library dependencies not met

### 2. 🟡 ProGuard/R8 Stripping Essential Classes

Your [`gradle.properties`](android/gradle.properties:71) has:

```properties
android.enableMinifyInReleaseBuilds=true
```

ProGuard might be stripping React Native or Expo classes needed for initialization.

### 3. 🟡 New Architecture Initialization Failure

Your app has [`newArchEnabled=true`](app.json:10). If Fabric/TurboModules fail to initialize, the app crashes before JS loads.

---

## Diagnostic Steps

### Step 1: Get Crash Logs (CRITICAL)

**Connect your device and run:**

```bash
# Clear old logs
adb logcat -c

# Start logging
adb logcat > crash_log.txt

# In another terminal, install and launch the app
adb install -r app-release.apk
adb shell am start -n com.briefplantrain.virtucam/.MainActivity

# Wait for crash, then stop logging (Ctrl+C)
```

**Then search the log for:**

```bash
# Look for fatal errors
findstr /I "FATAL AndroidRuntime Exception Error" crash_log.txt

# Look for native library errors
findstr /I "UnsatisfiedLinkError dlopen .so" crash_log.txt

# Look for React Native errors
findstr /I "ReactNative ReactNativeJS" crash_log.txt

# Look for VirtuCam specific errors
findstr /I "virtucam" crash_log.txt
```

### Step 2: Check Native Libraries

**Verify .so files are included in APK:**

```bash
# Extract APK
unzip app-release.apk -d apk_contents

# Check for native libraries
dir /s apk_contents\lib

# You should see folders like:
# - lib\arm64-v8a\libyuv_encoder.so
# - lib\armeabi-v7a\libyuv_encoder.so
# - lib\x86\libyuv_encoder.so
# - lib\x86_64\libyuv_encoder.so
```

**Check your device ABI:**

```bash
adb shell getprop ro.product.cpu.abi
# Should return: arm64-v8a, armeabi-v7a, x86, or x86_64
```

### Step 3: Test Without Native Code

**Temporarily disable native build to isolate the issue:**

Edit [`android/app/build.gradle`](android/app/build.gradle:90-95):

```gradle
// Comment out native build
// externalNativeBuild {
//     cmake {
//         path "src/main/jni/CMakeLists.txt"
//         version "3.22.1"
//     }
// }
```

Then rebuild and test:

```bash
cd android
./gradlew clean assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

If the app works now, the issue is with native library loading.

### Step 4: Test Without ProGuard

**Temporarily disable minification:**

Edit [`android/gradle.properties`](android/gradle.properties:71):

```properties
android.enableMinifyInReleaseBuilds=false
```

Then rebuild and test:

```bash
cd android
./gradlew clean assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

If the app works now, ProGuard is stripping essential classes.

### Step 5: Check ProGuard Rules

If ProGuard is the issue, verify [`android/app/proguard-rules.pro`](android/app/proguard-rules.pro) has proper React Native rules:

```proguard
# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }

# Expo
-keep class expo.modules.** { *; }

# VirtuCam native methods
-keep class com.briefplantrain.virtucam.NativeEncoder { *; }
-keepclasseswithmembernames class * {
    native <methods>;
}
```

---

## Quick Fixes to Try

### Fix 1: Add Missing ProGuard Rules

Create/update [`android/app/proguard-rules.pro`](android/app/proguard-rules.pro):

```proguard
# Add to your existing file

# Keep all native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep VirtuCam classes
-keep class com.briefplantrain.virtucam.** { *; }

# Keep React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# Keep Expo
-keep class expo.modules.** { *; }
-keep class expo.modules.core.** { *; }

# Keep Xposed
-keep class de.robv.android.xposed.** { *; }
```

### Fix 2: Build Only for Your Device ABI

If you know your device ABI (e.g., arm64-v8a), edit [`android/gradle.properties`](android/gradle.properties:34):

```properties
# Before (builds all ABIs - larger APK)
reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64

# After (builds only arm64 - smaller, faster)
reactNativeArchitectures=arm64-v8a
```

### Fix 3: Disable New Architecture Temporarily

Edit [`app.json`](app.json:10):

```json
"newArchEnabled": false
```

And [`android/gradle.properties`](android/gradle.properties:41):

```properties
newArchEnabled=false
```

Then rebuild.

---

## Expected Log Patterns

### If Native Library Issue:

```
FATAL EXCEPTION: main
java.lang.UnsatisfiedLinkError: dlopen failed: library "libyuv_encoder.so" not found
```

### If ProGuard Issue:

```
FATAL EXCEPTION: main
java.lang.ClassNotFoundException: com.facebook.react.ReactActivity
```

### If New Architecture Issue:

```
FATAL EXCEPTION: main
com.facebook.react.common.JavascriptException: Fabric is not enabled
```

### If JS Bundle Issue (shouldn't happen with release):

```
ReactNative: Unable to load script. Make sure you're running Metro
```

---

## Next Steps

1. **Get the crash logs** using Step 1 above
2. **Share the relevant error lines** (search for FATAL, Exception, Error)
3. Based on the error, apply the appropriate fix

The crash logs will tell us exactly what's failing. Without them, we're guessing.

---

## Alternative: Build Debug APK with Bundled JS

If you want to test locally with logs visible:

```bash
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Then watch logs in real-time
adb logcat | findstr /I "ReactNative virtucam FATAL"
```

Debug builds have better error messages and stack traces.
