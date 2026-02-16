# Gradle Build Fix - "No matching variant" Error (UPDATED)

## Problem

The Expo build was failing with "No matching variant" errors for all React Native native modules:

- `react-native-async-storage/async-storage`
- `@react-native-community/datetimepicker`
- `react-native-gesture-handler`
- `react-native-reanimated`
- `react-native-safe-area-context`
- `react-native-screens`
- `react-native-svg`
- `react-native-webview`
- `react-native-worklets`

## Root Cause Analysis

### Initial Diagnosis (Incorrect)

Initially thought AGP 8.11.0 was too new and tried to downgrade to AGP 8.9.0.

### Actual Root Cause (Correct)

The AGP version is **controlled by Expo's autolinking system**, not by the `android/build.gradle` classpath. Expo SDK 54 enforces AGP 8.11.0, which requires **Gradle 8.13+** (not 8.11 or 8.14.3).

The "No matching variant" errors occur because:

1. AGP 8.11.0 is enforced by Expo
2. The React Native native modules in the project don't yet support AGP 8.11.0
3. Their `build.gradle` files fail to apply the Android plugin, producing zero variants

## Solution Applied

### 1. Set Correct Gradle Version

**File:** [`android/gradle/wrapper/gradle-wrapper.properties`](android/gradle/wrapper/gradle-wrapper.properties:3)

AGP 8.11.0 requires **Gradle 8.13** minimum (not 8.11, not 8.14.3):

```properties
distributionUrl=https\://services.gradle.org/distributions/gradle-8.13-bin.zip
```

### 2. Explicitly Set AGP Version

**File:** [`android/build.gradle`](android/build.gradle:9)

```gradle
dependencies {
  classpath('com.android.tools.build:gradle:8.11.0')  // ← Match Expo's requirement
  classpath('com.facebook.react:react-native-gradle-plugin')
  classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')
}
```

### 3. Configure EAS Build Image

**File:** [`eas.json`](eas.json:17)

```json
{
  "build": {
    "production": {
      "autoIncrement": true,
      "android": {
        "buildType": "apk",
        "image": "latest"
      }
    }
  }
}
```

Using `"image": "latest"` ensures the EAS build server has:

- Android SDK 36
- Build Tools 36.0.0
- NDK 27.1.12297006
- JDK 21
- Compatible with AGP 8.11.0

## AGP ↔ Gradle Compatibility Matrix

| AGP Version | Minimum Gradle | Maximum Gradle |
| ----------- | -------------- | -------------- |
| 8.6.x       | 8.7            | 8.9            |
| 8.7.x       | 8.9            | 8.10           |
| 8.9.x       | 8.11           | 8.12           |
| 8.10.x      | 8.13           | 8.14           |
| 8.11.x      | **8.13**       | 8.14+          |

**Current Configuration:**

- AGP: **8.11.0** (enforced by Expo SDK 54)
- Gradle: **8.13** ✓
- Build Image: **latest** ✓

## Next Steps - Update Native Libraries

The "No matching variant" errors will persist until the native libraries support AGP 8.11.0. Update them using Expo's installer:

```bash
npx expo install \
  @react-native-async-storage/async-storage \
  @react-native-community/datetimepicker \
  react-native-gesture-handler \
  react-native-reanimated \
  react-native-safe-area-context \
  react-native-screens \
  react-native-svg \
  react-native-webview \
  react-native-worklets
```

This ensures Expo-compatible versions are selected that support AGP 8.11.0.

### Verify Package Compatibility

After updating, run diagnostics:

```bash
npx expo-doctor
```

Fix any warnings about version mismatches between installed packages and your Expo SDK version.

## Rebuild Instructions

### For EAS Build (Recommended)

```bash
# Clear cache and rebuild
eas build --platform android --clear-cache
```

### For Local Build

```bash
# Clean build artifacts
cd android
rmdir /s /q .gradle
rmdir /s /q build
rmdir /s /q app\build
cd ..

# Rebuild
npx expo run:android
```

## Nuclear Option (If Issues Persist)

If updating libraries doesn't resolve the "No matching variant" errors, regenerate the entire Android directory:

```bash
# Backup any custom native code first!
rm -rf android
npx expo prebuild --platform android --clean
```

This forces Expo to regenerate `android/` using the template matching your current SDK version, with all correct AGP/Gradle/Kotlin versions.

## Why the Previous Fix Failed

**Attempted:** Downgrade AGP to 8.9.0 + Gradle 8.11
**Result:** Failed because:

1. AGP version is controlled by Expo's autolinking system (see [`android/settings.gradle`](android/settings.gradle:10-17))
2. The `classpath` change in `build.gradle` was overridden by Expo plugins
3. Expo SDK 54 enforces AGP 8.11.0, which requires Gradle 8.13+ (not 8.11)

**Correct Approach:** Accept AGP 8.11.0, use Gradle 8.13, and update native libraries to compatible versions.

## Key Learnings

1. **Don't fight Expo's AGP version** - It's enforced by the SDK version
2. **AGP 8.11.0 requires Gradle 8.13+** - Not 8.11, not 8.14.3
3. **Use `npx expo install`** - Ensures Expo-compatible library versions
4. **Use `"image": "latest"`** - Ensures EAS build server has compatible tools
5. **Check `android/settings.gradle`** - Shows where AGP is actually controlled

## References

- [Gradle ↔ AGP Compatibility Matrix](https://developer.android.com/build/releases/gradle-plugin#updating-gradle)
- [Expo SDK 54 Release Notes](https://expo.dev/changelog/2024/12-17-sdk-54)
- [React Native Gradle Plugin Docs](https://reactnative.dev/docs/gradle-plugin)
- [EAS Build Server Images](https://docs.expo.dev/build-reference/infrastructure/)
