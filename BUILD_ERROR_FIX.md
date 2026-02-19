# Build Error Fix

## Error You're Seeing
```
Error resolving plugin [id: 'expo-autolinking-settings']
> Included build 'node_modules\expo-modules-autolinking\android\expo-gradle-plugin' does not exist.
```

## Cause
The `node_modules` folder is incomplete or corrupted.

## Fix (2 Steps)

### Step 1: Fix Dependencies
```bash
fix-dependencies.bat
```

This will:
- Remove old node_modules
- Remove package-lock.json
- Reinstall everything fresh

### Step 2: Build
```bash
quick-build.bat
```

This will build and install the app automatically.

## Alternative: Manual Fix

```bash
# 1. Clean
rmdir /s /q node_modules
del package-lock.json

# 2. Reinstall
npm install

# 3. Build
npx expo run:android --variant release
```

## If Still Failing

Try clearing npm cache:
```bash
npm cache clean --force
fix-dependencies.bat
quick-build.bat
```

## GitHub Actions Build

Since you mentioned committing to GitHub, you can also:
1. Push your code to GitHub
2. Let GitHub Actions build the APK
3. Download the APK from Actions artifacts
4. Install on your device

Check `.github/workflows/android_build.yml` for the automated build.
