# AI Fix Prompt Guide — VirtuCam project-problems.json
## Amazon Q Security & Quality Findings — Ready-to-Use AI Prompts

**Source:** [`project-problems.json`](../project-problems.json) (Amazon Q static analysis, ~200+ findings)

**How to use:** Copy each prompt block and paste it directly into an AI coding assistant
(Claude, Copilot, etc.) with the relevant file open. Each prompt is self-contained and
references exact line numbers from the findings.

---

## Quick Reference — Problem Summary by File

| File | Critical/High | Medium | Low | Total |
|------|--------------|--------|-----|-------|
| [`CameraHook.java`](../android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java) | 8 | 42 | 12 | ~62 |
| [`VirtuCamSettingsModule.kt`](../android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt) | 11 | 6 | 2 | ~19 |
| [`FloatingOverlayService.kt`](../android/app/src/main/java/com/briefplantrain/virtucam/FloatingOverlayService.kt) | 8 | 2 | 0 | ~10 |
| [`StreamingMediaSource.java`](../android/app/src/main/java/com/briefplantrain/virtucam/StreamingMediaSource.java) | 0 | 13 | 3 | ~16 |
| [`CameraXHookStrategy.java`](../android/app/src/main/java/com/briefplantrain/virtucam/hooks/CameraXHookStrategy.java) | 1 | 2 | 6 | ~9 |
| [`NativeEncoder.java`](../android/app/src/main/java/com/briefplantrain/virtucam/NativeEncoder.java) | 1 | 0 | 1 | 2 |
| [`MainActivity.kt`](../android/app/src/main/java/com/briefplantrain/virtucam/MainActivity.kt) | 2 | 0 | 1 | 3 |
| [`VirtuCamSettingsPackage.kt`](../android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsPackage.kt) | 2 | 1 | 0 | 3 |
| [`MainApplication.kt`](../android/app/src/main/java/com/briefplantrain/virtucam/MainApplication.kt) | 1 | 0 | 0 | 1 |
| [`HookStrategyRegistry.java`](../android/app/src/main/java/com/briefplantrain/virtucam/hooks/HookStrategyRegistry.java) | 0 | 1 | 0 | 1 |
| [`DouYinHookStrategy.java`](../android/app/src/main/java/com/briefplantrain/virtucam/hooks/DouYinHookStrategy.java) | 0 | 1 | 0 | 1 |
| [`HookConfig.java`](../android/app/src/main/java/com/briefplantrain/virtucam/hooks/HookConfig.java) | 0 | 0 | 1 | 1 |

---

## Priority Order for Fixing

    1.  CRITICAL  CWE-78/77  OS Command Injection        VirtuCamSettingsModule.kt
    2.  CRITICAL  CWE-611    XML External Entity          FloatingOverlayService.kt
    3.  CRITICAL  CWE-114    Process Control              NativeEncoder.java
    4.  HIGH      CWE-434    Unsafe File Extension        VirtuCamSettingsModule.kt
    5.  HIGH      CWE-306    Missing Authentication       all .kt files
    6.  HIGH      CWE-362    Thread Safety Violation      CameraHook.java
    7.  HIGH      CWE-404    Resource Leak                CameraHook.java
    8.  MEDIUM    CWE-390    Swallowed Exceptions         CameraHook.java, StreamingMediaSource.java
    9.  MEDIUM    CWE-396    Poor Error Handling          CameraHook.java, StreamingMediaSource.java
    10. MEDIUM    quality    Inadequate Error Handling    all Java/Kotlin files
    11. MEDIUM    quality    Performance Inefficiencies   CameraHook.java, StreamingMediaSource.java
    12. LOW       quality    Readability/Maintainability  CameraHook.java, CameraXHookStrategy.java
    13. LOW       quality    Insufficient Logging         CameraHook.java, CameraXHookStrategy.java
    14. LOW       quality    High Cyclomatic Complexity   CameraHook.java
    15. LOW       quality    Missing Documentation        NativeEncoder.java

---

---

# SECTION 1 — CRITICAL SECURITY FIXES

---

## PROMPT 1.1 — OS Command Injection in VirtuCamSettingsModule.kt

**CWE-78/77 | Lines: 248-249, 986-987, 1005-1006**
**File:** [`VirtuCamSettingsModule.kt`](../android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt)

    You are fixing a critical OS Command Injection vulnerability (CWE-78/77) in an Android Kotlin file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt

    PROBLEM:
    Amazon Q flagged lines 248-249, 986-987, and 1005-1006 for OS Command Injection
    (code: kotlin-os-command-injection-ide). The file contains functions that execute shell
    commands using Runtime.getRuntime().exec() or similar mechanisms. User-controlled or
    externally-sourced strings are passed directly into shell commands without sufficient validation.

    WHAT TO FIX:
    1. Read the full file to understand the executeCommand() and executeRootCommand() functions.
    2. Add a private fun isCommandSafe(command: String): Boolean guard that:
       - Rejects commands containing null bytes (\u0000), newlines (\n), carriage returns (\r)
       - Only allows commands starting with an allowlist of known-safe prefixes:
         ["magisk ", "ksud ", "apd ", "ls ", "chmod ", "unzip ", "su ", "/data/adb/"]
       - Returns false for anything else
    3. Call isCommandSafe(command) at the top of executeCommand() and executeRootCommand().
       If it returns false, log a warning and return empty string immediately.
    4. Ensure all dynamic values embedded in commands are passed through an escapeShellArg()
       helper that wraps the value in single quotes and escapes any single quotes inside it.
    5. At lines 248-249: verify the command being built uses only sanitized/escaped components.
    6. At lines 1005-1006: same check for the root command execution path.

    CONSTRAINTS:
    - Do NOT change the function signatures or return types.
    - Do NOT remove existing try/catch blocks.
    - Preserve all existing logging.
    - The fix must compile with Kotlin 1.9+ and Android SDK 34.

    Show the complete updated functions with the security guards in place.

---

## PROMPT 1.2 — XML External Entity (XXE) in FloatingOverlayService.kt

**CWE-611 | Lines: 139-147, 149-153**
**File:** [`FloatingOverlayService.kt`](../android/app/src/main/java/com/briefplantrain/virtucam/FloatingOverlayService.kt)

    You are fixing a critical XML External Entity (XXE) vulnerability (CWE-611) in an Android Kotlin file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/FloatingOverlayService.kt

    PROBLEM:
    Amazon Q flagged lines 139-147 and 149-153 for CWE-611 (code: kotlin-xml-decoder).
    The code uses an XML parser without disabling external entity processing, making it
    vulnerable to XXE attacks that can read arbitrary device files, cause denial of service
    via entity expansion, or perform server-side request forgery.

    WHAT TO FIX:
    1. Read lines 130-160 of the file to see the exact XML parsing code.
    2. If using DocumentBuilderFactory, add ALL of these before createDocumentBuilder():
       factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
       factory.setFeature("http://xml.org/sax/features/external-general-entities", false)
       factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false)
       factory.setExpandEntityReferences(false)
    3. If using SAXParserFactory, add:
       factory.setFeature("http://xml.org/sax/features/external-general-entities", false)
       factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false)
    4. If using XmlPullParser (Android built-in): verify no setInput() is called with untrusted data.
    5. Wrap all feature-setting calls in try/catch(ParserConfigurationException) to handle
       parsers that do not support the feature.

    CONSTRAINTS:
    - Do NOT change the overall parsing logic or data structures.
    - The fix must compile with Android SDK 34.
    - Preserve all existing error handling.

    Show the complete updated XML parsing section with XXE protections applied.

---

## PROMPT 1.3 — Process Control / Dynamic Library Loading in NativeEncoder.java

**CWE-114 | Lines: 13-14**
**File:** [`NativeEncoder.java`](../android/app/src/main/java/com/briefplantrain/virtucam/NativeEncoder.java)

    You are fixing a Process Control vulnerability (CWE-114) in an Android Java file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/NativeEncoder.java

    PROBLEM:
    Amazon Q flagged lines 13-14 for CWE-114 (code: java-fortify-process-control).
    A native library is being loaded in a way that could be influenced by external input,
    allowing an attacker to substitute a malicious library.

    WHAT TO FIX:
    1. Read lines 1-20 of the file to see the exact library loading code.
    2. If using System.loadLibrary("libraryname"):
       - Ensure the library name is a HARDCODED string literal, never a variable.
       - Add a comment: // Library name is hardcoded - not user-controllable (CWE-114 mitigation)
    3. If using System.load(path) with any variable path:
       - Replace with System.loadLibrary() using a hardcoded name instead.
       - If System.load() is truly required, validate the path is within the app's own
         native library directory: context.getApplicationInfo().nativeLibraryDir
    4. Add a static initializer block if not already present to centralize the load:
       static {
           System.loadLibrary("yuv_encoder"); // hardcoded - CWE-114 mitigation
       }

    CONSTRAINTS:
    - The library being loaded is the YUV encoder (yuv_encoder or similar).
    - Do NOT change the JNI method signatures.
    - The fix must compile with Java 11+ and Android SDK 34.

    Show the complete updated static initializer / library loading section.

---

---

# SECTION 2 — HIGH SEVERITY FIXES

---

## PROMPT 2.1 — Unsafe File Extension Validation in VirtuCamSettingsModule.kt

**CWE-434 | Lines: 166-167, 291-292, 308-309, 418-419, 452-453, 829-830**
**File:** [`VirtuCamSettingsModule.kt`](../android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt)

    You are fixing Unsafe File Extension vulnerabilities (CWE-434) in an Android Kotlin file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt

    PROBLEM:
    Amazon Q flagged 6 locations for CWE-434 (code: kotlin-lack-of-file-extension-validation):
    Lines 166-167, 291-292, 308-309, 418-419, 452-453, 829-830.
    At each location, a file path is used without validating the file extension, allowing
    attackers to process executable files or scripts disguised as media files.

    WHAT TO FIX:
    1. Read each flagged location to understand what file operation is being performed.
    2. Add this private helper function near the top of the class:

       private fun isAllowedMediaExtension(filePath: String): Boolean {
           val allowed = setOf("mp4", "mkv", "avi", "mov", "webm", "jpg", "jpeg", "png", "gif")
           val ext = filePath.substringAfterLast('.', "").lowercase().trim()
           return ext.isNotEmpty() && ext in allowed
       }

    3. At each flagged line, add a guard BEFORE the file operation:

       if (filePath.contains("..") || filePath.contains('\u0000')) {
           promise.reject("INVALID_PATH", "Invalid file path")
           return
       }
       if (!isAllowedMediaExtension(filePath)) {
           promise.reject("INVALID_FILE_TYPE", "File type not allowed")
           return
       }

    CONSTRAINTS:
    - The allowed extensions must cover only media files this app legitimately handles.
    - Do NOT break existing functionality for valid media files.
    - Preserve all existing promise rejection patterns.
    - The fix must compile with Kotlin 1.9+.

    Show the updated code for all 6 flagged locations plus the new helper function.

---

## PROMPT 2.2 — Missing Authentication for Critical Functions (all Kotlin files)

**CWE-306 | VirtuCamSettingsModule.kt lines 645-646, 690-691, 980-981, 999-1000 | FloatingOverlayService.kt lines 61-62, 110-111, 130-131, 168-169, 365-366, 396-397 | MainActivity.kt lines 11-12, 26-27 | VirtuCamSettingsPackage.kt lines 8-9, 15-16 | MainApplication.kt line 45-46**

    You are fixing Missing Authentication vulnerabilities (CWE-306) across multiple Android Kotlin files.

    AFFECTED FILES AND LINES:
    1. VirtuCamSettingsModule.kt  lines 645-646, 690-691, 980-981, 999-1000
    2. FloatingOverlayService.kt  lines 61-62, 110-111, 130-131, 168-169, 365-366, 396-397
    3. MainActivity.kt            lines 11-12, 26-27
    4. VirtuCamSettingsPackage.kt lines 8-9, 15-16
    5. MainApplication.kt         line 45-46

    PROBLEM:
    Amazon Q flagged these locations for CWE-306 (kotlin-missing-authentication-for-critical-function).
    Critical functions that modify system settings, start/stop services, or access sensitive
    device capabilities are called without verifying the caller has appropriate permissions.

    CONTEXT:
    This is an Xposed/LSPosed module app. "Authentication" here means:
    - Checking that required Android permissions are granted before sensitive operations
    - Verifying the React Native bridge context is valid before executing module methods
    - Ensuring the Xposed module is properly activated before hook operations

    WHAT TO FIX:

    For VirtuCamSettingsModule.kt (React Native module methods at flagged lines):
    Add at the start of each @ReactMethod:
        if (reactApplicationContext == null) {
            promise.reject("NOT_INITIALIZED", "Module not ready")
            return
        }

    For FloatingOverlayService.kt (Service methods at flagged lines):
    Add permission check before overlay operations:
        if (checkSelfPermission(Manifest.permission.SYSTEM_ALERT_WINDOW) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Missing SYSTEM_ALERT_WINDOW permission - operation skipped")
            return
        }

    For MainActivity.kt, VirtuCamSettingsPackage.kt, MainApplication.kt:
    These are standard Android entry points. The finding is a false positive for lifecycle methods.
    Add a suppression comment at each flagged line:
        // CWE-306 acknowledged: standard Android lifecycle - authentication handled by Android OS

    CONSTRAINTS:
    - Do NOT add authentication that would break normal app startup.
    - Do NOT add authentication to standard lifecycle overrides (onCreate, onDestroy, etc.)
      unless they contain sensitive operations beyond standard initialization.
    - Preserve all existing functionality.

    Show the updated code for each file with appropriate guards or explanatory comments.

---

## PROMPT 2.3 — Thread Safety Violation in CameraHook.java

**CWE-362 | Lines: 121-122, 122-123, 123-124**
**File:** [`CameraHook.java`](../android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java)

    You are fixing a Thread Safety Violation (CWE-362) in an Android Java file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java

    PROBLEM:
    Amazon Q flagged lines 121-124 for CWE-362 (code: java-non-static-threadlocal).
    ThreadLocal variables are declared as instance fields (non-static) rather than static.
    A non-static ThreadLocal defeats the purpose of ThreadLocal, can cause memory leaks,
    and creates race conditions if multiple instances share threads.

    WHAT TO FIX:
    1. Read lines 115-130 of CameraHook.java to see the exact ThreadLocal declarations.
    2. Change all non-static ThreadLocal fields to static final:

       BEFORE:
       private ThreadLocal<SomeType> myThreadLocal = new ThreadLocal<>();

       AFTER:
       private static final ThreadLocal<SomeType> myThreadLocal = new ThreadLocal<>();

    3. If the ThreadLocal holds state that genuinely needs to be per-instance (not per-thread),
       replace it with a regular instance field protected by synchronized methods or
       use java.util.concurrent.atomic types instead.

    4. Ensure the static ThreadLocal is cleaned up by calling remove() after use in
       hook callback methods to prevent memory leaks:
       try {
           // use threadLocal.get()
       } finally {
           myThreadLocal.remove();
       }

    CONSTRAINTS:
    - This is an Xposed hook class - it may be instantiated multiple times by the framework.
    - Do NOT change the hook logic or method signatures.
    - The fix must compile with Java 11+ and Android SDK 34.

    Show the complete updated field declarations and any cleanup calls needed.

---

## PROMPT 2.4 — Missing Resource Release in CameraHook.java

**CWE-404/772/459 | Lines: 772-773, 1088-1089, 2220-2221**
**File:** [`CameraHook.java`](../android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java)

    You are fixing Missing Resource Release vulnerabilities (CWE-404/772/459) in an Android Java file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java

    PROBLEM:
    Amazon Q flagged lines 772-773, 1088-1089, and 2220-2221 for CWE-404/772/459
    (code: java-missing-release-of-resources). Resources are opened but not guaranteed
    to be closed in all code paths, especially when exceptions occur.

    WHAT TO FIX:
    1. Read each flagged location (lines 770-780, 1085-1095, 2215-2225) to identify the resource.
    2. For each Closeable resource (InputStream, OutputStream, Cursor, etc.):

       PATTERN A - try-with-resources (preferred, Java 7+):
       try (InputStream is = openResource()) {
           // use is - automatically closed on exit
       }

       PATTERN B - try/finally (when try-with-resources is not applicable):
       Resource r = null;
       try {
           r = openResource();
           // use r
       } finally {
           if (r != null) {
               try { r.close(); } catch (IOException e) { Log.w(TAG, "Close failed", e); }
           }
       }

    3. For MediaCodec or SurfaceTexture (camera-specific resources):
       - Ensure release() is called in a finally block or in afterHookedMethod.
       - Add null checks before release() calls.

    4. Check if there are corresponding cleanup methods (onDestroy, cleanup, release) where
       these resources should also be released.

    CONSTRAINTS:
    - Do NOT change the overall hook logic.
    - Ensure resources are released even when exceptions occur.
    - The fix must compile with Java 11+ and Android SDK 34.

    Show the complete updated code for all 3 flagged locations.

---

---

# SECTION 3 — MEDIUM SEVERITY FIXES

---

## PROMPT 3.1 — Swallowed Exceptions (CWE-390) in CameraHook.java

**CWE-390 | Lines: 217-218, 547-548, 1610-1611, 1993-1994, 2008-2009, 2128-2129, 2154-2155, 2257-2258, 2467-2468**
**File:** [`CameraHook.java`](../android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java)

    You are fixing Swallowed Exception vulnerabilities (CWE-390) in an Android Java file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java

    PROBLEM:
    Amazon Q flagged 9 locations for CWE-390 (code: java-do-not-swallow-exceptions):
    Lines: 217-218, 547-548, 1610-1611, 1993-1994, 2008-2009, 2128-2129, 2154-2155,
    2257-2258, 2467-2468.
    At each location, an exception is caught but neither re-thrown nor logged.

    WHAT TO FIX:
    For each flagged empty or silent catch block, apply one of these patterns:

    PATTERN A - Log and continue (non-critical operations):
    } catch (Exception e) {
        Log.w(TAG, "Operation failed: " + e.getMessage(), e);
    }

    PATTERN B - Log and re-throw (critical operations):
    } catch (Exception e) {
        Log.e(TAG, "Critical failure in [operation]", e);
        throw new RuntimeException("Failed to [operation]", e);
    }

    PATTERN C - Log and return safe default (hook methods):
    } catch (Exception e) {
        Log.e(TAG, "Hook failed, returning default", e);
        return null;
    }

    RULES:
    - NEVER leave an empty catch block.
    - For Xposed hook methods (beforeHookedMethod, afterHookedMethod), prefer Pattern A or C
      to avoid crashing the hooked app.
    - For initialization code, prefer Pattern B.
    - Ensure TAG is defined: private static final String TAG = "CameraHook";

    Read each of the 9 flagged locations and apply the most appropriate pattern.
    Show all 9 updated catch blocks.

---

## PROMPT 3.2 — Poor Error Handling (CWE-396) in CameraHook.java

**CWE-396 | ~35 locations throughout CameraHook.java**
**File:** [`CameraHook.java`](../android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java)

    You are fixing Poor Error Handling violations (CWE-396) in an Android Java file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java

    PROBLEM:
    Amazon Q flagged ~35 locations for CWE-396 (code: java-poor-error-handling).
    Overly broad exception types (Exception, Throwable) are caught instead of specific types,
    masking the true nature of errors.

    AFFECTED LINE RANGES:
    209-210, 317-318, 382-383, 547-548, 656-657, 681-682, 737-738, 779-780, 828-829,
    927-928, 990-991, 1050-1051, 1101-1102, 1115-1116, 1157-1158, 1171-1172, 1244-1245,
    1274-1275, 1424-1425, 1467-1468, 1601-1602, 1686-1687, 1759-1760, 1786-1787,
    1900-1901, 1965-1966, 2008-2009, 2099-2100, 2128-2129, 2150-2151, 2187-2188,
    2257-2258, 2294-2295, 2393-2394, 2467-2468, 2506-2507

    WHAT TO FIX:
    For each catch(Exception e) or catch(Throwable t) block, narrow the exception type:

    COMMON REPLACEMENTS BY OPERATION TYPE:
    - File/IO operations:          catch(IOException e)
    - Reflection/Xposed:           catch(NoSuchMethodError | ClassNotFoundException e)
    - JSON operations:             catch(JSONException e)
    - Integer parsing:             catch(NumberFormatException e)
    - Null access:                 Do NOT catch NullPointerException - fix the null check instead
    - Xposed hook callbacks ONLY:  catch(Throwable t) is acceptable in beforeHookedMethod/afterHookedMethod

    APPROACH:
    1. Read each flagged location.
    2. Identify what operation is inside the try block.
    3. Replace catch(Exception e) with the most specific type(s) that can be thrown.
    4. Use multi-catch for multiple types: catch(IOException | JSONException e)
    5. Keep catch(Throwable t) ONLY in Xposed hook callback methods.

    Show the updated catch blocks for all flagged locations, grouped by operation type.

---

## PROMPT 3.3 — Inadequate Error Handling in CameraHook.java

**Code: java-code-quality-error-handling | Lines: 279-280, 359-362, 430-433, 816-821, 857-858, 889-892, 919-920, 1078-1079, 1139-1140, 1150-1151, 1401-1405, 1414-1419, 1543-1545, 1550-1553, 1562-1563, 1624-1625, 1625-1634, 1673-1674, 2084-2103, 2107-2108, 2248-2256**
**File:** [`CameraHook.java`](../android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java)

    You are fixing Inadequate Error Handling issues in an Android Java file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java

    PROBLEM:
    Amazon Q flagged ~21 locations for inadequate error handling
    (code: java-code-quality-error-handling). Issues include missing null checks,
    missing bounds checks, missing return value validation, and overly broad try blocks.

    WHAT TO FIX:
    For each flagged location, apply the appropriate pattern:

    1. NULL CHECKS - Add before any object dereference:
       if (param == null || param.args == null || param.args.length == 0) return;
       Object arg = param.args[0];
       if (arg == null) return;

    2. RETURN VALUE VALIDATION - Check results from system calls:
       int result = someSystemCall();
       if (result < 0) {
           Log.w(TAG, "System call failed with code: " + result);
           return;
       }

    3. ARRAY BOUNDS - Before accessing param.args[n]:
       if (param.args == null || param.args.length <= n) return;

    4. NARROW TRY BLOCKS - Move try/catch as close as possible to the throwing statement.
       Do not wrap 20 lines in one try block if only 1 line can throw.

    5. For lines 2084-2103 (a large block): ensure each distinct operation has its own
       error handling rather than one catch for the entire block.

    Read each flagged location and apply the appropriate pattern.
    Show all updated code sections.

---

## PROMPT 3.4 — Inadequate Error Handling in StreamingMediaSource.java

**Code: java-code-quality-error-handling | Lines: 33-34, 36-37, 53-57, 94-97, 103-112, 132-134, 133-136, 164-175, 189-190, 193-194, 197-198**
**File:** [`StreamingMediaSource.java`](../android/app/src/main/java/com/briefplantrain/virtucam/StreamingMediaSource.java)

    You are fixing Inadequate Error Handling issues in an Android Java streaming file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/StreamingMediaSource.java

    PROBLEM:
    Amazon Q flagged 11 locations for inadequate error handling
    (code: java-code-quality-error-handling):
    Lines: 33-34, 36-37, 53-57, 94-97, 103-112, 132-134, 133-136, 164-175, 189-190, 193-194, 197-198

    Poor error handling in streaming code causes silent stream failures, resource leaks,
    and app crashes when the media source is unavailable.

    WHAT TO FIX:
    1. Read the full file to understand the streaming architecture.
    2. For each flagged location, ensure:
       a. All IOException and network exceptions are caught specifically (not as Exception).
       b. When a stream fails, log with: Log.e(TAG, "Stream failed: " + e.getMessage(), e)
       c. Resources (sockets, streams) are closed in finally blocks or try-with-resources.
       d. The caller is notified of failure via callback, return value, or exception propagation.
    3. For lines 164-175 (a larger streaming loop block): ensure the loop has proper error
       recovery - if one frame fails, log it and continue rather than crashing.
    4. Add network timeout handling for any connection operations:
       connection.setConnectTimeout(5000);
       connection.setReadTimeout(10000);
    5. Add: private static final String TAG = "StreamingMediaSource"; if not present.

    CONSTRAINTS:
    - Do NOT change the streaming protocol or data format.
    - Preserve all existing callback interfaces.
    - The fix must compile with Java 11+ and Android SDK 34.

    Show the complete updated file sections for all 11 flagged locations.

---

## PROMPT 3.5 — Poor Error Handling (CWE-396) in StreamingMediaSource.java

**CWE-396 | Lines: 119-120, 169-170, 183-184**
**File:** [`StreamingMediaSource.java`](../android/app/src/main/java/com/briefplantrain/virtucam/StreamingMediaSource.java)

    You are fixing Poor Error Handling violations (CWE-396) in an Android Java streaming file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/StreamingMediaSource.java

    PROBLEM:
    Amazon Q flagged lines 119-120, 169-170, and 183-184 for CWE-396
    (code: java-poor-error-handling). Overly broad exception types are caught.

    WHAT TO FIX:
    1. Read lines 115-125, 165-175, and 180-190 to see the exact catch blocks.
    2. For each catch(Exception e), identify what the try block does and replace:
       - Network/IO:         catch(IOException e)
       - URL parsing:        catch(MalformedURLException e)
       - HTTP protocol:      catch(ProtocolException e)
       - Thread interrupt:   catch(InterruptedException e) then add Thread.currentThread().interrupt();
    3. Use multi-catch if multiple exceptions are possible: catch(IOException | MalformedURLException e)

    CONSTRAINTS:
    - Do NOT change the method signatures.
    - Preserve all existing logging.
    - The fix must compile with Java 11+.

    Show the 3 updated catch blocks.

---

## PROMPT 3.6 — Inadequate Error Handling in FloatingOverlayService.kt

**Code: kotlin-code-quality-error-handling | Lines: 75-76, 82-83, 424-425**
**File:** [`FloatingOverlayService.kt`](../android/app/src/main/java/com/briefplantrain/virtucam/FloatingOverlayService.kt)

    You are fixing Inadequate Error Handling issues in an Android Kotlin service file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/FloatingOverlayService.kt

    PROBLEM:
    Amazon Q flagged lines 75-76, 82-83, and 424-425 for inadequate error handling
    (code: kotlin-code-quality-error-handling).

    WHAT TO FIX:
    1. Read lines 70-90 and 420-430 to see the exact code.
    2. For each flagged location:
       a. Empty/minimal catch blocks: add proper logging:
              } catch (e: Exception) {
                  Log.e(TAG, "Failed to [describe operation]: ${e.message}", e)
              }
       b. Nullable dereference without null check:
              val result = possiblyNull ?: run {
                  Log.w(TAG, "Expected non-null value was null")
                  return
              }
       c. Missing try/catch around WindowManager operations:
              try {
                  windowManager.addView(overlayView, params)
              } catch (e: WindowManager.BadTokenException) {
                  Log.e(TAG, "Failed to add overlay - bad token", e)
              } catch (e: IllegalStateException) {
                  Log.e(TAG, "Failed to add overlay - illegal state", e)
              }
    3. Add companion object { private const val TAG = "FloatingOverlayService" } if not present.

    CONSTRAINTS:
    - This is an Android Service - do NOT throw exceptions that would crash the service.
    - Prefer logging + graceful degradation over re-throwing.
    - The fix must compile with Kotlin 1.9+ and Android SDK 34.

    Show the 3 updated code sections.

---

## PROMPT 3.7 — Inadequate Error Handling in VirtuCamSettingsModule.kt

**Code: kotlin-code-quality-error-handling | Lines: 246-271, 992-994, 1025-1031, 1028-1029**
**File:** [`VirtuCamSettingsModule.kt`](../android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt)

    You are fixing Inadequate Error Handling issues in an Android Kotlin React Native module.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt

    PROBLEM:
    Amazon Q flagged lines 246-271, 992-994, 1025-1031, and 1028-1029 for inadequate error
    handling (code: kotlin-code-quality-error-handling).

    WHAT TO FIX:
    1. Read lines 240-275 and 985-1035 to see the exact code.
    2. For lines 246-271 (a large try block):
       - Narrow the try block to wrap only the specific risky operations.
       - Add specific catch clauses for each exception type that can be thrown.
       - Ensure the React Native promise is rejected with a meaningful error in every catch:
             promise.reject("ERROR_CODE", "Human-readable message: ${e.message}", e)
    3. For lines 992-994 and 1025-1031 (in executeCommand/executeRootCommand):
       - Catch IOException specifically.
       - Catch InterruptedException and restore the interrupt flag:
             } catch (e: InterruptedException) {
                 Thread.currentThread().interrupt()
                 Log.w(TAG, "Command execution interrupted", e)
             }
       - Add a timeout to process.waitFor():
             if (!process.waitFor(10, TimeUnit.SECONDS)) {
                 process.destroyForcibly()
                 Log.w(TAG, "Command timed out, process killed")
             }
    4. For line 1028-1029: ensure the finally block properly closes all streams.

    CONSTRAINTS:
    - All @ReactMethod functions MUST either resolve or reject the promise in ALL code paths.
    - Do NOT leave any code path where the promise is neither resolved nor rejected.
    - The fix must compile with Kotlin 1.9+.

    Show all updated code sections.

---

## PROMPT 3.8 — Performance Inefficiencies in CameraHook.java

**Code: java-code-quality-performance | Lines: 623-631, 624-626, 761-762, 785-788, 1239-1240, 1475-1483, 1601-1605, 1651-1658, 2414-2420**
**File:** [`CameraHook.java`](../android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java)

    You are fixing Performance Inefficiency issues in an Android Java camera hook file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java

    PROBLEM:
    Amazon Q flagged 9 locations for performance issues (code: java-code-quality-performance):
    Lines: 623-631, 624-626, 761-762, 785-788, 1239-1240, 1475-1483, 1601-1605, 1651-1658, 2414-2420

    WHAT TO FIX:
    Read each flagged location and apply the appropriate optimization:

    1. STRING CONCATENATION IN LOOPS:
       BEFORE: String result = ""; for(...) { result += item; }
       AFTER:  StringBuilder sb = new StringBuilder();
               for(...) { sb.append(item); }
               String result = sb.toString();

    2. REPEATED OBJECT CREATION in hook callbacks (called per-frame):
       BEFORE: byte[] buffer = new byte[1920*1080*3/2]; // inside callback
       AFTER:  private byte[] buffer; // class field, allocated once lazily

    3. REFLECTION CACHING (if Method/Field lookup is inside a callback):
       BEFORE: Method m = clazz.getMethod("name"); // inside hook callback
       AFTER:  private static Method cachedMethod; // look up once, cache at class level

    4. UNNECESSARY AUTOBOXING:
       BEFORE: Integer count = 0; count++;
       AFTER:  int count = 0; count++;

    5. BULK ARRAY OPERATIONS (for lines 1475-1483):
       Replace manual copy loops with System.arraycopy() for bulk array operations.

    CONSTRAINTS:
    - This is camera hook code - performance is critical (called per video frame).
    - Do NOT change the hook logic or output format.
    - Thread safety must be maintained for any shared state changes.
    - Use volatile or AtomicReference for shared fields accessed from multiple threads.

    Show the optimized code for all 9 flagged locations.

---

## PROMPT 3.9 — Performance Inefficiencies in StreamingMediaSource.java

**Code: java-code-quality-performance | Lines: 134-135, 200-201**
**File:** [`StreamingMediaSource.java`](../android/app/src/main/java/com/briefplantrain/virtucam/StreamingMediaSource.java)

    You are fixing Performance Inefficiency issues in an Android Java streaming file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/StreamingMediaSource.java

    PROBLEM:
    Amazon Q flagged lines 134-135 and 200-201 for performance issues
    (code: java-code-quality-performance).

    WHAT TO FIX:
    1. Read lines 130-140 and 196-206 to see the exact code.
    2. Common streaming performance issues:
       a. Allocating byte buffers inside the read loop - move allocation outside the loop.
       b. Using BufferedInputStream without specifying buffer size:
          BEFORE: new BufferedInputStream(is)
          AFTER:  new BufferedInputStream(is, 65536)
       c. Reading one byte at a time:
          BEFORE: int b = is.read();
          AFTER:  int n = is.read(buffer, 0, buffer.length);
    3. Apply the appropriate optimization for each flagged location.

    CONSTRAINTS:
    - Do NOT change the streaming protocol.
    - Buffer sizes should be appropriate for video streaming (64KB to 1MB).
    - The fix must compile with Java 11+.

    Show the 2 optimized code sections.

---

## PROMPT 3.10 — Performance Inefficiency in DouYinHookStrategy.java

**Code: java-code-quality-performance | Lines: 30-33**
**File:** [`DouYinHookStrategy.java`](../android/app/src/main/java/com/briefplantrain/virtucam/hooks/DouYinHookStrategy.java)

    You are fixing a Performance Inefficiency in an Android Java hook strategy file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/hooks/DouYinHookStrategy.java

    PROBLEM:
    Amazon Q flagged lines 30-33 for performance issues (code: java-code-quality-performance).

    WHAT TO FIX:
    1. Read lines 25-40 to see the exact code.
    2. Common issues in hook strategy initialization:
       a. Creating collections with new ArrayList<>() when the size is known - use
          new ArrayList<>(expectedSize) to avoid resizing.
       b. String operations that could use compile-time constants instead.
       c. Repeated method lookups that should be cached.
    3. Apply the appropriate optimization.

    CONSTRAINTS:
    - Do NOT change the hook strategy interface or method signatures.
    - The fix must compile with Java 11+.

    Show the optimized code section.

---

## PROMPT 3.11 — Performance Inefficiency in VirtuCamSettingsPackage.kt

**Code: kotlin-code-quality-performance | Lines: 11-12**
**File:** [`VirtuCamSettingsPackage.kt`](../android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsPackage.kt)

    You are fixing a Performance Inefficiency in an Android Kotlin React Native package file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsPackage.kt

    PROBLEM:
    Amazon Q flagged lines 11-12 for performance issues (code: kotlin-code-quality-performance).

    WHAT TO FIX:
    1. Read lines 8-18 to see the exact code.
    2. In React Native package classes, createNativeModules() and createViewManagers() are
       called on every bridge reload. Common issues:
       a. Creating a new list with mutableListOf() when an empty list suffices for view managers:
          BEFORE: return mutableListOf()
          AFTER:  return emptyList()
       b. Instantiating modules inside the list literal instead of lazily.
    3. Apply the appropriate optimization.

    CONSTRAINTS:
    - Do NOT change the React Native package interface.
    - The fix must compile with Kotlin 1.9+.

    Show the optimized code section.

---

## PROMPT 3.12 — Poor Error Handling (CWE-396) in HookStrategyRegistry.java

**CWE-396 | Lines: 79-80**
**File:** [`HookStrategyRegistry.java`](../android/app/src/main/java/com/briefplantrain/virtucam/hooks/HookStrategyRegistry.java)

    You are fixing a Poor Error Handling violation (CWE-396) in an Android Java file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/hooks/HookStrategyRegistry.java

    PROBLEM:
    Amazon Q flagged lines 79-80 for CWE-396 (code: java-poor-error-handling).
    An overly broad exception type is caught instead of a specific type.

    WHAT TO FIX:
    1. Read lines 75-85 to see the exact catch block.
    2. Identify what operation is inside the try block (likely hook registration or reflection).
    3. Replace catch(Exception e) with the specific exception type(s):
       - For reflection operations: catch(NoSuchMethodException | ClassNotFoundException e)
       - For hook registration: catch(Throwable t) is acceptable since Xposed
         hook registration can throw arbitrary errors
    4. Add logging if the catch block is empty:
       Log.e(TAG, "Failed to register hook strategy", e);
    5. Add: private static final String TAG = "HookStrategyRegistry"; if not present.

    CONSTRAINTS:
    - Do NOT change the registry interface or method signatures.
    - The fix must compile with Java 11+.

    Show the updated catch block.

---

---

# SECTION 4 — LOW SEVERITY / CODE QUALITY FIXES

---

## PROMPT 4.1 — Readability and Maintainability in CameraHook.java

**Code: java-code-quality-readability-maintainability | Lines: 105-106, 311-314, 356-367, 793-798, 938-948, 2027-2028, 2145-2150, 2272-2340**
**File:** [`CameraHook.java`](../android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java)

    You are improving Readability and Maintainability of an Android Java file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java

    PROBLEM:
    Amazon Q flagged 8 locations for readability/maintainability issues
    (code: java-code-quality-readability-maintainability):
    Lines: 105-106, 311-314, 356-367, 793-798, 938-948, 2027-2028, 2145-2150, 2272-2340

    WHAT TO FIX:
    Read each flagged location and apply the appropriate improvement:

    1. MAGIC NUMBERS - Replace with named constants:
       BEFORE: if (width > 1920 || height > 1080)
       AFTER:  private static final int MAX_WIDTH = 1920;
               private static final int MAX_HEIGHT = 1080;
               if (width > MAX_WIDTH || height > MAX_HEIGHT)

    2. DEEP NESTING - Use guard clauses (early returns):
       BEFORE: if (a != null) { if (b != null) { if (c) { doWork(); } } }
       AFTER:  if (a == null || b == null || !c) return;
               doWork();

    3. LONG METHODS (lines 2272-2340 is a ~68-line block):
       Extract logical sub-sections into private helper methods with descriptive names.
       Each helper should do ONE thing and have a clear name.

    4. DUPLICATE CODE - If the same 5+ line block appears twice, extract to a private method.

    5. UNCLEAR VARIABLE NAMES:
       BEFORE: int n, byte[] b, Object tmp
       AFTER:  int bytesRead, byte[] frameBuffer, Object tempResult

    CONSTRAINTS:
    - Do NOT change the hook logic or method signatures.
    - Extracted helper methods should be private.
    - The fix must compile with Java 11+.

    Show the refactored code for all 8 flagged locations.

---

## PROMPT 4.2 — High Cyclomatic Complexity in CameraHook.java

**Lines: 322-323, 837-838, 1189-1190, 1314-1315, 2165-2166**
**File:** [`CameraHook.java`](../android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java)

    You are reducing High Cyclomatic Complexity in an Android Java file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java

    PROBLEM:
    Amazon Q flagged 5 methods for high cyclomatic complexity (more than 10 decision points):
    Lines: 322-323, 837-838, 1189-1190, 1314-1315, 2165-2166

    WHAT TO FIX:
    For each flagged method, read the complete method body and apply one or more strategies:

    STRATEGY 1 - Extract sub-methods:
    If the method handles multiple distinct cases (different camera APIs, device manufacturers),
    extract each case into a private helper method.

    STRATEGY 2 - Replace if/else chains with a dispatch map:
    BEFORE: if (type.equals("A")) { handleA(); } else if (type.equals("B")) { handleB(); }
    AFTER:  Map<String, Runnable> handlers = new HashMap<>();
            handlers.put("A", this::handleA);
            handlers.put("B", this::handleB);
            handlers.getOrDefault(type, this::handleDefault).run();

    STRATEGY 3 - Use early returns to flatten nesting:
    BEFORE: if (condition) { if (other) { doWork(); } }
    AFTER:  if (!condition) return;
            if (!other) return;
            doWork();

    TARGET: Reduce each method to cyclomatic complexity of 10 or less.

    CONSTRAINTS:
    - Do NOT change the observable behavior of any hook method.
    - Extracted methods should be private and clearly named.
    - This is Xposed hook code - maintain compatibility with the hook framework.

    Show the refactored methods for all 5 flagged locations.

---

## PROMPT 4.3 — High Class Coupling in CameraHook.java

**Line: 62-63**
**File:** [`CameraHook.java`](../android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java)

    You are reducing High Class Coupling in an Android Java file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java

    PROBLEM:
    Amazon Q flagged line 62-63 indicating the class references too many other classes
    (high efferent coupling), making it brittle and hard to maintain.

    WHAT TO FIX:
    1. Read the import section (lines 1-65) to see all imported classes.
    2. Identify and remove all unused imports.
    3. Group remaining imports with comments:
       // Android framework imports
       // Xposed framework imports
       // Java standard library imports
       // Internal project imports
    4. For imports used only in one method, add a TODO comment suggesting future extraction:
       // TODO: Consider extracting [ClassName]-related logic to a dedicated helper class

    CONSTRAINTS:
    - This is a large, complex Xposed hook class. Full refactoring is not required now.
    - Focus on removing unused imports as the minimum fix.
    - Do NOT change any logic.

    Show the cleaned-up import section with grouping comments.

---

## PROMPT 4.4 — Insufficient Logging in CameraHook.java

**Code: java-code-quality-logging | Lines: 312-317, 1467-1469, 2150-2153, 2196-2201, 2257-2260**
**File:** [`CameraHook.java`](../android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java)

    You are improving Logging quality in an Android Java file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java

    PROBLEM:
    Amazon Q flagged 5 locations for insufficient or improper logging
    (code: java-code-quality-logging):
    Lines: 312-317, 1467-1469, 2150-2153, 2196-2201, 2257-2260

    WHAT TO FIX:
    1. Read each flagged location.
    2. Apply these logging standards:
       a. Always include the exception object: Log.e(TAG, "message", exception)
       b. Include relevant context in the message:
          Log.w(TAG, "Failed to process frame " + frameId + ": " + e.getMessage())
       c. Use correct log levels:
          Log.v() - verbose, very detailed, disabled in production
          Log.d() - debug info useful during development
          Log.i() - informational milestones (hook activated, stream started)
          Log.w() - recoverable problems (retrying, using fallback)
          Log.e() - errors that affect functionality
       d. Replace any System.out.println() with appropriate Log calls.
    3. Ensure TAG is defined: private static final String TAG = "CameraHook";

    CONSTRAINTS:
    - Do NOT add logging inside tight loops or per-frame callbacks - it destroys performance.
    - Guard debug logs: if (BuildConfig.DEBUG) { Log.d(TAG, ...); }
    - Do NOT log sensitive data (user file paths, personal information).

    Show the 5 updated logging sections.

---

## PROMPT 4.5 — Insufficient Logging in CameraXHookStrategy.java

**Code: java-code-quality-logging | Lines: 38-41, 69-70, 105-108, 114-115, 171-172**
**File:** [`CameraXHookStrategy.java`](../android/app/src/main/java/com/briefplantrain/virtucam/hooks/CameraXHookStrategy.java)

    You are improving Logging quality in an Android Java hook strategy file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/hooks/CameraXHookStrategy.java

    PROBLEM:
    Amazon Q flagged 5 locations for insufficient logging (code: java-code-quality-logging):
    Lines: 38-41, 69-70, 105-108, 114-115, 171-172

    WHAT TO FIX:
    1. Read each flagged location.
    2. Apply the same logging standards as PROMPT 4.4.
    3. For hook strategy classes specifically:
       - Log when a hook is successfully installed:
         Log.i(TAG, "CameraX hook installed for " + className);
       - Log when a hook fails to install:
         Log.e(TAG, "Failed to install CameraX hook for " + className, e);
       - Log when a hooked method is called (at DEBUG level only):
         if (BuildConfig.DEBUG) Log.d(TAG, "onPreviewFrame intercepted");
    4. Add: private static final String TAG = "CameraXHookStrategy"; if not present.

    CONSTRAINTS:
    - Do NOT add logging inside per-frame callbacks.
    - The fix must compile with Java 11+.

    Show the 5 updated logging sections.

---

## PROMPT 4.6 — Readability Issues in CameraXHookStrategy.java

**Code: java-code-quality-readability-maintainability | Lines: 72-111, 162-163**
**File:** [`CameraXHookStrategy.java`](../android/app/src/main/java/com/briefplantrain/virtucam/hooks/CameraXHookStrategy.java)

    You are improving Readability and Maintainability of an Android Java hook strategy file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/hooks/CameraXHookStrategy.java

    PROBLEM:
    Amazon Q flagged lines 72-111 (a 39-line block) and 162-163 for readability issues
    (code: java-code-quality-readability-maintainability).

    WHAT TO FIX:
    1. Read lines 70-115 and 158-167 to see the exact code.
    2. For lines 72-111 (long block):
       - Identify logical sub-sections and extract them into private helper methods.
       - Each helper should be 20 lines or fewer with a clear, descriptive name.
       - Add a brief Javadoc comment to each extracted method.
    3. For lines 162-163:
       - If it is a magic number, replace with a named constant.
       - If it is a complex boolean expression, extract to a named boolean variable:
         boolean isCameraXPreviewActive = ...; // instead of inline complex expression

    CONSTRAINTS:
    - Do NOT change the hook behavior.
    - Extracted methods should be private.
    - The fix must compile with Java 11+.

    Show the refactored code sections.

---

## PROMPT 4.7 — Readability Issues in VirtuCamSettingsModule.kt

**Code: kotlin-code-quality-readability-maintainability | Lines: 43-165**
**File:** [`VirtuCamSettingsModule.kt`](../android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt)

    You are improving Readability and Maintainability of an Android Kotlin React Native module.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt

    PROBLEM:
    Amazon Q flagged lines 43-165 (a 122-line block) for readability/maintainability issues
    (code: kotlin-code-quality-readability-maintainability).

    WHAT TO FIX:
    1. Read lines 43-165 to see the exact code (likely class-level property declarations).
    2. Apply these improvements:
       a. Group related properties with blank lines and section comments:
          // --- Camera Configuration ---
          // --- File Paths ---
          // --- Module State ---
       b. Replace magic string literals with companion object constants:
          companion object {
              private const val TAG = "VirtuCamSettings"
              private const val PREF_KEY_ENABLED = "hook_enabled"
              private const val DEFAULT_CAMERA_TARGET = "front"
          }
       c. If there are long init blocks, extract initialization logic into private fun initXxx() methods.
       d. Use Kotlin data classes for configuration objects instead of multiple separate properties.
    3. Preserve all existing property names referenced from JavaScript.

    CONSTRAINTS:
    - This is a React Native NativeModule - do NOT change @ReactMethod annotations or getName().
    - The fix must compile with Kotlin 1.9+.

    Show the refactored lines 43-165 with improved organization and readability.

---

## PROMPT 4.8 — Readability Issues in StreamingMediaSource.java

**Code: java-code-quality-readability-maintainability | Lines: 72-73, 141-142, 198-199**
**File:** [`StreamingMediaSource.java`](../android/app/src/main/java/com/briefplantrain/virtucam/StreamingMediaSource.java)

    You are improving Readability and Maintainability of an Android Java streaming file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/StreamingMediaSource.java

    PROBLEM:
    Amazon Q flagged lines 72-73, 141-142, and 198-199 for readability issues
    (code: java-code-quality-readability-maintainability).

    WHAT TO FIX:
    1. Read each flagged location.
    2. Apply these improvements:
       a. Magic numbers for buffer sizes, timeouts, port numbers - replace with named constants:
          private static final int BUFFER_SIZE = 65536;
          private static final int CONNECTION_TIMEOUT_MS = 5000;
       b. Unclear variable names in streaming loops:
          int n  ->  int bytesRead
          byte[] b  ->  byte[] frameBuffer
       c. Complex one-liner expressions - split into multiple lines with intermediate variables.
    3. Add class-level Javadoc if missing.

    CONSTRAINTS:
    - Do NOT change the streaming protocol or data format.
    - The fix must compile with Java 11+.

    Show the 3 updated code sections plus any class-level Javadoc added.

---

## PROMPT 4.9 — Bit Shifting Issues in CameraHook.java

**Code: java-bit-shift-checking | Lines: 1525-1534, 1527-1528, 1533-1534, 1656-1657, 1713-1714, 1714-1715, 1718-1719, 1722-1724**
**File:** [`CameraHook.java`](../android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java)

    You are reviewing and fixing Bit Shifting operations in an Android Java file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java

    PROBLEM:
    Amazon Q flagged 8 locations for bit shifting operations (code: java-bit-shift-checking):
    Lines: 1525-1534, 1527-1528, 1533-1534, 1656-1657, 1713-1714, 1714-1715, 1718-1719, 1722-1724

    Bit shifting issues include: shifting by a negative amount, shifting by >= bit width of the type,
    using signed right shift when unsigned is needed for pixel data, or incorrect shift amounts
    for YUV/RGB color channel extraction.

    WHAT TO FIX:
    1. Read each flagged location to understand the bit operation context.
    2. For YUV/RGB pixel manipulation (common in camera code):
       Use unsigned right shift for extracting color channels:
       int r = (pixel >>> 16) & 0xFF;  // Red channel - use >>> not >>
       int g = (pixel >>> 8) & 0xFF;   // Green channel
       int b = pixel & 0xFF;           // Blue channel
    3. Add bounds checks for computed shift amounts:
       int shift = computeShift();
       if (shift < 0 || shift >= 32) {
           Log.w(TAG, "Invalid shift amount: " + shift);
           return;
       }
       int result = value << shift;
    4. Add explanatory comments for non-obvious bit operations:
       // Extract Y component from YUV420 packed format
       int y = (yuv >>> 16) & 0xFF;

    CONSTRAINTS:
    - This is camera frame processing code - correctness is critical.
    - Do NOT change the color space conversion math unless it is provably wrong.
    - The fix must compile with Java 11+.

    Show the updated bit operations for all 8 flagged locations with explanatory comments.

---

## PROMPT 4.10 — Missing Documentation in NativeEncoder.java

**Code: java-code-quality-documentation | Lines: 2-5**
**File:** [`NativeEncoder.java`](../android/app/src/main/java/com/briefplantrain/virtucam/NativeEncoder.java)

    You are adding missing documentation to an Android Java JNI encoder file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/NativeEncoder.java

    PROBLEM:
    Amazon Q flagged lines 2-5 for missing or incomplete documentation
    (code: java-code-quality-documentation).

    WHAT TO FIX:
    1. Read the full file to understand what it does.
    2. Add a class-level Javadoc comment at the top of the class:
       /**
        * JNI bridge for native YUV frame encoding operations.
        *
        * This class provides Java bindings to the native C++ YUV encoder
        * implemented in yuv_encoder.cpp. It is used by CameraHook to encode
        * raw camera frames into the virtual camera stream.
        *
        * The native library must be loaded before any methods are called.
        * Library loading is performed in the static initializer block.
        */
    3. Add Javadoc to each public/package-private native method:
       /**
        * Encodes a YUV420 frame to the output buffer.
        *
        * @param yuvData  Input YUV420 frame data
        * @param width    Frame width in pixels
        * @param height   Frame height in pixels
        * @return         Encoded frame data, or null if encoding failed
        */
    4. Add inline comments for any non-obvious constants or configuration values.

    CONSTRAINTS:
    - Do NOT change any method signatures or logic.
    - Javadoc must be valid and compilable.
    - The fix must compile with Java 11+.

    Show the complete updated file with all documentation added.

---

## PROMPT 4.11 — Readability Issues in HookConfig.java

**Code: java-code-quality-readability-maintainability | Lines: 21-23**
**File:** [`HookConfig.java`](../android/app/src/main/java/com/briefplantrain/virtucam/hooks/HookConfig.java)

    You are improving Readability and Maintainability of an Android Java hook configuration file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/hooks/HookConfig.java

    PROBLEM:
    Amazon Q flagged lines 21-23 for readability issues
    (code: java-code-quality-readability-maintainability).

    WHAT TO FIX:
    1. Read lines 18-28 to see the exact code.
    2. Common issues in configuration classes:
       a. Magic string or numeric constants - replace with named static final fields.
       b. Multiple fields that belong together - consider grouping with a nested class or record.
       c. Missing Javadoc on public fields.
    3. Add Javadoc to the class and to each public field:
       /** Configuration for a single hook target. */
       public class HookConfig {
           /** The fully qualified class name to hook. */
           public final String targetClass;
           ...
       }

    CONSTRAINTS:
    - Do NOT change the field names if they are referenced from other classes.
    - The fix must compile with Java 11+.

    Show the refactored lines 21-23 with improved readability.

---

## PROMPT 4.12 — Readability Issues in MainActivity.kt

**Code: kotlin-code-quality-readability-maintainability | Lines: 13-14**
**File:** [`MainActivity.kt`](../android/app/src/main/java/com/briefplantrain/virtucam/MainActivity.kt)

    You are improving Readability and Maintainability of an Android Kotlin Activity file.

    FILE: android/app/src/main/java/com/briefplantrain/virtucam/MainActivity.kt

    PROBLEM:
    Amazon Q flagged lines 13-14 for readability issues
    (code: kotlin-code-quality-readability-maintainability).

    WHAT TO FIX:
    1. Read lines 10-20 to see the exact code.
    2. Common issues in MainActivity:
       a. Magic string for the main component name - replace with a named constant:
          companion object {
              private const val MAIN_COMPONENT_NAME = "virtucam"
          }
       b. Inline lambda that could be a named function for clarity.
       c. Missing class-level KDoc comment explaining the Activity's role.
    3. Add a KDoc comment to the class:
       /**
        * Main entry point Activity for the VirtuCam React Native application.
        * Extends ReactActivity to host the React Native UI.
        */

    CONSTRAINTS:
    - Do NOT change the ReactActivity configuration.
    - The fix must compile with Kotlin 1.9+.

    Show the refactored lines 13-14 with improved readability.

---

---

# SECTION 5 — USAGE INSTRUCTIONS

---

## How to Use This Guide

### Step 1 — Prioritize by severity

Work through the prompts in order: Section 1 (Critical) first, then Section 2 (High),
then Section 3 (Medium), then Section 4 (Low). Never skip a Critical or High finding
to fix a Low one.

### Step 2 — Open the file before pasting the prompt

In your AI coding assistant (Claude, GitHub Copilot, Amazon Q, etc.):
1. Open the file referenced in the prompt header.
2. Copy the entire indented prompt block.
3. Paste it as your message to the AI.
4. The AI will read the file and produce the fix.

### Step 3 — Review the AI output before applying

For security fixes (Section 1 and 2), always manually review the output:
- Verify the allowlist in PROMPT 1.1 matches the actual commands used in the codebase.
- Verify the XXE fix in PROMPT 1.2 uses the correct parser factory class.
- Verify the CWE-306 fixes in PROMPT 2.2 do not break normal app startup.

### Step 4 — Test after each fix

After applying each fix, run:
- `./gradlew assembleDebug` to verify the Android code compiles.
- Manual testing of the affected feature to verify no regressions.

### Step 5 — Track progress

Use the finding IDs from [`project-problems.json`](../project-problems.json) to track
which findings have been resolved. After fixing, re-run Amazon Q scan to confirm
the finding count decreases.

---

## Finding Count by Category

| Category | Code | Count | Prompts |
|----------|------|-------|---------|
| OS Command Injection | kotlin-os-command-injection-ide | 3 | 1.1 |
| XML External Entity | kotlin-xml-decoder | 2 | 1.2 |
| Process Control | java-fortify-process-control | 1 | 1.3 |
| Unsafe File Extension | kotlin-lack-of-file-extension-validation | 6 | 2.1 |
| Missing Authentication | kotlin-missing-authentication-for-critical-function | 15 | 2.2 |
| Thread Safety | java-non-static-threadlocal | 3 | 2.3 |
| Resource Leak | java-missing-release-of-resources | 3 | 2.4 |
| Swallowed Exceptions | java-do-not-swallow-exceptions | 9 | 3.1 |
| Poor Error Handling | java-poor-error-handling | ~35 | 3.2, 3.5, 3.12 |
| Inadequate Error Handling | java/kotlin-code-quality-error-handling | ~35 | 3.3, 3.4, 3.6, 3.7 |
| Performance | java/kotlin-code-quality-performance | ~15 | 3.8, 3.9, 3.10, 3.11 |
| Readability | java/kotlin-code-quality-readability-maintainability | ~15 | 4.1, 4.6, 4.7, 4.8, 4.11, 4.12 |
| Logging | java-code-quality-logging | ~10 | 4.4, 4.5 |
| Cyclomatic Complexity | (no code) | 5 | 4.2 |
| Class Coupling | (no code) | 1 | 4.3 |
| Bit Shifting | java-bit-shift-checking | 8 | 4.9 |
| Documentation | java-code-quality-documentation | 1 | 4.10 |
| AWS Polling | java-aws-polling-instead-of-waiters | 1 | (see note below) |
| JSON Refactoring | java-jsonobjectrefactoringrule | 1 | (see note below) |

**Note on java-aws-polling-instead-of-waiters (CameraHook.java line 1400-1401):**
This finding flags a polling loop that checks AWS resource state. In this codebase context
(an Android camera hook), this is likely a false positive — the code is probably polling
a local resource, not an AWS service. Review line 1400 and add a comment if confirmed:
// Not an AWS resource - local polling loop, CWE-19 finding is a false positive

**Note on java-jsonobjectrefactoringrule (CameraHook.java lines 339-350):**
This finding suggests refactoring JSON object construction. Review lines 339-350 and
consider using a builder pattern or a data class instead of manual JSONObject construction.
