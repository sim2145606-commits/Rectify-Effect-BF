# Build APK on GitHub

## Setup

1. **Commit and push all changes to GitHub:**
   ```bash
   git add .
   git commit -m "Add BuildConfig fix and GitHub Actions workflow"
   git push origin main
   ```

2. **GitHub Actions will automatically build the APK**
   - Go to your repository on GitHub
   - Click "Actions" tab
   - You'll see the build running
   - Wait 10-15 minutes for the build to complete

3. **Download the APK:**
   - Once the build is complete (green checkmark)
   - Click on the workflow run
   - Scroll down to "Artifacts"
   - Download "app-release"
   - Extract the ZIP to get `app-release.apk`

## Manual Trigger

You can also manually trigger a build:
1. Go to Actions tab
2. Click "Build APK" workflow
3. Click "Run workflow" button
4. Select branch (main)
5. Click "Run workflow"

## Install APK on Device

```bash
adb install -r app-release.apk
```

## Verify the Fix

After installing, check logcat:
```bash
adb logcat | findstr "VirtuCam"
```

Expected output:
```
VirtuCam: 🚀 Application starting...
VirtuCam: BuildConfig.DEBUG = true
VirtuCam: BuildConfig.IS_NEW_ARCHITECTURE_ENABLED = false
VirtuCamSettings: 📦 Creating native modules...
VirtuCamSettings: ✅ Native module registered successfully!
```

## Cleanup Done

Removed:
- ✅ node_modules/ (will be reinstalled by GitHub Actions)
- ✅ .expo/ cache
- ✅ android/.gradle/ cache
- ✅ android/app/build/ outputs
- ✅ android/build/ outputs
- ✅ *.log files

The project is now clean and ready to push to GitHub.
