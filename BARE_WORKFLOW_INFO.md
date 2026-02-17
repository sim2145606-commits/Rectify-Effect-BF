# Bare Workflow Information

This project uses **Expo's bare workflow**, which means it contains native Android project folders with custom native code.

## Why the Expo Doctor Warning?

When running `expo doctor`, you may see this warning:

```
✖ Check for app config fields that may not be synced in a non-CNG project
This project contains native project folders but also has native configuration
properties in app.json, indicating it is configured to use Prebuild.
```

### This warning is expected and can be safely ignored for this project.

## Explanation

- **Bare Workflow**: This project has custom native modules (e.g., `CameraHook.java`, `VirtuCamSettingsModule.kt`) that require direct access to native Android code.
- **app.json Configuration**: The properties in `app.json` (like `orientation`, `icon`, `scheme`, etc.) are still useful for:
  - Expo CLI tooling during development
  - Expo Go for testing
  - Documentation of the app's configuration
- **EAS Build**: When using EAS Build with a bare workflow project, these properties are NOT automatically synced to the native projects. Instead, native configuration must be manually managed in:
  - `android/app/src/main/AndroidManifest.xml`
  - `android/app/build.gradle`
  - Other native Android configuration files

## What This Means for Development

1. **Native configuration changes** must be made directly in the `android/` folder
2. **app.json properties** serve as documentation but won't automatically update the native projects
3. **Don't add `/android` to `.gitignore`** as suggested by the warning - this would break the custom native code

## References

- [Expo Bare Workflow Documentation](https://docs.expo.dev/bare/overview/)
- [Understanding EAS Build and Native Projects](https://docs.expo.dev/workflow/prebuild/#usage-with-eas-build)
