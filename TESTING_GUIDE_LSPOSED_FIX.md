# Testing Guide: LSPosed Detection Fix for ReLSPosed/Android 16

## What Was Fixed?

This fix resolves the issue where VirtuCam incorrectly showed "Activate module in LSPosed Manager and reboot" even after proper activation, especially on:

- **ReLSPosed** (fork by ThePedroo, JingMatrix)
- **Android 16**
- **KernelSU + Susfs**
- **Parasitic LSPosed implementations**

## Key Improvements

### 1. Detection Works Immediately ✅

- No need to launch target apps first
- Module status shows correctly right after reboot
- Checks actual module and scope configuration

### 2. ReLSPosed Support ✅

- Detects all LSPosed variants (Standard, Zygisk, Riru, ReLSPosed)
- Checks multiple configuration paths
- Compatible with Android 16

### 3. Fixed "Open LSPosed Manager" Button ✅

- Opens the correct app for your setup
- For parasitic LSPosed: opens KernelSU or Magisk
- For standalone LSPosed: opens LSPosed Manager

### 4. Better Error Messages ✅

- Clear instructions: "Enable module in LSPosed and add target apps to scope, then reboot"
- Helpful diagnostics available

## How to Test

### Step 1: Build and Install

```bash
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Or use the provided APK if available.

### Step 2: Configure LSPosed

1. Open LSPosed Manager (via KernelSU or standalone)
2. Find VirtuCam in the modules list
3. **Enable the module** ☑️
4. **Add scope applications** (important!)
   - Recommended: Camera, Instagram, Zoom, Google Meet
   - At least add 2-3 apps for testing
5. Reboot your device

### Step 3: Test Detection (Before Launching Any App)

1. **Immediately after reboot**, open VirtuCam app
2. Go to the Setup Wizard / Onboarding screen
3. Check the "LSPosed Module" status

**Expected Result**: Should show ✅ "Module active in LSPosed"

**Previous Behavior**: Would incorrectly show ❌ "Activate module in LSPosed Manager and reboot"

### Step 4: Test "Open LSPosed Manager" Button

1. Click the "Open LSPosed Manager" button
2. **Expected Results**:
   - **If using KernelSU**: Opens KernelSU app
   - **If using Magisk**: Opens Magisk app
   - **If standalone LSPosed**: Opens LSPosed Manager
   - Should NOT open VirtuCam app settings

### Step 5: Verify Module Actually Works

1. Configure VirtuCam with a video file
2. Open a target app (e.g., Camera)
3. Check if virtual camera is working
4. Module should inject video successfully

## Troubleshooting

### Module Still Shows as Inactive?

**Check 1: Verify Module is Enabled**

```bash
adb shell "su -c 'grep virtucam /data/adb/lspd/config/modules.list'"
```

Should output: `com.briefplantrain.virtucam`

**Check 2: Verify Scopes are Configured**

```bash
adb shell "su -c 'ls -la /data/adb/lspd/config/scope/com.briefplantrain.virtucam/'"
```

Should show files for each scoped app.

**Check 3: View Logs**

```bash
adb logcat -s VirtuCam:* LSPosed:* Xposed:*
```

Look for messages like:

- "Module active via scope configuration check"
- "Module active via LSPosed config check"

### For ReLSPosed Users

If detection still fails, check these specific paths:

```bash
# Check ReLSPosed installation
adb shell "su -c 'ls -la /data/adb/modules/lsposed/'"

# Check module list in ReLSPosed
adb shell "su -c 'cat /data/adb/modules/lsposed/config/modules.list'"

# Check scope config
adb shell "su -c 'ls -la /data/adb/modules/lsposed/config/scope/com.briefplantrain.virtucam/'"
```

### "Open LSPosed Manager" Doesn't Work

The button should now work, but if it doesn't:

**For Parasitic LSPosed (ReLSPosed)**:

1. Manually open KernelSU Manager
2. Find "Modules" section
3. Access LSPosed from there

**For Standalone LSPosed**:

1. Check if LSPosed Manager is installed
2. Try opening from app drawer
3. Package name should be `org.lsposed.manager`

## What to Report

If you encounter issues, please report:

### 1. Basic Info

- Android version
- Device model
- Root solution (KernelSU, Magisk, APatch)
- LSPosed variant (Standard, Zygisk, Riru, ReLSPosed)

### 2. Detection Status

Screenshot of the LSPosed Module permission in VirtuCam

### 3. Configuration Check

Output from:

```bash
# Module list
adb shell "su -c 'grep virtucam /data/adb/lspd/config/modules.list 2>/dev/null || \
  grep virtucam /data/adb/modules/*/config/modules.list 2>/dev/null'"

# Scope configuration
adb shell "su -c 'ls -la /data/adb/lspd/config/scope/com.briefplantrain.virtucam/ 2>/dev/null || \
  ls -la /data/adb/modules/*/config/scope/com.briefplantrain.virtucam/ 2>/dev/null'"

# LSPosed variant
adb shell "su -c 'ls -d /data/adb/lspd /data/adb/modules/*lsposed* 2>/dev/null'"
```

### 4. Logs

```bash
adb logcat -d -s VirtuCam:* LSPosed:* Xposed:* > virtucam_debug.log
```

Attach the log file.

## Success Criteria

✅ Module status shows as active immediately after reboot
✅ No need to launch target apps first
✅ "Open LSPosed Manager" button opens correct app
✅ Error messages are clear and actionable
✅ Works with ReLSPosed on Android 16

## Additional Notes

### Supported LSPosed Variants

| Variant           | Module List Path                                       | Status |
| ----------------- | ------------------------------------------------------ | ------ |
| Standard LSPosed  | `/data/adb/lspd/config/modules.list`                   | ✅     |
| Zygisk LSPosed    | `/data/adb/modules/zygisk_lsposed/config/modules.list` | ✅     |
| Riru LSPosed      | `/data/adb/modules/riru_lsposed/config/modules.list`   | ✅     |
| Generic/ReLSPosed | `/data/adb/modules/lsposed/config/modules.list`        | ✅     |
| Alternative       | `/data/adb/lspd/modules.list`                          | ✅     |

### Backward Compatibility

All changes are backward compatible:

- Works with older LSPosed versions
- Graceful fallbacks for unsupported configurations
- No breaking changes to existing functionality

### Performance

- Detection runs only when checking permissions
- Fast file existence checks (< 1ms typically)
- Root commands only used as fallback
- Minimal battery impact

---

**Last Updated**: 2026-02-17  
**Version**: 2.1  
**Status**: Ready for Testing  
**Target**: ReLSPosed + Android 16 + KernelSU
