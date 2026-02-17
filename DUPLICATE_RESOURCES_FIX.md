# Duplicate Android Resources Fix

## Issue
The Android build was failing with duplicate resource errors during the Gradle build process:

```
ERROR: [mipmap-hdpi-v4/ic_launcher_foreground] Resource and asset merger: Duplicate resources
ERROR: [mipmap-hdpi-v4/ic_launcher_round] Resource and asset merger: Duplicate resources
```

## Root Cause
Both PNG and WebP versions of launcher icons existed in all mipmap density folders:
- `ic_launcher_foreground.png` and `ic_launcher_foreground.webp`
- `ic_launcher_round.png` and `ic_launcher_round.webp`

Android's resource merger treats files with the same resource name but different extensions as duplicates when they serve the same purpose.

## Solution
Removed all PNG versions of the launcher icons, keeping only the WebP versions because:
- WebP is the modern, recommended format for Android
- WebP provides better compression and smaller file sizes
- WebP is supported on all modern Android versions
- The adaptive icon XML files reference `@mipmap/ic_launcher_foreground` which correctly resolves to the WebP version

## Files Removed
- `android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png`

## Prevention
To prevent this issue in the future:
1. Always use a single format for Android resources (prefer WebP for images)
2. When generating or updating launcher icons, ensure only one format is used per resource
3. Run `./gradlew clean` before builds to catch resource conflicts early
4. Use Android Studio's built-in icon generator which creates icons in the correct format

## Verification
After the fix, the Android resource structure contains:
- WebP icons in all density folders (hdpi, mdpi, xhdpi, xxhdpi, xxxhdpi)
- XML adaptive icon descriptors in mipmap-anydpi-v26
- No duplicate resources

## Related
- See `ICONS_DOCUMENTATION.md` for more information about app icons
