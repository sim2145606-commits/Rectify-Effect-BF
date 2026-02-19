# 🚨 "Native Module Not Available" Error - Quick Fix

## What's Wrong?

If you see this error on the setup screen:
```
❌ Root Access - Native module not available
❌ LSPosed Module - Native module not available
❌ All Files Access - Native module not available
❌ Overlay Permission - Native module not available
```

**The app was not built correctly.** The native Android code is missing from your APK.

## Quick Fix (5 minutes)

### Option 1: Rebuild the App (Recommended)

1. **Open terminal in project folder**
   ```bash
   cd c:\Users\Administrator\Downloads\virtucam
   ```

2. **Run the build script**
   ```bash
   build-and-install.bat
   ```

3. **Wait for build to complete** (2-3 minutes)

4. **The APK will auto-install** on your connected device

### Option 2: Manual Build

1. **Clean previous build**
   ```bash
   cd android
   gradlew.bat clean
   cd ..
   ```

2. **Build release APK**
   ```bash
   cd android
   gradlew.bat assembleRelease
   cd ..
   ```

3. **Install APK**
   ```bash
   adb install -r android\app\build\outputs\apk\release\app-release.apk
   ```

## After Installing

1. ✅ Open VirtuCam
2. ✅ Grant root access (tap "Allow" when SuperSU/Magisk prompts)
3. ✅ Grant camera permission
4. ✅ Grant "All Files Access" in Settings
5. ✅ Grant "Display over other apps"
6. ✅ Open LSPosed Manager
7. ✅ Enable VirtuCam module
8. ✅ Add target apps (TikTok, Instagram, etc.)
9. ✅ **Reboot device**

## Why This Happens

VirtuCam uses **native Android code** (Kotlin/Java) to:
- Check root access
- Detect LSPosed
- Verify permissions
- Communicate with Xposed module

If you installed the app via:
- ❌ Expo Go
- ❌ Development server without building
- ❌ Incomplete build

The native code won't be included, causing "Native module not available" errors.

## Verify It's Fixed

After rebuilding, you should see:
```
✅ Root Access - Root access granted
✅ LSPosed Module - Module active in LSPosed (after reboot)
✅ All Files Access - All files access granted
✅ Camera Permission - Camera access granted
✅ Overlay Permission - Overlay permission granted
```

## Still Having Issues?

See [NATIVE_MODULE_FIX.md](NATIVE_MODULE_FIX.md) for detailed troubleshooting.

## Technical Details

The native module is defined in:
- `android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt`
- Registered in `MainApplication.kt`
- Provides 20+ native methods for system checks and configuration

Without building the native code, React Native can't access these methods, resulting in the error.
