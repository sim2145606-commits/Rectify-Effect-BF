// Test file to reproduce the Gradle build issues
// Issue 1: expo-module-gradle-plugin not found
// Issue 2: Could not get unknown property 'release' for SoftwareComponent

// The errors occur because:
// 1. expo-image-loader/android/build.gradle tries to apply 'expo-module-gradle-plugin'
//    but the plugin is not properly configured in settings.gradle
// 2. ExpoModulesCorePlugin.gradle tries to access components.release which doesn't
//    exist in Gradle 8.10.2 (it was changed to components.java in newer Gradle versions)

console.log('Gradle build issues identified:');
console.log('1. Missing expo-module-gradle-plugin configuration');
console.log('2. Incompatible component reference in ExpoModulesCorePlugin.gradle');
console.log('3. Expo SDK 52 may have compatibility issues with Gradle 8.10.2');
