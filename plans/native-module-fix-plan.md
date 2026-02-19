# Comprehensive Plan: Fix "Native Module Not Available" Issue

## Executive Summary

**Problem**: All permission checks in Virtucam show "Native module not available" because the `VirtuCamSettings` native module is not being loaded by React Native.

**Root Cause**: Missing BuildConfig generation in Gradle configuration, preventing proper app initialization.

**Impact**: All native functionality is broken:

- Root Access detection
- LSPosed Module detection
- All Files Access permission check
- Overlay Permission check

**Solution**: Add BuildConfig generation, add diagnostic logging, clean rebuild, and verify module registration.

---

## Root Cause Analysis

### 1. **Missing BuildConfig Generation**

**File**: `android/app/build.gradle`

**Problem Location**: Lines 59-125

The `MainApplication.kt` file references `BuildConfig.DEBUG` and `BuildConfig.IS_NEW_ARCHITECTURE_ENABLED` at:

- Line 32: `override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG`
- Line 34: `override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED`

However, the `build.gradle` file does NOT have:

1. `buildFeatures { buildConfig = true }` - Required to generate BuildConfig class
2. `buildConfigField "boolean", "IS_NEW_ARCHITECTURE_ENABLED", "false"` - Required field

**Result**: BuildConfig class is not generated → MainApplication fails to initialize → Native modules never register → VirtuCamSettings is undefined in JavaScript

### 2. **Module Registration Chain**

The module registration chain is:

```
MainApplication.onCreate()
  → ReactNativeHost.getPackages()
  → VirtuCamSettingsPackage.createNativeModules()
  → VirtuCamSettingsModule instantiated
  → Module registered with name "VirtuCamSettings"
  → Available in JavaScript as NativeModules.VirtuCamSettings
```

If MainApplication fails to initialize due to missing BuildConfig, this entire chain breaks.

### 3. **JavaScript Impact**

**Files Affected**:

- `services/PermissionManager.ts` (Lines 29, 66, 117, 197, 336)
- `services/SystemVerification.ts` (Lines 173-410)
- `services/NativeModuleDiagnostics.ts` (Lines 16-22)

All these files check `if (!VirtuCamSettings)` and return "Native module not available" when undefined.

---

## Detailed Fix Plan

### **PHASE 1: Build Configuration Fixes**

#### Fix 1.1: Add BuildConfig Generation

**File**: `android/app/build.gradle`

**Location**: After line 62 (after `compileSdk rootProject.ext.compileSdkVersion`)

**Search for**:

```gradle
android {
    ndkVersion rootProject.ext.ndkVersion
    buildToolsVersion rootProject.ext.buildToolsVersion
    compileSdk rootProject.ext.compileSdkVersion

    namespace 'com.briefplantrain.virtucam'
```

**Add after line 62** (before `namespace`):

```gradle
    // Enable BuildConfig generation (REQUIRED for MainApplication.kt)
    buildFeatures {
        buildConfig = true
    }
```

**Result**: Lines 59-65 should look like:

```gradle
android {
    ndkVersion rootProject.ext.ndkVersion
    buildToolsVersion rootProject.ext.buildToolsVersion
    compileSdk rootProject.ext.compileSdkVersion

    buildFeatures {
        buildConfig = true
    }

    namespace 'com.briefplantrain.virtucam'
```

#### Fix 1.2: Add IS_NEW_ARCHITECTURE_ENABLED Field

**File**: `android/app/build.gradle`

**Location**: Inside `defaultConfig` block (after line 70)

**Search for**:

```gradle
    defaultConfig {
        applicationId 'com.briefplantrain.virtucam'
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0.0"

        // Enable multidex for apps with more than 65K methods
        multiDexEnabled true
```

**Add after line 73** (after `multiDexEnabled true`):

```gradle
        // BuildConfig fields (REQUIRED for MainApplication.kt)
        buildConfigField "boolean", "IS_NEW_ARCHITECTURE_ENABLED", "false"
```

**Result**: Lines 65-75 should look like:

```gradle
    defaultConfig {
        applicationId 'com.briefplantrain.virtucam'
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0.0"

        // Enable multidex for apps with more than 65K methods
        multiDexEnabled true

        // BuildConfig fields (REQUIRED for MainApplication.kt)
        buildConfigField "boolean", "IS_NEW_ARCHITECTURE_ENABLED", "false"

        // Configure NDK build
        externalNativeBuild {
```

---

### **PHASE 2: Add Diagnostic Logging**

#### Fix 2.1: Add Logging to VirtuCamSettingsModule

**File**: `android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt`

**Location**: Line 31 (inside `getName()` method)

**Search for**:

```kotlin
    override fun getName(): String = "VirtuCamSettings"
```

**Replace with** (lines 31-34):

```kotlin
    override fun getName(): String {
        android.util.Log.d("VirtuCamSettings", "✅ Native module registered successfully!")
        return "VirtuCamSettings"
    }
```

**Purpose**: Verify the module is being instantiated and registered.

#### Fix 2.2: Add Logging to MainApplication

**File**: `android/app/src/main/java/com/briefplantrain/virtucam/MainApplication.kt`

**Location**: Line 41 (inside `onCreate()` method)

**Search for**:

```kotlin
  override fun onCreate() {
    super.onCreate()
    // Initialize SoLoader for React Native
    SoLoader.init(this, false)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }
```

**Replace with** (lines 41-48):

```kotlin
  override fun onCreate() {
    super.onCreate()
    android.util.Log.d("VirtuCam", "🚀 Application starting...")
    android.util.Log.d("VirtuCam", "BuildConfig.DEBUG = ${BuildConfig.DEBUG}")
    android.util.Log.d("VirtuCam", "BuildConfig.IS_NEW_ARCHITECTURE_ENABLED = ${BuildConfig.IS_NEW_ARCHITECTURE_ENABLED}")
    // Initialize SoLoader for React Native
    SoLoader.init(this, false)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
    android.util.Log.d("VirtuCam", "✅ Application initialized successfully")
  }
```

**Purpose**: Verify BuildConfig is accessible and app initializes properly.

#### Fix 2.3: Add Logging to VirtuCamSettingsPackage

**File**: `android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsPackage.kt`

**Location**: Line 9 (inside `createNativeModules()` method)

**Search for**:

```kotlin
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(VirtuCamSettingsModule(reactContext))
    }
```

**Replace with** (lines 9-13):

```kotlin
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        android.util.Log.d("VirtuCamSettings", "📦 Creating native modules...")
        val module = VirtuCamSettingsModule(reactContext)
        android.util.Log.d("VirtuCamSettings", "📦 Module created: ${module.name}")
        return listOf(module)
    }
```

**Purpose**: Verify the package is being called to create modules.

---

### **PHASE 3: Add JavaScript Diagnostic Code**

#### Fix 3.1: Add Module Detection Logging

**File**: `services/NativeModuleDiagnostics.ts`

**Location**: Line 16 (inside `diagnoseNativeModule()` function)

**Search for**:

```typescript
  try {
    const { VirtuCamSettings } = NativeModules;

    if (!VirtuCamSettings) {
      diagnostics.error = 'VirtuCamSettings module not found in NativeModules';
      console.error('❌ Native module not loaded!');
      console.error('Available modules:', Object.keys(NativeModules));
      return diagnostics;
    }
```

**Add after line 21** (after `console.error('Available modules:', Object.keys(NativeModules));`):

```typescript
// Log first 10 modules for debugging
const moduleNames = Object.keys(NativeModules);
console.error('Total modules:', moduleNames.length);
console.error('First 10 modules:', moduleNames.slice(0, 10));
console.error('VirtuCamSettings in list?', moduleNames.includes('VirtuCamSettings'));
```

**Purpose**: Help diagnose if ANY native modules are loading or if it's a complete failure.

#### Fix 3.2: Add Startup Diagnostic Check

**File**: `app/index.tsx`

**Location**: Line 11 (inside `useEffect`)

**Search for**:

```typescript
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE)
      .then(value => {
        setOnboardingComplete(value === 'true');
      })
```

**Add before the AsyncStorage call** (after line 11):

```typescript
  useEffect(() => {
    // Diagnostic: Check if native module is available on startup
    import('@/services/NativeModuleDiagnostics').then(({ diagnoseNativeModule }) => {
      const diag = diagnoseNativeModule();
      console.log('🔍 Native Module Diagnostic:', diag);
      if (!diag.nativeModuleExists) {
        console.error('⚠️ CRITICAL: Native module not loaded! App will not function correctly.');
      }
    });

    AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE)
```

**Purpose**: Immediately detect and log if the native module is missing on app startup.

---

### **PHASE 4: Clean Build Process**

#### Step 4.1: Clean All Caches

**Commands to run** (in order):

```bash
# 1. Clean Android build artifacts
cd android
gradlew clean
cd ..

# 2. Clean Metro bundler cache
npx expo start --clear

# 3. Clean npm cache (optional but recommended)
npm cache clean --force

# 4. Remove node_modules cache (optional)
rm -rf node_modules/.cache
```

**Purpose**: Remove all cached build artifacts that might contain old/broken code.

#### Step 4.2: Rebuild Native Code

**Command**:

```bash
npx expo run:android
```

**Important Notes**:

- Do NOT use `expo start` or Expo Go - they don't support custom native modules
- Must use `npx expo run:android` to build native code
- This will take 5-10 minutes for a full rebuild
- Watch for build errors in the terminal

**Expected Output**:

```
> Task :app:compileDebugKotlin
> Task :app:mergeDebugNativeLibs
> Task :app:stripDebugDebugSymbols
> Task :app:packageDebug
> Task :app:installDebug
BUILD SUCCESSFUL
```

#### Step 4.3: Alternative Build Method

If `npx expo run:android` fails, use the batch file:

**Command**:

```bash
build-and-install.bat
```

This script does:

1. Clean build
2. Build APK
3. Install to connected device
4. Launch app

---

### **PHASE 5: Verification & Testing**

#### Test 5.1: Check Logcat for Module Registration

**Command**:

```bash
adb logcat | grep -E "VirtuCam|VirtuCamSettings"
```

**Expected Output**:

```
VirtuCam: 🚀 Application starting...
VirtuCam: BuildConfig.DEBUG = true
VirtuCam: BuildConfig.IS_NEW_ARCHITECTURE_ENABLED = false
VirtuCamSettings: 📦 Creating native modules...
VirtuCamSettings: ✅ Native module registered successfully!
VirtuCamSettings: 📦 Module created: VirtuCamSettings
VirtuCam: ✅ Application initialized successfully
```

**If you see this**: ✅ Module is loading correctly!

**If you DON'T see this**: ❌ Build failed or app crashed during initialization.

#### Test 5.2: Check JavaScript Console

**In the app**, check Metro bundler console for:

```
🔍 Native Module Diagnostic: {
  platform: 'android',
  nativeModuleExists: true,
  availableMethods: [
    'writeConfig',
    'readConfig',
    'checkRootAccess',
    'checkXposedStatus',
    'checkAllFilesAccess',
    'checkOverlayPermission',
    ...
  ],
  error: null
}
```

**If nativeModuleExists is false**: Check logcat for errors.

#### Test 5.3: Navigate to Diagnostic Screen

**File**: `app/diagnostic.tsx` (already exists)

**How to access**:

1. The diagnostic screen is already created
2. You need to add it to your navigation/routing
3. Navigate to it in the app
4. It will show detailed module status

**Expected Result**:

- "Native Module: ✅ LOADED"
- List of all available methods
- Ability to run functionality tests

#### Test 5.4: Test Permission Checks

**In the app**, go to the onboarding screen and check:

**Before Fix**:

- Root Access: "Native module not available" ❌
- LSPosed Module: "Native module not available" ❌
- All Files Access: "Native module not available" ❌
- Overlay Permission: "Native module not available" ❌

**After Fix**:

- Root Access: "Root access granted" ✅ (if you have root)
- LSPosed Module: "Module active in LSPosed" ✅ (if module is enabled)
- All Files Access: "All files access granted" ✅ (if permission granted)
- Overlay Permission: "Overlay permission granted" ✅ (if permission granted)

---

## Troubleshooting Guide

### Issue 1: BuildConfig Still Not Found After Changes

**Symptoms**: Build fails with "Unresolved reference: BuildConfig"

**Solution**:

1. Verify `buildFeatures { buildConfig = true }` is in the `android` block, NOT inside `defaultConfig`
2. Run `cd android && gradlew clean && cd ..`
3. Rebuild with `npx expo run:android`

### Issue 2: Module Still Not Loading After Rebuild

**Symptoms**: Logcat shows no VirtuCamSettings logs

**Possible Causes**:

1. **App not rebuilt**: Make sure you ran `npx expo run:android`, not just `expo start`
2. **Old APK still installed**: Uninstall the app first: `adb uninstall com.briefplantrain.virtucam`
3. **Gradle cache issue**: Run `cd android && gradlew clean --no-daemon && cd ..`

**Solution**:

```bash
# Complete clean rebuild
adb uninstall com.briefplantrain.virtucam
cd android
gradlew clean --no-daemon
cd ..
rm -rf node_modules/.cache
npx expo start --clear
npx expo run:android
```

### Issue 3: Build Succeeds But Module Still Undefined

**Symptoms**:

- Logcat shows "✅ Native module registered successfully!"
- But JavaScript still shows `nativeModuleExists: false`

**Possible Causes**:

1. **Metro cache**: Old JavaScript bundle cached
2. **Multiple instances**: Old Metro bundler still running

**Solution**:

```bash
# Kill all Metro instances
taskkill /F /IM node.exe /T  # Windows
# or
killall node  # Mac/Linux

# Clear Metro cache and restart
npx expo start --clear
```

### Issue 4: Gradle Build Fails

**Symptoms**: Build errors during `gradlew` or `expo run:android`

**Common Errors**:

**Error**: "Could not resolve all files for configuration"
**Solution**: Check internet connection, clear Gradle cache:

```bash
cd android
gradlew clean --refresh-dependencies
cd ..
```

**Error**: "Execution failed for task ':app:mergeDebugNativeLibs'"
**Solution**: NDK issue, check `android/app/build.gradle` lines 76-87 for NDK configuration

**Error**: "Could not find com.facebook.react:react-android"
**Solution**: React Native version mismatch, run `npm install` again

### Issue 5: App Crashes on Startup

**Symptoms**: App installs but crashes immediately

**Check Logcat**:

```bash
adb logcat | grep -E "AndroidRuntime|FATAL"
```

**Common Causes**:

1. **Missing BuildConfig**: Check if BuildConfig generation was added correctly
2. **Kotlin version mismatch**: Check `android/gradle.properties` line 36 has `kotlinVersion=2.0.0`
3. **Missing dependency**: Check `android/app/build.gradle` lines 127-145 for all dependencies

---

## File Change Summary

### Files to Modify:

1. **`android/app/build.gradle`**
   - Add `buildFeatures { buildConfig = true }` after line 62
   - Add `buildConfigField` in `defaultConfig` after line 73

2. **`android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt`**
   - Add logging to `getName()` method at line 31

3. **`android/app/src/main/java/com/briefplantrain/virtucam/MainApplication.kt`**
   - Add logging to `onCreate()` method at line 41

4. **`android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsPackage.kt`**
   - Add logging to `createNativeModules()` method at line 9

5. **`services/NativeModuleDiagnostics.ts`**
   - Add detailed module listing after line 21

6. **`app/index.tsx`**
   - Add startup diagnostic check at line 11

### Files Already Correct (No Changes Needed):

- ✅ `android/app/src/main/AndroidManifest.xml` - Xposed metadata correct
- ✅ `android/app/src/main/assets/xposed_init` - Hook class correct
- ✅ `services/PermissionManager.ts` - Logic correct, just needs module to load
- ✅ `services/SystemVerification.ts` - Logic correct, just needs module to load
- ✅ `app/onboarding.tsx` - UI correct, just needs module to load
- ✅ `app/diagnostic.tsx` - Already has diagnostic UI

---

## Expected Timeline

1. **Making Code Changes**: 10-15 minutes
2. **Clean Build Process**: 5-10 minutes
3. **Rebuild Native Code**: 5-10 minutes (first time)
4. **Testing & Verification**: 5 minutes
5. **Total**: ~30-40 minutes

---

## Success Criteria

✅ **Build succeeds** without errors
✅ **Logcat shows** all module registration logs
✅ **JavaScript console shows** `nativeModuleExists: true`
✅ **Diagnostic screen shows** "Native Module: ✅ LOADED"
✅ **Onboarding screen shows** actual permission statuses (not "Native module not available")
✅ **All permission checks work** (Root, LSPosed, All Files, Overlay)

---

## Post-Fix Validation

After applying all fixes, run this validation checklist:

### Validation Checklist:

- [ ] BuildConfig generation added to `build.gradle`
- [ ] IS_NEW_ARCHITECTURE_ENABLED field added to `defaultConfig`
- [ ] Logging added to all 3 Kotlin files
- [ ] Diagnostic logging added to TypeScript files
- [ ] Clean build completed successfully
- [ ] App installs without errors
- [ ] Logcat shows "✅ Native module registered successfully!"
- [ ] JavaScript console shows `nativeModuleExists: true`
- [ ] Onboarding screen shows real permission statuses
- [ ] Root access detected correctly
- [ ] LSPosed module detected correctly
- [ ] All Files Access permission detected correctly
- [ ] Overlay permission detected correctly
- [ ] Camera permission works (should already work)

---

## Additional Notes

### Why This Fix Works:

1. **BuildConfig Generation**: Allows MainApplication to initialize properly
2. **Module Registration**: Once MainApplication initializes, it calls getPackages() which registers VirtuCamSettingsModule
3. **JavaScript Access**: Once registered, the module becomes available as `NativeModules.VirtuCamSettings`
4. **Permission Checks**: Once the module is available, all permission check methods work

### Why Camera Permission Already Works:

Camera permission uses Expo's `ImagePicker.getCameraPermissionsAsync()` which doesn't require the custom native module. That's why it's the only permission showing "OK" while others show "Native module not available".

### About LSPosed Detection:

Even after fixing the native module, LSPosed detection requires:

1. LSPosed/ReLSPosed installed on device
2. VirtuCam module enabled in LSPosed Manager
3. Target apps added to module scope
4. Device rebooted after enabling module

The native module fix only makes the DETECTION work. You still need to properly configure LSPosed separately.

---

## References

- **MainApplication.kt**: Lines 32, 34 - BuildConfig usage
- **build.gradle**: Lines 59-125 - Android configuration
- **VirtuCamSettingsModule.kt**: Line 31 - Module name registration
- **PermissionManager.ts**: Lines 29, 66, 117, 197 - Native module checks
- **SystemVerification.ts**: Lines 173-410 - Permission verification logic

---

## End of Plan

This plan provides step-by-step instructions to fix the "Native module not available" issue. Follow each phase in order, verify at each step, and use the troubleshooting guide if issues arise.
