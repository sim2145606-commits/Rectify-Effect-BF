# Java Version Compatibility Fix

## Problem

The Gradle build is failing with multiple errors:

```
Error resolving plugin [id: 'com.facebook.react.settings']
> 25.0.2
```

```
Unsupported class file major version 69
```

```
Connection to the Kotlin daemon has been unexpectedly lost
```

```
There is insufficient memory for the Java Runtime Environment to continue
```

## Root Cause

You are using **Java 25.0.2** (OpenJDK Corretto 25.0.2), but:

- Gradle 8.13 does not support Java 25 yet
- Class file major version 69 corresponds to Java 25
- The maximum Java version supported by Gradle 8.13 is Java 23
- React Native 0.81.5 and Expo SDK 54 are tested with Java 17 or Java 21 (LTS versions)
- The Kotlin compiler daemon is crashing due to Java 25 incompatibility
- Memory allocation failures are occurring due to JVM incompatibility

## Solution

### Option 1: Install Java 17 (Recommended - LTS)

1. Download Amazon Corretto 17 (LTS):
   - Visit: https://docs.aws.amazon.com/corretto/latest/corretto-17-ug/downloads-list.html
   - Download the Windows x64 MSI installer

2. Install Java 17 and set it as default, or use it specifically for this project

3. Set JAVA_HOME environment variable:

   ```powershell
   # Temporarily for current session
   $env:JAVA_HOME = "C:\Program Files\Amazon Corretto\jdk17.x.x"
   $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
   ```

4. Verify the Java version:

   ```powershell
   java -version
   ```

   Should show Java 17.x.x

5. Run the build again:
   ```powershell
   cd android
   .\gradlew assembleRelease
   ```

### Option 2: Install Java 21 (Alternative LTS)

1. Download Amazon Corretto 21 (LTS):
   - Visit: https://docs.aws.amazon.com/corretto/latest/corretto-21-ug/downloads-list.html
   - Download the Windows x64 MSI installer

2. Follow the same steps as Option 1, but with Java 21

### Option 3: Use gradle.properties to specify Java toolchain

Add this to `android/gradle.properties`:

```properties
# Force Java 17 toolchain
org.gradle.java.home=C:\\Program Files\\Amazon Corretto\\jdk17.x.x
```

### Option 4: Upgrade Gradle (Not Recommended Yet)

Wait for a Gradle version that supports Java 25, but this may cause compatibility issues with React Native 0.81.5.

## Recommended Action

**Install Java 17 (Amazon Corretto 17 LTS)** as it is:

- The most stable and tested version for React Native projects
- Fully supported by Gradle 8.13
- The recommended version for Expo SDK 54
- A Long-Term Support (LTS) release

## Quick Fix Commands (After Installing Java 17)

```powershell
# Set Java 17 for current PowerShell session
$env:JAVA_HOME = "C:\Program Files\Amazon Corretto\jdk17.x.x"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

# Verify
java -version

# Clean and rebuild
cd android
.\gradlew clean
.\gradlew assembleRelease
```

## Permanent Fix

To permanently set Java 17 as your default:

1. Open System Properties → Environment Variables
2. Add/Edit `JAVA_HOME` system variable: `C:\Program Files\Amazon Corretto\jdk17.x.x`
3. Edit `Path` system variable and add: `%JAVA_HOME%\bin`
4. Restart your terminal/IDE

## Additional Workarounds (If You Can't Install Java 17 Immediately)

### Workaround 1: Disable Kotlin Daemon

Add to `android/gradle.properties`:

```properties
kotlin.compiler.execution.strategy=in-process
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError
```

### Workaround 2: Stop All Gradle Daemons

```powershell
cd android
.\gradlew --stop
```

### Workaround 3: Clean Gradle Cache

```powershell
cd android
.\gradlew clean --no-daemon
```

**IMPORTANT**: These workarounds may allow the build to proceed but are NOT recommended for long-term use. Java 25 is simply not compatible with this project's toolchain. You MUST install Java 17 for stable builds.

## Verification

After fixing, you should see:

```
java -version
openjdk version "17.x.x" ...
```

And the build should succeed without the "Unsupported class file major version" error, Kotlin daemon crashes, or memory allocation failures.

## Current Build Status

Your build is failing because:

1. ✗ Java 25.0.2 is incompatible with Gradle 8.13
2. ✗ Kotlin compiler daemon cannot run on Java 25
3. ✗ Memory allocation failures due to JVM incompatibility
4. ✗ Fallback compilation strategies are also failing

**Action Required**: Install Java 17 (LTS) to resolve all these issues.
