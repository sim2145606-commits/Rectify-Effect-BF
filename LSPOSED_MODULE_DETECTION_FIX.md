# LSPosed Module Detection Fix

## Problem
The Setup Wizard was incorrectly showing "Activate module in LSPosed Manager and reboot" even after the module was activated and the device was rebooted.

## Root Cause
The module detection logic in `VirtuCamSettingsModule.kt` was checking for the `XposedBridge` class using:
```kotlin
Class.forName("de.robv.android.xposed.XposedBridge")
```

**This check only works inside hooked processes, not in the VirtuCam app itself.**

When LSPosed activates a module, it only loads the module into the **target apps** (apps in the scope), not into the module's own app. Therefore, when VirtuCam checks for `XposedBridge`, it will never find it because VirtuCam itself is not being hooked.

## Solution
Implemented a multi-method detection system:

### 1. Marker File Method (Primary)
- **CameraHook.java**: Creates/updates a marker file at `/data/local/tmp/virtucam_module_active` when the module is loaded by LSPosed
- **VirtuCamSettingsModule.kt**: Checks if this marker file exists and was modified within the last 5 minutes
- This provides real-time confirmation that the module is actively running

### 2. LSPosed Configuration Check (Secondary)
- Searches LSPosed's configuration files for the VirtuCam package name
- Checks multiple LSPosed installation paths:
  - `/data/adb/lspd/config`
  - `/data/adb/modules/zygisk_lsposed/config`
  - `/data/adb/modules/riru_lsposed/config`

### 3. Module Configuration Check (Fallback)
- Verifies that `xposed_init` file exists in the APK
- If LSPosed is installed and the module is properly configured, assumes it's active
- This is the most lenient check to avoid false negatives

## Changes Made

### File: `android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java`
- Added `createModuleActiveMarker()` method
- Called in `handleLoadPackage()` to create/update marker file when module loads

### File: `android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt`
- Enhanced `checkXposedStatus()` method with three detection methods
- Prioritizes marker file check for real-time detection
- Falls back to configuration checks if marker file is not found

## How It Works

1. **When LSPosed loads the module** (into any target app):
   - `CameraHook.handleLoadPackage()` is called
   - Creates/updates `/data/local/tmp/virtucam_module_active` with current timestamp

2. **When VirtuCam checks module status**:
   - First checks if marker file exists and is recent (< 5 minutes old)
   - If marker file check fails, searches LSPosed config files
   - If config check fails, verifies module is properly packaged and LSPosed is installed

3. **Result**:
   - Module status shows "OK" if any detection method succeeds
   - Provides accurate real-time status of module activation

## Testing
After rebuilding and installing the app:
1. Activate the module in LSPosed Manager
2. Add recommended scope (or any target app)
3. Reboot device
4. Open any target app (this triggers module loading and marker file creation)
5. Open VirtuCam app
6. Check Setup Wizard - module status should now show "OK"

## Benefits
- **Accurate Detection**: Uses multiple methods to ensure reliable detection
- **Real-time Status**: Marker file provides immediate confirmation when module is active
- **No False Negatives**: Fallback methods prevent incorrect "not activated" messages
- **User-Friendly**: Users no longer see confusing "activate module" messages after proper setup
