# VirtuCam Installation Verification Checklist

Use this checklist to ensure VirtuCam is properly installed and configured.

## ☑️ Pre-Installation Requirements

- [ ] Device is rooted (Magisk/KernelSU/APatch)
- [ ] LSPosed is installed (Zygisk or Riru version)
- [ ] USB debugging is enabled
- [ ] Device is connected to computer via USB
- [ ] Android SDK/ADB is installed on computer

## ☑️ Build Process

- [ ] Ran `npm install` successfully
- [ ] Ran `cd android && gradlew.bat clean` (or `./gradlew clean` on Mac/Linux)
- [ ] Ran `gradlew.bat assembleRelease` successfully
- [ ] APK file exists at `android/app/build/outputs/apk/release/app-release.apk`
- [ ] No build errors in console output

## ☑️ Installation

- [ ] Uninstalled old version of VirtuCam (if any)
- [ ] Installed new APK via `adb install -r app-release.apk`
- [ ] Installation completed without errors
- [ ] App icon appears in device launcher

## ☑️ First Launch - Setup Screen

Open VirtuCam and verify each item:

### Root Access
- [ ] Shows "Root access granted" (not "Native module not available")
- [ ] If denied: Grant root permission when prompted by Magisk/KernelSU

### LSPosed Module
- [ ] Shows "Module active in LSPosed" OR "Enable module in LSPosed and add target apps to scope, then reboot"
- [ ] If not detected: Continue to LSPosed setup below

### All Files Access
- [ ] Shows "All files access granted"
- [ ] If denied: Tap "Grant Permission" → Enable "All files access" in Settings

### Camera Permission
- [ ] Shows "Camera access granted"
- [ ] If denied: Tap "Grant Permission" → Allow camera access

### Overlay Permission
- [ ] Shows "Overlay permission granted"
- [ ] If denied: Tap "Grant Permission" → Enable "Display over other apps"

## ☑️ LSPosed Configuration

1. Open LSPosed Manager (or KernelSU/Magisk if using parasitic LSPosed)
   - [ ] LSPosed Manager opens successfully

2. Navigate to Modules section
   - [ ] VirtuCam appears in the modules list
   - [ ] Module description shows: "VirtuCam - Virtual Camera Hook for Camera2/Camera1 APIs"

3. Enable VirtuCam module
   - [ ] Toggle switch is ON (enabled)

4. Configure module scope
   - [ ] Tap on VirtuCam module
   - [ ] Add target apps (e.g., TikTok, Instagram, Snapchat, Camera app)
   - [ ] At least one app is added to scope

5. Reboot device
   - [ ] Device rebooted successfully
   - [ ] Device boots normally

## ☑️ Post-Reboot Verification

1. Open VirtuCam again
   - [ ] All setup checks show green checkmarks (✅)
   - [ ] "Proceed to App" button is enabled

2. Tap "Proceed to App"
   - [ ] App navigates to main screen
   - [ ] No crashes or errors

## ☑️ Functionality Test

1. Configure a media source
   - [ ] Can select video/image from gallery
   - [ ] Media preview shows correctly

2. Enable virtual camera
   - [ ] Toggle switch works
   - [ ] No error messages

3. Test in target app
   - [ ] Open a target app (e.g., TikTok)
   - [ ] Open camera in target app
   - [ ] Virtual camera feed appears (shows selected media instead of real camera)

## ☑️ Troubleshooting (If Any Step Fails)

### "Native module not available" on all checks
→ See [QUICK_FIX.md](QUICK_FIX.md) - App needs to be rebuilt

### LSPosed module not detected after reboot
→ Check LSPosed logs in LSPosed Manager
→ Verify module is enabled and has apps in scope
→ Try rebooting again

### Virtual camera not working in target app
→ Verify target app is in LSPosed scope
→ Check VirtuCam logs (Settings → View Logs)
→ Try force-stopping target app and reopening

### App crashes on launch
→ Check logcat: `adb logcat | grep VirtuCam`
→ Verify all permissions are granted
→ Try clearing app data and relaunching

## ✅ Success Criteria

VirtuCam is properly installed when:
- ✅ All setup checks pass (green checkmarks)
- ✅ Can enable virtual camera without errors
- ✅ Virtual camera works in at least one target app
- ✅ Can switch between media sources
- ✅ App doesn't crash during normal use

## 📝 Notes

- **Reboot is required** after enabling module in LSPosed
- **Target apps must be in scope** for hooks to work
- **Root access is mandatory** - app won't work without it
- **LSPosed must be active** - verify in LSPosed Manager

## 🆘 Still Having Issues?

1. Check [NATIVE_MODULE_FIX.md](NATIVE_MODULE_FIX.md) for detailed troubleshooting
2. Review [QUICK_FIX.md](QUICK_FIX.md) for common solutions
3. Check GitHub Issues for similar problems
4. Collect logs: Settings → View Logs → Share logs
