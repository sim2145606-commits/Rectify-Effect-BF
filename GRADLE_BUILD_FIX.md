# Gradle Build Fix - "No matching variant" Error

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

## Root Cause
The build was using:
- **Gradle 8.14.3** (latest)
- **AGP 8.11.0** (implicitly, latest compatible with Gradle 8.14.3)
- **compileSdk 36** (Android 15)

AGP 8.11.0 is too new for the React Native native modules in the project. These libraries' `build.gradle` files don't yet support AGP 8.11.0, causing them to fail plugin application and produce zero Android library variants.

## Solution Applied

### 1. Downgraded Android Gradle Plugin (AGP)
**File:** [`android/build.gradle`](android/build.gradle:9)
```gradle
dependencies {
  classpath('com.android.tools.build:gradle:8.9.0')  // ← Explicitly set to 8.9.0
  classpath('com.facebook.react:react-native-gradle-plugin')
  classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')
}
```

### 2. Adjusted Gradle Wrapper Version
**File:** [`android/gradle/wrapper/gradle-wrapper.properties`](android/gradle/wrapper/gradle-wrapper.properties:3)
```properties
distributionUrl=https\://services.gradle.org/distributions/gradle-8.11-bin.zip
```

## AGP ↔ Gradle Compatibility
| AGP Version | Minimum Gradle | Recommended Gradle |
|-------------|----------------|-------------------|
| 8.6.x       | 8.7            | 8.9               |
| 8.7.x       | 8.9            | 8.10              |
| 8.9.x       | 8.11           | 8.11              |
| 8.11.x      | 8.14           | 8.14              |

**Current Configuration:**
- AGP: **8.9.0** ✓
- Gradle: **8.11** ✓
- Compatible with Expo SDK 54 and all React Native native modules

## Next Steps

### Clean Build (Required)
Before rebuilding, clean all cached build artifacts:

```bash
# On Windows (cmd.exe)
cd android
rmdir /s /q .gradle
rmdir /s /q build
rmdir /s /q app\build
cd ..

# Or on Unix/Mac/PowerShell
cd android
rm -rf .gradle build app/build
cd ..
```

### Rebuild
```bash
# Local development build
npx expo run:android

# Or EAS build
eas build --platform android
```

## Alternative Solution (If Issues Persist)
If the build still fails, you can try updating all native libraries to their latest versions:

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

Using `npx expo install` ensures Expo-compatible versions are selected.

## References
- [Gradle ↔ AGP Compatibility Matrix](https://developer.android.com/build/releases/gradle-plugin#updating-gradle)
- [Expo SDK 54 Release Notes](https://expo.dev/changelog/2024/12-17-sdk-54)
- [React Native Gradle Plugin Docs](https://reactnative.dev/docs/gradle-plugin)
