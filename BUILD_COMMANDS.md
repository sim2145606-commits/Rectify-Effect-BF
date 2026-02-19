# Quick Build Commands

## Execute these commands in order:

### 1. Clean Build Cache
```bash
cd android
gradlew clean
cd ..
```

### 2. Rebuild with Native Code
```bash
npx expo run:android
```

### 3. Monitor Logs (in a separate terminal)
```bash
adb logcat | findstr "VirtuCam"
```

## Expected Results

### Logcat Output:
```
VirtuCam: 🚀 Application starting...
VirtuCam: BuildConfig.DEBUG = true
VirtuCam: BuildConfig.IS_NEW_ARCHITECTURE_ENABLED = false
VirtuCamSettings: 📦 Creating native modules...
VirtuCamSettings: ✅ Native module registered successfully!
VirtuCamSettings: 📦 Module created: VirtuCamSettings
VirtuCam: ✅ Application initialized successfully
```

### Metro Console Output:
```
🔍 Native Module Diagnostic: {
  platform: 'android',
  nativeModuleExists: true,
  availableMethods: [...]
}
```

### App Behavior:
- ✅ Root Access: Shows actual status (not "Native module not available")
- ✅ LSPosed Module: Shows actual status
- ✅ All Files Access: Shows actual status
- ✅ Overlay Permission: Shows actual status

## If Build Fails

### Complete Clean Rebuild:
```bash
adb uninstall com.briefplantrain.virtucam
cd android
gradlew clean --no-daemon
cd ..
npx expo run:android
```

### If Metro Cache Issues:
```bash
taskkill /F /IM node.exe /T
npx expo start --clear
```

---

**Total Time:** ~5-10 minutes for build
**Success Indicator:** All permission checks show actual status instead of "Native module not available"
