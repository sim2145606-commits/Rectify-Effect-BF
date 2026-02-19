# VirtuCam Native Module Fix

## Problem
When opening the app, you see "Native module not available" for all checks in the setup screen.

## Root Cause
The native module `VirtuCamSettingsModule` was not compiled into the APK. This happens when:
1. The app was installed without building the native code
2. Using Expo Go (which doesn't support custom native modules)
3. The APK was built incorrectly

## Solution: Rebuild the App

### Prerequisites
1. **Android SDK** installed (API 34+)
2. **Node.js** (v18+)
3. **Java JDK** (v17+)
4. **Android device** with root access and LSPosed

### Step 1: Clean Previous Build
```bash
cd android
./gradlew clean
cd ..
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Build the APK
```bash
# For development build
npx expo run:android

# OR for release APK
cd android
./gradlew assembleRelease
cd ..
```

The APK will be located at:
`android/app/build/outputs/apk/release/app-release.apk`

### Step 4: Install on Device
```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

### Step 5: Grant Permissions
1. Open the app
2. Grant root access when prompted
3. Grant camera permission
4. Grant "All Files Access" in Settings
5. Grant "Display over other apps" permission

### Step 6: Enable in LSPosed
1. Open LSPosed Manager (or KernelSU/Magisk if using parasitic LSPosed)
2. Go to Modules
3. Enable "VirtuCam"
4. Add target apps to scope (e.g., TikTok, Instagram, Snapchat)
5. **Reboot your device**

## Verification

After rebuilding and installing, the setup screen should show:
- ✅ Root Access - Root access granted
- ✅ LSPosed Module - Module active in LSPosed
- ✅ All Files Access - All files access granted
- ✅ Camera Permission - Camera access granted
- ✅ Overlay Permission - Overlay permission granted

## Common Issues

### Issue 1: "Native module not available" persists
**Solution:** Make sure you built with `npx expo run:android` or `./gradlew assembleRelease`, NOT with Expo Go.

### Issue 2: LSPosed not detecting module
**Solution:** 
1. Check that `xposed_init` file exists in `android/app/src/main/assets/`
2. Verify AndroidManifest.xml has Xposed metadata
3. Reboot after enabling in LSPosed

### Issue 3: Root access denied
**Solution:**
1. Make sure your device is properly rooted (Magisk/KernelSU/APatch)
2. Grant root permission when the app requests it
3. Check root access with a root checker app

### Issue 4: Build fails
**Solution:**
```bash
# Clear gradle cache
cd android
./gradlew clean
rm -rf .gradle
cd ..

# Clear node modules
rm -rf node_modules
npm install

# Try building again
npx expo run:android
```

## Alternative: Use Pre-built APK

If you have access to a pre-built APK from GitHub Actions or releases:
1. Download the APK
2. Uninstall the old version
3. Install the new APK
4. Follow steps 5-6 above

## Technical Details

The native module provides these critical functions:
- `checkRootAccess()` - Verifies root by executing `su -c id`
- `checkXposedStatus()` - Detects LSPosed installation and module activation
- `checkAllFilesAccess()` - Checks MANAGE_EXTERNAL_STORAGE permission
- `checkOverlayPermission()` - Checks SYSTEM_ALERT_WINDOW permission
- `writeConfig()` - Writes configuration for Xposed module to read

Without the native module, none of these checks can run, resulting in "Native module not available" errors.
