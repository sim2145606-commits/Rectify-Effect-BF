# LSPosed Module Detection Issue

## Problem Description

The VirtuCam app's Setup Wizard page continues to show "Activate module in LSPosed Manager and reboot" even after:

1. Activating the LSPosed module (VirtuCam) in LSPosed Manager
2. Adding scope applications for testing
3. Rebooting the device

When clicking "Open LSPosed Manager ->", the app opens the VirtuCam app settings instead of LSPosed Manager, which is expected since LSPosed Manager is parasitic and cannot be opened as a standalone app.

**Device Environment:**

- AOSP Custom ROM: Pixel OS Android 16
- Root: KernelSU + Susfs
- LSPosed: ReLSPosed (fork by ThePedroo, JingMatrix and LSPosed Developers)

## Root Cause Analysis

The detection logic has multiple fallback methods but may not be compatible with all LSPosed forks, especially ReLSPosed on Android 16.

## Key Files Responsible

### 1. **VirtuCamSettingsModule.kt** (Primary Detection Logic)

**Path:** `android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt`

**Key Method:** `checkXposedStatus()` (Lines 268-401)

**Detection Methods Used:**

1. **XposedBridge Class Check** (Lines 275-280): Checks if `de.robv.android.xposed.XposedBridge` class exists
2. **LSPosed Directory Check** (Lines 286-292): Checks for `/data/adb/lspd`, `/data/adb/modules/zygisk_lsposed`, `/data/adb/modules/riru_lsposed`
3. **LSPosed Manager Package Check** (Lines 295-301): Checks for `org.lsposed.manager` package
4. **Root Command Check** (Lines 305-310): Uses `su` to check LSPosed directories
5. **Marker File Check** (Lines 319-331): Checks `/data/local/tmp/virtucam_module_active` with 24-hour timeout
6. **LSPosed Config Check** (Lines 334-351): Greps for package name in LSPosed config files
7. **Module List Check** (Lines 356-370): Checks if module is in LSPosed's enabled modules list
8. **xposed_init Fallback** (Lines 373-384): Checks if `xposed_init` file exists in APK

**Issues:**

- The marker file (`/data/local/tmp/virtucam_module_active`) is only created when the module hooks a target app (see CameraHook.java line 177)
- If no target app has been opened yet, the marker file won't exist
- LSPosed config paths may differ in ReLSPosed fork
- The detection assumes standard LSPosed directory structure

### 2. **CameraHook.java** (Marker File Creation)

**Path:** `android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java`

**Key Method:** `createModuleActiveMarker()` (Lines 209-221)

**Issue:**

- The marker file is created in `handleLoadPackage()` (line 177) which only runs when a hooked app is launched
- If the user hasn't opened any target app after activating the module, the marker file won't exist
- This creates a chicken-and-egg problem: the app says "activate module" but the module IS active, just hasn't been triggered yet

### 3. **PermissionManager.ts** (Frontend Detection)

**Path:** `services/PermissionManager.ts`

**Key Method:** `checkLSPosedModule()` (Lines 64-102)

**Issue:**

- Calls native `VirtuCamSettings.checkXposedStatus()`
- Returns "Activate module in LSPosed Manager and reboot" when `moduleActive` is false
- The "Open LSPosed Manager" button (line 332-346) tries to open `package:org.lsposed.manager` which may not work for parasitic LSPosed

### 4. **onboarding.tsx** (UI Display)

**Path:** `app/onboarding.tsx`

**Relevant Lines:** 125-132

Shows the LSPosed Module permission item with the misleading button.

## Proposed Solutions

### Solution 1: Improve Marker File Detection

Instead of relying on the marker file being created when an app is hooked, create it during module initialization in a more reliable way.

### Solution 2: Better LSPosed Fork Detection

Add detection for ReLSPosed-specific paths and configurations:

- Check for ReLSPosed-specific directories
- Check for different config file locations used by forks
- Add logging to show which detection method succeeded/failed

### Solution 3: Alternative Detection Method

Check if the module is listed in LSPosed's scope configuration directly, without requiring the marker file:

- Parse LSPosed's database files
- Check module enable state in LSPosed's internal storage
- Use LSPosed API if available

### Solution 4: Improve User Feedback

- Show more detailed status (e.g., "Module enabled but not yet triggered - open a target app")
- Add a "Test Module" button that opens a target app to trigger the hook
- Display which detection methods passed/failed for debugging

### Solution 5: Fix "Open LSPosed Manager" Button

For parasitic LSPosed managers, the button should:

- Open the Xposed/LSPosed section in the root manager app (e.g., KernelSU)
- Or provide instructions on how to access LSPosed Manager
- Or open the module list directly if possible

## Testing Recommendations

1. Add debug logging to show which detection methods are being tried
2. Test with ReLSPosed specifically on Android 16
3. Verify marker file creation happens reliably
4. Test the detection immediately after module activation (before opening any target app)
5. Check if `/data/adb/lspd` or other paths exist on the test device

## Additional Context

The module uses `XSharedPreferences` for configuration and creates a marker file at `/data/local/tmp/virtucam_module_active` which is cleared on reboot. The 24-hour timeout (line 24 in VirtuCamSettingsModule.kt) may be too long for some use cases.

The detection logic is comprehensive but may need adaptation for:

- Different LSPosed forks (ReLSPosed, LSPosed Zygisk, etc.)
- Different Android versions (Android 16 is very new)
- Different root solutions (KernelSU vs Magisk)
- Parasitic vs standalone LSPosed Manager implementations
