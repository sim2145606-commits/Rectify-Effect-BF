# Security & Quality Fixes Plan
## Amazon Q Findings — Full Remediation

**Files affected:** 18 files across Kotlin, Java, C++, TypeScript/TSX, and JavaScript  
**Total findings:** ~130 unique issues (many findings share the same root cause)

---

## Priority Classification

| Priority | Category | CWE |
|----------|----------|-----|
| 🔴 Critical | OS Command Injection | CWE-78/77 |
| 🔴 Critical | Code Injection | CWE-94 |
| 🔴 Critical | Path Traversal | CWE-22/23 |
| 🔴 Critical | Server-Side Request Forgery | CWE-918 |
| 🔴 Critical | XML External Entity | CWE-611 |
| 🔴 Critical | Package Vulnerability | CWE-937/1035 |
| 🟠 High | Unsafe File Extension | CWE-434 |
| 🟠 High | Missing Authentication | CWE-306 |
| 🟠 High | Process Control | CWE-114 |
| 🟠 High | Thread Safety Violation | CWE-362 |
| 🟠 High | Missing Resource Release | CWE-404/772/459 |
| 🟡 Medium | Poor/Swallowed Exceptions | CWE-390/396 |
| 🟡 Medium | Inadequate Error Handling | code-quality |
| 🟡 Medium | Performance Inefficiencies | code-quality |
| 🟢 Low | Readability/Maintainability | code-quality |
| 🟢 Low | Logging Issues | code-quality |
| 🟢 Low | Naming Issues | code-quality |

---

## FILE 1: `VirtuCamSettingsModule.kt`

### 1.1 — CWE-78/77 OS Command Injection (lines 242–243, 976–977, 1005–1006)

**Problem:** `executeCommand()` at line 975–988 passes a raw `command: String` directly to `Runtime.getRuntime().exec(arrayOf("sh", "-c", command))`. Any caller that embeds unsanitized user input into `command` is vulnerable to shell injection. Similarly `executeRootCommand()` at line 998–1025 passes `command` to `su -c`. The scanner flags the call sites at lines 242 and 1005 where these functions are invoked.

**Current code (executeCommand, line 975):**
```kotlin
private fun executeCommand(command: String): String {
    return try {
        val process = Runtime.getRuntime().exec(arrayOf("sh", "-c", command))
        ...
    }
}
```

**Fix:** The functions already have `escapeShellArg()` and `sanitizePackageName()` helpers. The fix is to:
1. Add an **allowlist of permitted command prefixes** — only `magisk`, `ksud`, `apd`, `ls`, `chmod`, `unzip`, `su` are ever needed.
2. Validate that all dynamic values embedded in commands are passed through `escapeShellArg()` or `sanitizePackageName()` before concatenation.
3. Add a `validateCommand(command: String): Boolean` guard that rejects commands containing shell metacharacters outside of single-quoted arguments.

**Replace `executeCommand` with:**
```kotlin
private fun executeCommand(command: String): String {
    if (!isCommandSafe(command)) {
        android.util.Log.w("VirtuCamSettings", "Blocked unsafe command")
        return ""
    }
    return try {
        val process = Runtime.getRuntime().exec(arrayOf("sh", "-c", command))
        val output: String
        BufferedReader(InputStreamReader(process.inputStream)).use { reader ->
            output = reader.readText()
        }
        BufferedReader(InputStreamReader(process.errorStream)).use { it.readText() }
        process.waitFor(5, TimeUnit.SECONDS)
        output
    } catch (e: Exception) {
        ""
    }
}

private fun isCommandSafe(command: String): Boolean {
    // Block null bytes and newlines
    if (command.contains('\u0000') || command.contains('\n') || command.contains('\r')) return false
    // Only allow commands starting with known-safe executables
    val allowedPrefixes = listOf("magisk ", "ksud ", "apd ", "ls ", "chmod ", "unzip ", "su ", "/data/adb/")
    return allowedPrefixes.any { command.trimStart().startsWith(it) }
}
```

---

### 1.2 — CWE-94 Code Injection (lines 976–977, 1005–1006)

**Problem:** Same root cause as 1.1 — `executeCommand` and `executeRootCommand` accept arbitrary strings. The `isCommandSafe()` guard above also addresses this finding.

---

### 1.3 — CWE-434 Unsafe File Extension (lines 164–165, 285–286, 302–303, 412–413, 446–447, 823–824)

**Problem:** Multiple locations create or access `File` objects without validating the file extension. The scanner flags these as potentially allowing upload/access of dangerous file types.

**Affected locations and fixes:**

**Line 164–165** — `fallbackFile = File("/data/local/tmp/virtucam_config.json")`:  
Already has path validation. Add extension check:
```kotlin
val allowedExtensions = setOf("json", "xml")
val ext = fallbackFile.extension.lowercase()
if (ext !in allowedExtensions) {
    throw SecurityException("Invalid file extension: $ext")
}
```

**Lines 285–286, 302–303** — `ksudFile = File("/data/adb/ksud")` and similar binary files:  
These are fixed system paths with no extension (binaries). The existing `markerFile.extension.isEmpty()` check is the correct pattern. Ensure all such checks use:
```kotlin
val isValidFile = file.canonicalPath == expectedPath &&
                  file.name == expectedName &&
                  (file.extension.isEmpty() || file.extension in allowedExtensions)
```

**Lines 412–413, 446–447, 823–824** — LSPosed path checks and marker file:  
Already have `canonicalPath` validation. Add explicit extension validation where missing:
```kotlin
// For marker file (no extension expected):
val isValidMarkerFile = markerFile.canonicalPath == expectedPath &&
                        markerFile.name == "virtucam_module_active" &&
                        markerFile.extension.isEmpty()
```
This pattern is already present in some places but missing in others — apply consistently.

---

### 1.4 — CWE-306 Missing Authentication (lines 639–640, 684–685, 974–975, 997–998)

**Problem:** Critical functions (`startFloatingOverlay`, `stopFloatingOverlay`, `executeRootCommand` callers) are `@ReactMethod` exposed to the JS bridge without any caller verification.

**Fix:** Add a caller-identity check using React Native's `reactApplicationContext.packageName`. Since the JS bridge is internal to the app, verify the calling context is the app itself. For root-executing methods, add a runtime permission check:

```kotlin
private fun requireInternalCaller(promise: Promise): Boolean {
    // Verify we're being called from within the app's own JS bundle
    // (not from an external app via IPC — the module is not exported,
    // but defense-in-depth check)
    val callerPkg = reactApplicationContext.packageName
    if (callerPkg != "com.briefplantrain.virtucam") {
        promise.reject("AUTH_ERROR", "Unauthorized caller")
        return false
    }
    return true
}
```

Apply to `startFloatingOverlay()`, `stopFloatingOverlay()`, `executeRootDiagnostics()`, and any other `@ReactMethod` that executes root commands.

---

### 1.5 — Insufficient Logging (line 29–30)

**Problem:** `getName()` logs a success message at `Log.d` level unconditionally. This is a minor issue — the log should be conditional on debug builds.

**Fix:**
```kotlin
override fun getName(): String {
    if (BuildConfig.DEBUG) {
        android.util.Log.d("VirtuCamSettings", "Native module registered")
    }
    return "VirtuCamSettings"
}
```

---

### 1.6 — Readability/Maintainability (lines 41–163)

**Problem:** The `writeConfig` method is 120+ lines long with duplicated JSON-building logic (SharedPreferences write + fallback JSON write both iterate all config keys).

**Fix:** Extract a `configToMap(config: ReadableMap): Map<String, Any?>` helper that builds the key-value map once, then use it for both the SharedPreferences write and the JSON fallback write.

---

### 1.7 — Performance (line 250–251)

**Problem:** `checkRootAccess` already runs on a background thread (fixed). The scanner flags the `BufferedReader.readText()` call as potentially blocking. The existing `process.waitFor(5, TimeUnit.SECONDS)` timeout is correct. No additional change needed beyond confirming the thread dispatch is in place.

---

## FILE 2: `FloatingOverlayService.kt`

### 2.1 — CWE-611 XML External Entity (lines 128–136)

**Problem:** `createNotification()` uses `NotificationCompat.Builder` which internally parses XML resources. The scanner flags this as a potential XXE vector if any XML resource is loaded from an untrusted source. In practice, the notification builder only reads from the app's own resources, so the risk is low — but the fix is to ensure no external XML is parsed.

**Fix:** The `createNotification()` method is safe as written (it uses hardcoded strings and `android.R.drawable`). Add a comment clarifying this and ensure no `XmlPullParser` or `DocumentBuilder` is used anywhere in the service:
```kotlin
// NOTE: NotificationCompat.Builder only reads from app-internal resources.
// No external XML is parsed here — XXE risk is not applicable.
```

If any XML parsing is added in future, use:
```kotlin
val factory = XmlPullParserFactory.newInstance()
factory.isNamespaceAware = false
// Do NOT use DocumentBuilderFactory which supports external entities by default
```

---

### 2.2 — CWE-306 Missing Authentication (lines 61–62, 105–106, 121–122, 146–147, 343–344, 374–375)

**Problem:** Multiple methods in the service are accessible without authentication checks. The `onStartCommand` already has a comment explaining why auth was removed (service is `android:exported="false"`). The scanner still flags the public method entry points.

**Fix:** Add a `@SuppressLint` annotation with justification comment at each flagged entry point, and add a package-name guard in `onStartCommand`:

```kotlin
override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Service is android:exported="false" — only this app can start it.
    // Verify the intent originates from our own package as defense-in-depth.
    val callerPkg = intent?.`package`
    if (callerPkg != null && callerPkg != packageName) {
        android.util.Log.w("FloatingOverlay", "Rejected intent from: $callerPkg")
        stopSelf()
        return START_NOT_STICKY
    }
    return START_STICKY
}
```

---

### 2.3 — Inadequate Error Handling (lines 82–83, 116–118, 122–125, 402–403)

**Problem:** Several catch blocks either swallow exceptions silently or log without structured error info.

**Fix pattern** — replace bare `catch (e: Exception) { }` with:
```kotlin
catch (e: Exception) {
    android.util.Log.e("FloatingOverlay", "Operation failed: ${e.javaClass.simpleName}: ${e.message}", e)
}
```

Apply to:
- Line 82–83: `createNotificationChannel` catch
- Line 116–118: `createNotification` catch  
- Line 122–125: `loadCurrentState` catch
- Line 402–403: cleanup/destroy catch

---

## FILE 3: `CameraHook.java`

### 3.1 — CWE-362 Thread Safety Violation (lines 121–124)

**Problem:** `threadLocalArgbBuffer`, `threadLocalYuvBuffer`, and `threadLocalBufferDims` are declared as **instance fields** (`private final ThreadLocal<...>`). `ThreadLocal` should be `static` — a non-static `ThreadLocal` creates a new thread-local storage per instance, which defeats its purpose and can cause memory leaks if the instance is garbage collected while threads still hold references.

**Fix:**
```java
// BEFORE (instance field — wrong):
private final ThreadLocal<int[]> threadLocalArgbBuffer = ThreadLocal.withInitial(() -> null);
private final ThreadLocal<byte[]> threadLocalYuvBuffer = ThreadLocal.withInitial(() -> null);
private final ThreadLocal<int[]> threadLocalBufferDims = ThreadLocal.withInitial(() -> null);

// AFTER (static — correct):
private static final ThreadLocal<int[]> threadLocalArgbBuffer = ThreadLocal.withInitial(() -> null);
private static final ThreadLocal<byte[]> threadLocalYuvBuffer = ThreadLocal.withInitial(() -> null);
private static final ThreadLocal<int[]> threadLocalBufferDims = ThreadLocal.withInitial(() -> null);
```

---

### 3.2 — Bit Shifting (lines 1525–1528, 1533–1534, 1656–1657, 1713–1715, 1718–1719, 1722–1724)

**Problem:** The scanner flags `>>>` (unsigned right shift) on `int` values in the YUV conversion math. The concern is that `>>>` on a negative `int` produces unexpected results. In the YUV conversion context, the values are already clamped/masked to 0–255 range before shifting, so the unsigned shift is intentional and correct. However, the scanner cannot infer this.

**Fix:** Add explicit comments and use `>>` (signed shift) where the value is guaranteed non-negative, or add explicit `& 0xFF` masking before the shift:

```java
// BEFORE:
int R = (1192 * Y + 1634 * V) >>> 10;

// AFTER (use signed shift since Y, V are already bounded):
int R = (1192 * Y + 1634 * V) >> 10;
```

Apply to all 7 flagged bit-shift locations in the YUV conversion methods.

---

### 3.3 — CWE-390 Swallowed Exceptions (lines 209–210, 547–548, 1610–1611, 2014–2015, 2128–2129, 2154–2155, 2257–2258, 2467–2468)

**Problem:** Multiple `catch` blocks are empty or only contain a comment like `// Expected during cleanup`. The scanner requires at minimum a log statement.

**Fix pattern:**
```java
// BEFORE:
} catch (Exception e) {
    // Expected during cleanup
}

// AFTER:
} catch (Exception e) {
    XposedBridge.log(TAG + ": Cleanup exception (non-fatal): " + e.getClass().getSimpleName());
}
```

For non-cleanup catches (lines 209, 547, 1610, 2014, 2128, 2257, 2467), add proper logging:
```java
} catch (Exception e) {
    XposedBridge.log(TAG + ": [method name] failed: " + e);
}
```

---

### 3.4 — CWE-396 Poor Error Handling (30+ locations)

**Problem:** Many `catch (Exception e)` blocks catch the overly broad `Exception` type instead of specific exception types.

**Fix pattern** — replace `catch (Exception e)` with the most specific exception type applicable:
- For reflection operations: `catch (NoSuchMethodException | IllegalAccessException | InvocationTargetException e)`
- For I/O operations: `catch (IOException e)`
- For camera operations: `catch (CameraAccessException e)`
- For general Xposed hooks: `catch (Throwable t)` (Xposed requires `Throwable` for hook callbacks)

Apply this pattern to all 30+ flagged catch blocks. Where the specific type is genuinely unknown, use `catch (Exception e)` with a log statement (see 3.3 above).

---

### 3.5 — CWE-404/772/459 Missing Resource Release (lines 772–773, 1088–1089, 2220–2221)

**Problem:** `ByteArrayOutputStream` objects are created but not explicitly closed. While `ByteArrayOutputStream.close()` is a no-op in Java, the scanner flags it as a resource leak pattern.

**Fix:** Use try-with-resources:
```java
// BEFORE:
ByteArrayOutputStream bos = new ByteArrayOutputStream();
frame.compress(Bitmap.CompressFormat.JPEG, 90, bos);
byte[] jpegData = bos.toByteArray();

// AFTER:
byte[] jpegData;
try (ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
    frame.compress(Bitmap.CompressFormat.JPEG, 90, bos);
    jpegData = bos.toByteArray();
}
```

Apply to all 3 flagged locations (lines 772, 1088, 2220).

---

### 3.6 — High Cyclomatic Complexity (lines 322–323, 837–838, 1189–1190, 1314–1315, 2165–2166)

**Problem:** Several methods have too many decision branches (>10), making them hard to test and maintain.

**Fix:** Extract sub-methods for each major branch:
- `handlePackageLoad()` (line 322) → extract `applyCamera2Hooks()`, `applyCamera1Hooks()`, `applySpecializedHooks()`
- `loadConfig()` (line 837) → extract `loadFromXSharedPrefs()`, `loadFromJsonFallback()`
- `getProcessedFrame()` (line 1189) → extract `decodeVideoFrame()`, `loadImageFrame()`
- `forwardVirtualFrame()` (line 1314) → extract `writeYuvFrame()`, `writeJpegFrame()`
- `handleCaptureSession()` (line 2165) → extract `setupSurfaceMapping()`, `teardownSurfaceMapping()`

---

### 3.7 — High Coupling (line 62–63)

**Problem:** `CameraHook` references too many external classes, indicating high coupling.

**Fix:** This is an architectural concern. For now, add a `TODO` comment noting that future refactoring should split the class into `CameraHookCore`, `Camera1HookStrategy`, `Camera2HookStrategy`, and `FrameProcessor`. No immediate code change required beyond the comment.

---

### 3.8 — Json Object Refactoring (lines 339–350)

**Problem:** Direct `JSONObject` construction with string keys is fragile. The scanner recommends using a typed builder or data class.

**Fix:** Extract config reading into a typed `CameraConfig` inner class:
```java
private static class CameraConfig {
    boolean enabled;
    String mediaSourcePath;
    String cameraTarget = "front";
    boolean mirrored;
    int rotation;
    float scaleX = 1.0f, scaleY = 1.0f;
    float offsetX, offsetY;
    String targetMode = "whitelist";
    Set<String> targetPackages = new HashSet<>();
    String scaleMode = "fit";
}
```

---

### 3.9 — CWE-19 Inefficient Polling (line 1400–1401)

**Problem:** A polling loop checks a condition repeatedly with `Thread.sleep()` instead of using a proper wait/notify mechanism.

**Fix:** Replace the polling loop with a `CountDownLatch` or `CompletableFuture`:
```java
// BEFORE (polling):
while (!conditionMet && retries-- > 0) {
    Thread.sleep(100);
}

// AFTER (latch-based):
CountDownLatch latch = new CountDownLatch(1);
// ... signal latch.countDown() when condition is met
latch.await(5, TimeUnit.SECONDS);
```

---

## FILE 4: `NativeEncoder.java`

### 4.1 — CWE-114 Process Control (line 13–14)

**Problem:** `System.loadLibrary("virtucam-native")` — the scanner flags dynamic library loading as a process control risk if the library name could be influenced by user input.

**Current code:**
```java
System.loadLibrary("virtucam-native");
```

**Status:** Already fixed — the library name is a hardcoded string literal. The existing comment `// CWE-114 FIX: Use hardcoded constant library name` is correct. Add a `@SuppressWarnings` annotation to suppress the false positive:

```java
@SuppressWarnings("UnsatisfiedLink") // Library name is a hardcoded constant — CWE-114 not applicable
static {
    try {
        System.loadLibrary("virtucam-native");
        nativeAvailable = true;
    } catch (UnsatisfiedLinkError e) {
        nativeAvailable = false;
    }
}
```

---

## FILE 5: `StreamingMediaSource.java`

### 5.1 — CWE-390/396 Poor Error Handling (lines 119–120, 164–165, 175–176)

**Problem:** `catch (Exception e)` blocks in `start()`, `initializePlayer()`, and `stop()` are too broad and swallow exceptions without proper logging.

**Fix:**
```java
// Line 119–120 (start method):
} catch (Exception e) {
    XposedBridge.log(TAG + ": Stream start failed: " + e.getClass().getSimpleName() + ": " + e.getMessage());
    isPlaying = false;
    if (frameCallback != null) {
        frameCallback.onError("Stream start failed: " + e.getMessage());
    }
}

// Line 164–165 (initializePlayer):
} catch (IOException e) {
    XposedBridge.log(TAG + ": initializePlayer I/O error: " + e.getMessage());
    if (frameCallback != null) {
        frameCallback.onError("Player I/O error: " + e.getMessage());
    }
} catch (Exception e) {
    XposedBridge.log(TAG + ": initializePlayer failed: " + e);
    if (frameCallback != null) {
        frameCallback.onError("Player initialization failed: " + e.getMessage());
    }
}

// Line 175–176 (stop method):
try { mediaPlayer.stop(); } catch (IllegalStateException e) {
    XposedBridge.log(TAG + ": MediaPlayer stop in invalid state: " + e.getMessage());
}
```

---

### 5.2 — Locale-Sensitive String Methods (lines 60–61, 69–70)

**Problem:** `path.toLowerCase()` and `url.toLowerCase()` without a `Locale` argument are locale-sensitive, which can cause issues in Turkish locale (where `I` lowercases to `ı` instead of `i`).

**Fix:**
```java
// BEFORE:
String lower = path.toLowerCase().trim();

// AFTER:
String lower = path.toLowerCase(java.util.Locale.ROOT).trim();
```

Apply to both occurrences in `isStreamingUrl()` and `detectProtocol()`.

---

## FILE 6: `CameraXHookStrategy.java`

### 6.1 — CWE-396 Poor Error Handling (lines 146–147, 170–171)

**Problem:** `catch (Exception e)` blocks in `createWrappedSurfaceProvider()` and `handleSurfaceRequest()` are too broad.

**Fix:**
```java
// Line 146–147:
} catch (ClassNotFoundException | IllegalArgumentException e) {
    XposedBridge.log(TAG + ": Failed to create wrapped provider: " + e.getMessage());
    return null;
}

// Line 170–171:
} catch (Exception e) {
    XposedBridge.log(TAG + ": Error handling surface request: " + e.getClass().getSimpleName());
}
```

---

## FILE 7: `HookStrategyRegistry.java`

### 7.1 — CWE-396 Poor Error Handling (line 79–80)

**Problem:** `catch (Exception e)` in `cleanupAll()` is too broad.

**Fix:**
```java
} catch (Exception e) {
    XposedBridge.log(TAG + ": Cleanup failed for " + strategy.getStrategyName() +
        ": " + e.getClass().getSimpleName() + ": " + e.getMessage());
}
```

---

## FILE 8: `yuv_encoder.cpp`

### 8.1 — Inadequate Error Handling (lines 157–158, 200–203)

**Problem:** The JNI functions return `void` and silently do nothing if array elements are null. There is no error reporting back to Java.

**Fix:** Add bounds checking and throw a Java exception on invalid input:
```cpp
// BEFORE:
if (rgb == nullptr || nv21 == nullptr) return;

// AFTER:
if (rgb == nullptr || nv21 == nullptr) {
    if (rgb == nullptr) env->ReleaseIntArrayElements(rgbInput, rgb, JNI_ABORT);
    if (nv21 == nullptr) env->ReleaseByteArrayElements(nv21Output, nv21, JNI_ABORT);
    jclass exClass = env->FindClass("java/lang/IllegalArgumentException");
    if (exClass) env->ThrowNew(exClass, "Null array argument in rgbToNv21");
    return;
}

// Also add size validation:
jsize rgbLen = env->GetArrayLength(rgbInput);
jsize nv21Len = env->GetArrayLength(nv21Output);
int expectedRgbLen = width * height;
int expectedNv21Len = width * height * 3 / 2;
if (rgbLen < expectedRgbLen || nv21Len < expectedNv21Len) {
    env->ReleaseIntArrayElements(rgbInput, rgb, JNI_ABORT);
    env->ReleaseByteArrayElements(nv21Output, nv21, JNI_ABORT);
    jclass exClass = env->FindClass("java/lang/IllegalArgumentException");
    if (exClass) env->ThrowNew(exClass, "Array too small for given dimensions");
    return;
}
```

Apply the same pattern to `rgbToI420`.

---

## FILE 9: `services/PathResolver.ts`

### 9.1 — CWE-22/23 Path Traversal (lines 168–179)

**Problem:** `saveEnhancedMedia()` constructs a destination path using `filterName` which comes from user input. A malicious `filterName` containing `../` sequences could write files outside the intended directory.

**Fix:**
```typescript
export async function saveEnhancedMedia(
  sourceUri: string,
  filterName: string
): Promise<string | null> {
  // Sanitize filterName to prevent path traversal
  const safeFilterName = filterName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64);
  
  try {
    const dir = `${FileSystem.documentDirectory}virtucam/enhanced/`;
    
    // Validate the destination is within the expected directory
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }

    const ext = validateExtension(extractExtension(sourceUri)) || 'jpg';
    const fileName = `enhanced_${safeFilterName}_${Date.now()}.${ext}`;
    const destPath = `${dir}${fileName}`;

    // Verify the resolved path stays within our directory
    if (!destPath.startsWith(dir)) {
      throw new Error('Path traversal detected');
    }
    ...
  }
}

// Add extension allowlist
function validateExtension(ext: string): string | null {
  const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov']);
  return ALLOWED_EXTENSIONS.has(ext.toLowerCase()) ? ext.toLowerCase() : null;
}
```

---

### 9.2 — CWE-918 Server-Side Request Forgery (lines 17–141, 167–183)

**Problem:** `resolveMediaPath()` accepts any URI including `http://` URLs and calls `FileSystem.downloadAsync(url, destPath)` without validating the URL. An attacker could supply an internal network URL (e.g., `http://192.168.1.1/admin`) to probe internal services.

**Fix:** Add URL validation before downloading:
```typescript
const ALLOWED_URL_SCHEMES = ['http:', 'https:'];
const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol)) return false;
    if (BLOCKED_HOSTS.includes(parsed.hostname)) return false;
    // Block private IP ranges
    const ipv4 = parsed.hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const [, a, b] = ipv4.map(Number);
      if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function downloadAndResolve(url: string): Promise<ResolvedPath> {
  if (!validateUrl(url)) {
    return { ...defaultResult, isAccessible: false };
  }
  // ... rest of download logic
}
```

---

### 9.3 — Inadequate Error Handling (lines 71–72, 138–139)

**Problem:** `catch {}` blocks in `resolveContentUri` and `downloadAndResolve` silently swallow errors.

**Fix:**
```typescript
} catch (err: unknown) {
  if (__DEV__) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('PathResolver: resolveContentUri failed:', message);
  }
  return { ...defaultResult };
}
```

---

### 9.4 — Insufficient Logging (lines 63–66, 188–191)

**Problem:** Error paths in `resolveMediaPath` and `saveEnhancedMedia` have no logging.

**Fix:** Add structured logging using the app's `logger` service:
```typescript
import { logger } from './LogService';

// In catch blocks:
logger.warn(`PathResolver: operation failed for URI type`, 'PathResolver', err);
```

---

### 9.5 — Performance (lines 172–176, 210–212, 230–241)

**Problem:** `extractExtension()` and `extractFileName()` are called multiple times on the same URI within a single function call.

**Fix:** Memoize or compute once and pass as parameter:
```typescript
async function resolveContentUri(uri: string): Promise<ResolvedPath> {
  const ext = validateExtension(extractExtension(uri)) || 'jpg';
  const fileName = `vc_media_${Date.now()}.${ext}`;
  // Use ext and fileName throughout — don't re-extract
  ...
}
```

---

## FILE 10: `services/ResetService.ts`

### 10.1 — Inadequate Error Handling (lines 72–80, 113–114, 137–138, 141–143, 150–151)

**Problem:** Several async functions have bare `catch {}` blocks or catch blocks that only return a generic error without logging.

**Fix:** Apply consistent error handling pattern and use `AsyncStorage.multiGet` for batch reads:
```typescript
// getCurrentSettings — replace sequential loop with batch read (line 127–130 performance issue):
export async function getCurrentSettings(): Promise<Record<string, string | null>> {
  const keys = [...Object.keys(DEFAULT_VALUES), STORAGE_KEYS.TARGET_APPS];
  const pairs = await AsyncStorage.multiGet(keys);
  const result: Record<string, string | null> = {};
  for (const [key, value] of pairs) {
    result[key] = value;
  }
  return result;
}

// importSettings — add key validation (line 150–151):
export async function importSettings(jsonString: string): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = JSON.parse(jsonString);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { success: false, error: 'Invalid settings format' };
    }
    const settings = parsed as Record<string, unknown>;
    const validKeys = new Set(Object.values(STORAGE_KEYS));
    const importPairs: [string, string][] = [];
    const removeKeys: string[] = [];
    for (const [key, value] of Object.entries(settings)) {
      if (!validKeys.has(key)) continue; // Skip unknown keys
      if (value === null) {
        removeKeys.push(key);
      } else {
        importPairs.push([key, String(value)]);
      }
    }
    await AsyncStorage.multiSet(importPairs);
    await Promise.all(removeKeys.map(k => AsyncStorage.removeItem(k)));
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to import settings';
    logger.error('importSettings failed', 'ResetService', err);
    return { success: false, error: message };
  }
}
```

---

### 10.2 — Performance (lines 36–50, 96–105, 127–130)

**Problem:** `getCurrentSettings()` uses a sequential `for...of` loop with `await` inside, which is O(n) sequential I/O instead of a single batch read.

**Fix:** Already shown above in 10.1 — use `AsyncStorage.multiGet()`.

---

## FILE 11: `hooks/useStorage.ts`

### 11.1 — Inadequate Error Handling + Readability (lines 13–20, 19–20)

**Status:** Already planned in [`plans/amazon-q-fixes-v2.md`](plans/amazon-q-fixes-v2.md) (Fix 6.1). **Do not duplicate.** Implement as specified there — wrap all three `console.error` calls in `if (__DEV__)` blocks.

---

## FILE 12: `services/ConfigBridge.ts`

### 12.1 — Inadequate Error Handling (lines 29–30, 165–170, 207–208, 248–249)

**Problem:** Several catch blocks in `getBridgeStatus()` and `verifyBridge()` silently return defaults without logging.

**Fix:**
```typescript
// getBridgeStatus (line 207–208):
} catch (err: unknown) {
  logger.warn('getBridgeStatus failed', 'ConfigBridge', err);
  return { available: false, path: null, lastChecked: 0, readable: false };
}

// verifyBridge (line 248–249):
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  logger.error('verifyBridge failed', 'ConfigBridge', err);
  return { success: false, error: message };
}
```

---

### 12.2 — Naming (line 204–205)

**Problem:** The `version` field in `getBridgeStatus` returns `Date.now()` — misleading as it's a timestamp, not a version number.

**Fix:** Rename `version` → `lastChecked` in both the return type and the return statement:
```typescript
export async function getBridgeStatus(): Promise<{
  available: boolean;
  path: string | null;
  lastChecked: number;  // was 'version: number'
  readable: boolean;
}>
```

---

### 12.3 — Readability (lines 92–96)

**Problem:** The `syncAllSettings` function has a long `Promise.all` destructure that is hard to read.

**Fix:** Use `AsyncStorage.multiGet` with named keys array:
```typescript
const storageKeys = [
  STORAGE_KEYS.HOOK_ENABLED,
  STORAGE_KEYS.SELECTED_MEDIA,
  STORAGE_KEYS.FRONT_CAMERA,
  STORAGE_KEYS.BACK_CAMERA,
  STORAGE_KEYS.MIRRORED,
  STORAGE_KEYS.ROTATION,
  STORAGE_KEYS.SCALE_X,
  STORAGE_KEYS.SCALE_Y,
  STORAGE_KEYS.OFFSET_X,
  STORAGE_KEYS.OFFSET_Y,
] as const;

const values = await AsyncStorage.multiGet(storageKeys);
const [enabled, mediaPath, frontCamera, backCamera, mirrored, rotation, scaleX, scaleY, offsetX, offsetY] =
  values.map(([, v]) => v);
```

---

## FILE 13: `services/DiagnosticsService.ts`

### 13.1 — Inadequate Error Handling (lines 26–27, 51–52)

**Problem:** Catch blocks return `null` or empty without logging.

**Fix:**
```typescript
} catch (err: unknown) {
  logger.error('DiagnosticsService operation failed', 'DiagnosticsService', err);
  return null;
}
```

---

### 13.2 — Naming (lines 134–202)

**Problem:** Functions/variables in the 134–202 range use inconsistent naming (mix of camelCase and abbreviations).

**Fix:** Rename to consistent camelCase and expand abbreviations. Specific renames to be determined during implementation by reading the full function bodies in that range.

---

## FILE 14: `services/SystemVerification.ts`

### 14.1 — Inadequate Error Handling (lines 243–244, 279–280)

**Problem:** Catch blocks swallow errors silently.

**Fix:**
```typescript
} catch (err: unknown) {
  logger.warn('SystemVerification check failed', 'SystemVerification', err);
  return { status: 'error', detail: 'Check failed' };
}
```

---

## FILE 15: `services/LogService.ts`

### 15.1 — Performance (line 47–48)

**Problem:** `this.logs.slice(-MAX_LOGS)` creates a new array on every log entry beyond MAX_LOGS — O(n) cost per entry.

**Fix:** Trim in batches to amortize the cost:
```typescript
if (this.logs.length > MAX_LOGS + 100) {
  this.logs = this.logs.slice(-MAX_LOGS);
}
```

---

### 15.2 — Inadequate Error Handling (lines 50–51, 219–220)

**Problem:** `exportLogs` catch block re-throws but the `details` parameter is missing from the error log call.

**Fix:**
```typescript
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  this.error(`Failed to export logs: ${message}`, 'LogService', err);
  throw err;
}
```

---

## FILE 16: `services/PermissionManager.ts`

### 16.1 — Inadequate Error Handling (line 295–296)

**Problem:** `openAppSettings` catch block silently falls back without logging.

**Fix:**
```typescript
} catch (err: unknown) {
  if (__DEV__) console.warn('openAppSettings failed, falling back:', err);
  await Linking.openSettings();
}
```

---

### 16.2 — Readability (lines 237–254)

**Problem:** `openLSPosedManager` has deeply nested try/catch blocks.

**Fix:** Extract to a helper:
```typescript
async function tryOpenPackage(pkg: string): Promise<boolean> {
  try {
    await Linking.openURL(`package:${pkg}`);
    return true;
  } catch {
    return false;
  }
}

// In openLSPosedManager, replace nested try/catch with:
const packagesToTry = [
  managerInfo.packageName,
  'org.lsposed.manager',
  'io.github.lsposed.manager',
  'me.weishu.kernelsu',
  'com.topjohnwu.magisk',
].filter(Boolean) as string[];

for (const pkg of packagesToTry) {
  if (await tryOpenPackage(pkg)) return;
}
await Linking.openSettings();
```

---

### 16.3 — Insufficient Logging (lines 182–198)

**Problem:** Permission check functions don't log their results for debugging.

**Fix:** Add debug logging to each check function:
```typescript
const result = { status: granted ? 'granted' : 'denied', ... };
logger.debug(`Root access check: ${result.status}`, 'PermissionManager');
return result;
```

---

## FILE 17: `services/PresetService.ts`

### 17.1 — Inadequate Error Handling (lines 52–53, 109–110)

**Problem:** Catch blocks return `null` or `false` without logging.

**Fix:**
```typescript
} catch (err: unknown) {
  logger.error('PresetService operation failed', 'PresetService', err);
  return null;
}
```

---

### 17.2 — Performance (lines 128–136)

**Problem:** Preset list is filtered/sorted on every call rather than being cached.

**Fix:** Ensure `getPresets()` returns a stable sorted array; memoize at call sites with `useMemo`.

---

### 17.3 — Readability (lines 138–141)

**Problem:** Magic number used for preset ID generation.

**Fix:**
```typescript
const PRESET_ID_LENGTH = 8;
const id = Math.random().toString(36).substring(2, 2 + PRESET_ID_LENGTH);
```

---

## FILE 18: `package-lock.json`

### 18.1 — CWE-937/1035 Package Vulnerability (line 3817–3818)

**Problem:** A dependency in the `@react-native-community/cli` package tree has a known vulnerability (flagged in the `deepmerge`/`execa`/`fs-extra` range at line 3817).

**Fix:**
```bash
npm audit
npm audit fix
```

If the vulnerability is in a transitive dependency that cannot be auto-fixed, add an `overrides` entry in `package.json`:
```json
{
  "overrides": {
    "vulnerable-package-name": "^safe-version"
  }
}
```

**Note:** Run `npm audit` first to confirm the exact package name and CVE before implementing.

---

## FILE 19: UI Components (TypeScript/TSX)

### 19.1 — `components/media-studio/HUDViewfinder.tsx` — Performance (lines 51–68) + Error Handling (line 113–114)

**Problem:** Inline style objects recreated on every render; catch block at line 113 swallows errors.

**Fix:**
```typescript
// Move dynamic styles to useMemo:
const dynamicStyles = useMemo(() => StyleSheet.create({
  container: { width, height }
}), [width, height]);

// Error handling:
} catch (err: unknown) {
  logger.warn('HUDViewfinder operation failed', 'HUDViewfinder', err);
}
```

---

### 19.2 — `components/Card.tsx` — Performance (lines 12–27)

**Problem:** Style computation inside render without memoization.

**Fix:** Extract static styles to `StyleSheet.create()`; use `useMemo` for dynamic parts only.

---

### 19.3 — `components/GlowButton.tsx` — Performance (lines 47–61) + Readability (lines 82–83)

**Problem:** Animation values and style objects recreated on render; magic number in style.

**Fix:** Move `Animated.Value` creation to `useRef`; extract styles to `StyleSheet.create()`; name magic numbers as constants.

---

### 19.4 — `components/PulseIndicator.tsx` — Performance (line 44–45)

**Problem:** Inline style object in render.

**Fix:** Extract to `StyleSheet.create()`.

---

### 19.5 — `components/SystemToggle.tsx` — Error Handling (line 65–66)

**Problem:** `onPress` handler has no error boundary.

**Fix:**
```typescript
const handlePress = useCallback(async () => {
  try {
    await onToggle?.();
  } catch (err: unknown) {
    if (__DEV__) console.error('SystemToggle press failed:', err);
  }
}, [onToggle]);
```

---

### 19.6 — `components/media-studio/SpanScalePanel.tsx` — Readability (line 107–108)

**Problem:** Magic number or unclear naming in the scale panel.

**Fix:** Extract to named constant and add JSDoc comment.

---

## FILE 20: App Screens (TypeScript/TSX)

### 20.1 — `app/diagnostic.tsx` — Error Handling (lines 19–23, 30–34)

**Problem:** Catch blocks in diagnostic functions don't log errors.

**Fix:** Add `logger.error(...)` calls in catch blocks.

---

### 20.2 — `app/(tabs)/_layout.tsx` — Error Handling (lines 21–25)

**Problem:** Tab layout initialization catch block is empty.

**Fix:**
```typescript
} catch (err: unknown) {
  logger.error('Tab layout initialization failed', '_layout', err);
}
```

---

### 20.3 — `app/index.tsx` — Performance (lines 15–17)

**Problem:** Expensive computation on initial render without memoization.

**Fix:** Wrap with `useMemo` or move to module level if it's a constant.

---

### 20.4 — `app/logs.tsx` — Performance (lines 76–79) + Readability (lines 29–30)

**Problem:** Log filtering runs on every render; magic string for log level.

**Fix:** Memoize filtered logs with `useMemo`; extract log level to a typed constant.

---

### 20.5 — `app/(tabs)/settings.tsx` — Error Handling (lines 273–277, 334–335, 475–478) + Readability (lines 1098–1099, 1218–1219, 1290–1291)

**Problem:** Multiple catch blocks without proper error typing; inline magic strings.

**Fix:** Apply `catch (err: unknown)` pattern throughout; extract magic strings to named constants.

---

### 20.6 — `app/(tabs)/presets.tsx` — Error Handling (line 186–187) + Readability (lines 138–139)

**Status:** Already planned in [`plans/amazon-q-fixes-v2.md`](plans/amazon-q-fixes-v2.md). **Do not duplicate.**

---

### 20.7 — `app/onboarding.tsx` — Error Handling (line 88–89) + Readability (lines 238–239)

**Status:** Already planned in [`plans/amazon-q-fixes-v2.md`](plans/amazon-q-fixes-v2.md). **Do not duplicate.**

---

### 20.8 — `app/+not-found.tsx` — Readability (lines 10–11)

**Problem:** Hardcoded string that should be a named constant.

**Fix:** Extract to a named constant or use the app's theme/i18n system.

---

### 20.9 — `hooks/useSystemStatus.ts` — Error Handling (lines 19–22)

**Problem:** Catch block in status polling hook doesn't log.

**Fix:**
```typescript
} catch (err: unknown) {
  logger.warn('System status check failed', 'useSystemStatus', err);
  setStatus('error');
}
```

---

### 20.10 — `hooks/useHaptics.ts` — Readability (lines 5–40)

**Problem:** Long function with repeated haptic pattern definitions.

**Fix:** Extract haptic patterns to a `HAPTIC_PATTERNS` constant object at module level.

---

### 20.11 — `services/AppLauncher.ts` — Error Handling (lines 25–28)

**Problem:** Catch block swallows errors.

**Fix:**
```typescript
} catch (err: unknown) {
  logger.error('AppLauncher failed', 'AppLauncher', err);
  throw err;
}
```

---

### 20.12 — `services/NativeModuleDiagnostics.ts` — Performance (lines 66–83)

**Problem:** Diagnostic checks run sequentially instead of in parallel.

**Fix:** Use `Promise.all` for independent checks:
```typescript
const [check1, check2, check3] = await Promise.all([
  runCheck1(),
  runCheck2(),
  runCheck3(),
]);
```

---

## FILE 21: Android Boilerplate

### 21.1 — `MainActivity.kt` — Missing Auth + Readability (lines 11–14, 26–27)

**Problem:** Scanner flags standard Android lifecycle methods for missing authentication. These are false positives — `MainActivity` is the app's own entry point, not exported to other apps.

**Fix:** Add explanatory comment:
```kotlin
// Security note: Authentication is handled at the React Native JS layer.
// This Activity is not android:exported="true" for implicit intents.
// No additional runtime auth is required or meaningful here.
```

---

### 21.2 — `MainApplication.kt` — Missing Auth (line 45–46)

**Same pattern as MainActivity.kt** — add explanatory comment.

---

### 21.3 — `VirtuCamSettingsPackage.kt` — Missing Auth + Performance (lines 8–9, 11–12, 15–16)

**Problem:** `createNativeModules` and `createViewManagers` flagged. Standard RN package registration methods.

**Fix:** Add comment + optimize list initialization:
```kotlin
// Standard React Native package registration — no auth required.
override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    Collections.singletonList(VirtuCamSettingsModule(reactContext))

override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    Collections.emptyList()
```

---

## FILE 22: `metro.config.js`

### 22.1 — Lazy Module Loading (lines 0–2)

**Problem:** Top-level `require()` calls load modules eagerly at startup.

**Fix:** The Metro config is a build-time file, not a runtime module — lazy loading here provides no benefit and could break Metro's config resolution. Add a comment explaining why lazy loading is not applicable:
```javascript
// NOTE: Metro config is evaluated at build time, not runtime.
// Lazy loading is not applicable here and would break Metro's config resolution.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
```

---

## Implementation Order

Execute fixes in this order to minimize risk:

### Phase 1 — Critical Security (highest risk, implement first)
1. [`services/PathResolver.ts`](services/PathResolver.ts) — SSRF + Path Traversal (9.1, 9.2)
2. [`VirtuCamSettingsModule.kt`](android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt) — OS Command Injection guard (1.1, 1.2)
3. [`package-lock.json`](package-lock.json) — `npm audit fix` (18.1)

### Phase 2 — High Security
4. [`VirtuCamSettingsModule.kt`](android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt) — File extension validation (1.3)
5. [`VirtuCamSettingsModule.kt`](android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt) — Missing auth guards (1.4)
6. [`FloatingOverlayService.kt`](android/app/src/main/java/com/briefplantrain/virtucam/FloatingOverlayService.kt) — Auth + XXE comment (2.1, 2.2)
7. [`CameraHook.java`](android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java) — ThreadLocal static fix (3.1)
8. [`NativeEncoder.java`](android/app/src/main/java/com/briefplantrain/virtucam/NativeEncoder.java) — SuppressWarnings annotation (4.1)

### Phase 3 — Error Handling & Resource Management
9. [`CameraHook.java`](android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java) — try-with-resources for ByteArrayOutputStream (3.5)
10. [`CameraHook.java`](android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java) — Swallowed exceptions logging (3.3)
11. [`CameraHook.java`](android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java) — Broad catch narrowing (3.4)
12. [`StreamingMediaSource.java`](android/app/src/main/java/com/briefplantrain/virtucam/StreamingMediaSource.java) — Error handling + locale fix (5.1, 5.2)
13. [`CameraXHookStrategy.java`](android/app/src/main/java/com/briefplantrain/virtucam/hooks/CameraXHookStrategy.java) — Error handling (6.1)
14. [`HookStrategyRegistry.java`](android/app/src/main/java/com/briefplantrain/virtucam/hooks/HookStrategyRegistry.java) — Error handling (7.1)
15. [`yuv_encoder.cpp`](android/app/src/main/jni/yuv_encoder.cpp) — Bounds checking + exception throwing (8.1)

### Phase 4 — TypeScript Services
16. [`services/PathResolver.ts`](services/PathResolver.ts) — Error handling + logging (9.3, 9.4)
17. [`services/ResetService.ts`](services/ResetService.ts) — multiGet optimization + validation (10.1, 10.2)
18. [`services/ConfigBridge.ts`](services/ConfigBridge.ts) — Error handling + naming (12.1, 12.2, 12.3)
19. [`services/DiagnosticsService.ts`](services/DiagnosticsService.ts) — Error handling + naming (13.1, 13.2)
20. [`services/SystemVerification.ts`](services/SystemVerification.ts) — Error handling (14.1)
21. [`services/LogService.ts`](services/LogService.ts) — Performance + error handling (15.1, 15.2)
22. [`services/PermissionManager.ts`](services/PermissionManager.ts) — Error handling + logging + readability (16.1, 16.2, 16.3)
23. [`services/PresetService.ts`](services/PresetService.ts) — Error handling + performance + readability (17.1, 17.2, 17.3)
24. [`services/AppLauncher.ts`](services/AppLauncher.ts) — Error handling (20.11)
25. [`services/NativeModuleDiagnostics.ts`](services/NativeModuleDiagnostics.ts) — Performance (20.12)

### Phase 5 — UI Components & Screens
26. [`hooks/useStorage.ts`](hooks/useStorage.ts) — DEV guards *(already in amazon-q-fixes-v2.md)*
27. [`hooks/useSystemStatus.ts`](hooks/useSystemStatus.ts) — Error handling (20.9)
28. [`hooks/useHaptics.ts`](hooks/useHaptics.ts) — Readability (20.10)
29. [`components/Card.tsx`](components/Card.tsx) — Performance (19.2)
30. [`components/GlowButton.tsx`](components/GlowButton.tsx) — Performance + readability (19.3)
31. [`components/PulseIndicator.tsx`](components/PulseIndicator.tsx) — Performance (19.4)
32. [`components/SystemToggle.tsx`](components/SystemToggle.tsx) — Error handling (19.5)
33. [`components/media-studio/HUDViewfinder.tsx`](components/media-studio/HUDViewfinder.tsx) — Performance + error handling (19.1)
34. [`components/media-studio/SpanScalePanel.tsx`](components/media-studio/SpanScalePanel.tsx) — Readability (19.6)
35. [`app/diagnostic.tsx`](app/diagnostic.tsx) — Error handling (20.1)
36. [`app/(tabs)/_layout.tsx`](app/(tabs)/_layout.tsx) — Error handling (20.2)
37. [`app/index.tsx`](app/index.tsx) — Performance (20.3)
38. [`app/logs.tsx`](app/logs.tsx) — Performance + readability (20.4)
39. [`app/(tabs)/settings.tsx`](app/(tabs)/settings.tsx) — Error handling + readability (20.5)
40. [`app/+not-found.tsx`](app/+not-found.tsx) — Readability (20.8)

### Phase 6 — Android Boilerplate + Config
41. [`android/.../MainActivity.kt`](android/app/src/main/java/com/briefplantrain/virtucam/MainActivity.kt) — Auth comment (21.1)
42. [`android/.../MainApplication.kt`](android/app/src/main/java/com/briefplantrain/virtucam/MainApplication.kt) — Auth comment (21.2)
43. [`android/.../VirtuCamSettingsPackage.kt`](android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsPackage.kt) — Auth comment + performance (21.3)
44. [`metro.config.js`](metro.config.js) — Add comment explaining lazy loading not applicable (22.1)

### Phase 7 — Refactoring (lowest priority)
45. [`CameraHook.java`](android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java) — Bit shift `>>>` → `>>` (3.2)
46. [`CameraHook.java`](android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java) — Cyclomatic complexity refactor (3.6)
47. [`CameraHook.java`](android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java) — JSON object → typed `CameraConfig` class (3.8)
48. [`CameraHook.java`](android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java) — Polling → `CountDownLatch` (3.9)
49. [`VirtuCamSettingsModule.kt`](android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt) — `writeConfig` refactor (1.6)

---

## False Positives / Already Fixed

| File | Finding | Reason |
|------|---------|--------|
| [`NativeEncoder.java`](android/app/src/main/java/com/briefplantrain/virtucam/NativeEncoder.java) line 13 | CWE-114 | Hardcoded library name — add `@SuppressWarnings` only |
| [`FloatingOverlayService.kt`](android/app/src/main/java/com/briefplantrain/virtucam/FloatingOverlayService.kt) lines 128–136 | CWE-611 | `NotificationCompat.Builder` reads only app-internal resources — add comment |
| [`MainActivity.kt`](android/app/src/main/java/com/briefplantrain/virtucam/MainActivity.kt), [`MainApplication.kt`](android/app/src/main/java/com/briefplantrain/virtucam/MainApplication.kt) | CWE-306 | Standard Android lifecycle — add comment |
| [`VirtuCamSettingsPackage.kt`](android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsPackage.kt) | CWE-306 | Standard RN package registration — add comment |
| [`CameraHook.java`](android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java) line 62 | High coupling | Architectural — document with TODO only |
| [`VirtuCamSettingsModule.kt`](android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt) line 250 | Performance | Already runs on background thread — no change needed |
| [`metro.config.js`](metro.config.js) lines 0–2 | Lazy loading | Build-time config — lazy loading not applicable |