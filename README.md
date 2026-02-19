
## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔧 Troubleshooting

### "Native Module Not Available" Error

If you see this error on all setup checks, the app needs to be rebuilt with native code included.

**Quick Fix:**
```bash
# Run the automated build script
build-and-install.bat

# OR manually build
cd android
gradlew.bat assembleRelease
cd ..
adb install -r android\app\build\outputs\apk\release\app-release.apk
```

See [QUICK_FIX.md](QUICK_FIX.md) for detailed instructions.

### LSPosed Module Not Detected

1. Make sure LSPosed is installed (Zygisk or Riru version)
2. Enable VirtuCam in LSPosed Manager
3. Add target apps to the module scope
4. **Reboot your device** (required for module activation)

### Root Access Denied

1. Verify your device is rooted (use a root checker app)
2. Grant root permission when VirtuCam requests it
3. Check that Magisk/KernelSU/APatch is working properly

### Build Fails

```bash
# Clear all caches
cd android
gradlew.bat clean
rmdir /s /q .gradle
cd ..
rmdir /s /q node_modules
npm install

# Rebuild
npx expo run:android
```

### More Help

- [NATIVE_MODULE_FIX.md](NATIVE_MODULE_FIX.md) - Detailed native module troubleshooting
- [QUICK_FIX.md](QUICK_FIX.md) - Fast solutions for common issues
- Check GitHub Issues for similar problems

