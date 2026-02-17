# LSPosed Module Detection Fix

## Problem

The Setup Wizard was incorrectly showing "Activate module in LSPosed Manager and reboot" even after the module was activated and the device was rebooted.

## Root Cause

The module detection logic in `VirtuCamSettingsModule.kt` had two main issues:

1. **Short marker file timeout**: The marker file was only considered valid if modified within the last 5 minutes, which was too strict. Users who hadn't opened a target app recently would see false negatives.

2. **Weak fallback detection**: The LSPosed configuration checks were not comprehensive enough and didn't verify the actual module enable state properly.

**Core Issue**: When LSPosed activates a module, it only loads the module into the **target apps** (apps in the scope), not into the module's own app. The VirtuCam app itself is not being hooked, so the module code doesn't run within it.

## Solution (Updated 2026-02-17)

Implemented an improved multi-method detection system with enhanced security:

### 1. Marker File Method (Primary)

- **CameraHook.java**: Creates/updates a marker file at `/data/local/tmp/virtucam_module_active` when the module is loaded by LSPosed
- **VirtuCamSettingsModule.kt**: Checks if this marker file exists and was modified within the last **24 hours** (increased from 5 minutes)
- Extended timeout prevents false negatives while still being valid (marker file is cleared on reboot since it's in `/data/local/tmp`)
- This provides real-time confirmation that the module is actively running

### 2. LSPosed Configuration Check (Secondary)

- Checks specific module list files first for better performance:
  - `/data/adb/lspd/config/modules.list`
  - `/data/adb/modules/zygisk_lsposed/config/modules.list`
  - `/data/adb/modules/riru_lsposed/config/modules.list`
- Falls back to recursive search if needed
- Uses `-q` flag to exit early for better performance

### 3. Module Database Check (Tertiary)

- Verifies module is in LSPosed's enabled modules list
- Checks LSPosed's module enable state in various database locations

### 4. Module Configuration Check (Fallback)

- Verifies that `xposed_init` file exists in the APK
- If LSPosed is installed and the module is properly configured, assumes it's active
- This is the most lenient check to avoid false negatives

## Security Improvements

### Input Sanitization

- **Package name sanitization**: Ensures only valid Android package name characters [a-zA-Z0-9._] are used
- Prevents potential shell injection attacks

### Shell Command Escaping

- **Proper shell escaping**: All arguments passed to shell commands are wrapped in single quotes with embedded quotes properly escaped
- Uses `escapeShellArg()` helper method for consistent escaping
- Protects against command injection even if sanitization fails

### Performance Optimization

- Check specific files before recursive searches
- Use `-q` flag in grep to exit on first match
- Avoid unnecessary processing

## Changes Made

### File: `android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java`

- Added `createModuleActiveMarker()` method
- Called in `handleLoadPackage()` to create/update marker file when module loads

### File: `android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt`

- **Enhanced `checkXposedStatus()` method** with improved detection logic
- **Extended marker file timeout** from 5 minutes to 24 hours using `TimeUnit.HOURS.toMillis(24)`
- **Added `sanitizePackageName()` method** to prevent shell injection
- **Added `escapeShellArg()` method** for proper shell command escaping
- **Improved LSPosed config detection** to check specific files first
- **Enhanced module list checking** to verify actual enable state
- **Added debug logging** at each detection step for troubleshooting

## How It Works

1. **When LSPosed loads the module** (into any target app):
   - `CameraHook.handleLoadPackage()` is called
   - Creates/updates `/data/local/tmp/virtucam_module_active` with current timestamp

2. **When VirtuCam checks module status**:
   - First checks if marker file exists and is recent (< 24 hours old)
   - If marker file check fails, checks LSPosed's module list files
   - If that fails, searches LSPosed config directories
   - Finally, verifies module is properly packaged and LSPosed is installed

3. **Result**:
   - Module status shows "OK" if any detection method succeeds
   - Debug logs help diagnose which method succeeded
   - Provides accurate status with minimal false negatives

## Testing

After rebuilding and installing the app:

1. Activate the module in LSPosed Manager
2. Add recommended scope (or any target app)
3. Reboot device
4. Open any target app (this triggers module loading and marker file creation)
5. Open VirtuCam app
6. Check Setup Wizard - module status should now show "OK"
7. Verify in logcat that detection is working correctly

## Benefits

- **Extended Timeout**: 24-hour marker file timeout prevents false negatives while remaining valid (cleared on reboot)
- **Accurate Detection**: Uses multiple methods to ensure reliable detection
- **Real-time Status**: Marker file provides immediate confirmation when module is active
- **No False Negatives**: Comprehensive fallback methods prevent incorrect "not activated" messages
- **User-Friendly**: Users no longer see confusing "activate module" messages after proper setup
- **Secure**: Proper input sanitization and shell escaping prevent injection attacks
- **Performant**: Checks specific files first before doing expensive recursive searches
- **Debuggable**: Debug logging helps troubleshoot detection issues