# VCAM-Style Camera Hooking Hard-Force Plan

## Summary
Force camera hooking to run in VCAM-style strict takeover mode for all targeted apps, with no user-off switch, and keep deterministic black-frame output when media is missing.  
This means the active hook path will always prioritize single-surface compatibility takeover (VCAM-like behavior) and only use internal safety fallback when takeover is impossible for a specific call shape.

## Scope and Goal
- Goal: make hook behavior deterministic and VCAM-like so “camera hook not working” is eliminated in targeted apps.
- In scope: Camera2 hook behavior, config defaults/semantics, diagnostics truth, UI/UX wording, and verification flow.
- Out of scope: switching primary entrypoint to deprecated legacy `CameraHook` engine.

## Implementation Plan

### 1. Force VCAM compatibility mode at runtime
- Update config/runtime semantics so compatibility mode is effectively always on when hook is enabled and package is targeted.
- File changes:
  - [ConfigSnapshot.java](c:/Users/Administrator/Downloads/virtucam/android/app/src/main/java/com/briefplantrain/virtucam/config/ConfigSnapshot.java)
  - [ConfigLoader.java](c:/Users/Administrator/Downloads/virtucam/android/app/src/main/java/com/briefplantrain/virtucam/config/ConfigLoader.java)
  - [VirtualCameraEngine.java](c:/Users/Administrator/Downloads/virtucam/android/app/src/main/java/com/briefplantrain/virtucam/engine/VirtualCameraEngine.java)
- Concrete behavior:
  - Keep parsing `vcamCompatibilityMode` for backward compatibility, but override effective runtime value to `true`.
  - `isVcamCompatibilityModeEnabled()` becomes equivalent to `cfg.enabled && cfg.isTargeted(packageName)`.

### 2. Make session hooks always use VCAM-style takeover first
- Apply strict takeover path in all Camera2 session creation overloads unconditionally (when engine is active for targeted package).
- File changes:
  - [XposedEntry.java](c:/Users/Administrator/Downloads/virtucam/android/app/src/main/java/com/briefplantrain/virtucam/xposed/XposedEntry.java)
- Concrete behavior:
  - Always attempt `applyVcamCompatTakeoverSurfaceList`, `applyVcamCompatTakeoverOutputConfigList`, and `applyVcamCompatTakeoverSessionConfiguration`.
  - Keep defensive fallback to existing remap logic only if takeover returns false for that specific call.
  - Preserve alias routing (`enableVcamCompatibilityAliases`) and single-output takeover behavior.
  - Add explicit rate-limited logs for `vcam_takeover_applied` and `vcam_takeover_fallback`.

### 3. Lock UI control to forced ON
- Convert VCAM compatibility switch into non-editable forced state to avoid accidental disable.
- File changes:
  - [settings.tsx](c:/Users/Administrator/Downloads/virtucam/app/(tabs)/settings.tsx)
- Concrete behavior:
  - Replace editable switch with a forced-on indicator (`Forced ON`).
  - Add explanatory text: “VCAM compatibility is always enabled for stability.”

### 4. Align bridge/default/reset semantics with forced mode
- Ensure all default and reset flows write compatibility as true so persisted config matches runtime.
- File changes:
  - [ConfigBridge.ts](c:/Users/Administrator/Downloads/virtucam/services/ConfigBridge.ts)
  - [ResetService.ts](c:/Users/Administrator/Downloads/virtucam/services/ResetService.ts)
- Concrete behavior:
  - Default `vcamCompatibilityMode` becomes `true`.
  - Reset defaults and bridge write paths set `vcamCompatibilityMode: true`.
  - Stored legacy `false` values are tolerated but ignored at runtime.

### 5. Diagnostics and status parity updates
- Report VCAM as forced and clarify black-frame behavior when media is absent.
- File changes:
  - [VirtuCamSettingsModule.kt](c:/Users/Administrator/Downloads/virtucam/android/app/src/main/java/com/briefplantrain/virtucam/VirtuCamSettingsModule.kt)
  - [DiagnosticsService.ts](c:/Users/Administrator/Downloads/virtucam/services/DiagnosticsService.ts)
  - [SystemVerification.ts](c:/Users/Administrator/Downloads/virtucam/services/SystemVerification.ts)
  - [PermissionManager.ts](c:/Users/Administrator/Downloads/virtucam/services/PermissionManager.ts)
- Concrete behavior:
  - Add/report `vcamCompatibilityForced=true`.
  - Keep `runtimeObservedFresh` gate as source of truth.
  - When `sourceMode=black` or no media, diagnostics explicitly state “hook active, output intentionally black.”

### 6. Onboarding and troubleshooting copy alignment
- Ensure verification language reflects forced VCAM and black-frame default.
- File changes:
  - [onboarding.tsx](c:/Users/Administrator/Downloads/virtucam/app/onboarding.tsx)
  - [docs_hook_compatibility.md](c:/Users/Administrator/Downloads/virtucam/docs_hook_compatibility.md)
- Concrete behavior:
  - Demo/check text should not treat forced compatibility as optional.
  - Troubleshooting should direct users to media staging if hook is active but output is black.

## Public API / Interface Changes
- `checkXposedStatus` adds:
  - `vcamCompatibilityForced: boolean`
- TS interfaces extended in diagnostics/verification/permission services:
  - `vcamCompatibilityForced?: boolean`
- `BridgeConfig.vcamCompatibilityMode` remains for compatibility but is now informational; runtime behavior is forced ON.

## Test Cases and Scenarios

1. Existing user config has `vcamCompatibilityMode=false`.
- Expected: runtime still uses VCAM takeover path; diagnostics show forced=true.

2. Targeted stock camera open (`com.android.camera`).
- Expected logs include `compat takeover active` and positive `mapped=1` events.

3. Targeted Messenger/OEM camera app open.
- Expected: takeover path triggers and request target aliasing remains stable.

4. No media selected (`sourceMode=black` effective).
- Expected: hook remains active, mapping events still appear, output is black with explicit diagnostics note.

5. Untargeted app camera open.
- Expected: no takeover/mapping activity for that package.

6. Runtime freshness window test.
- Expected: `runtimeObservedFresh` governs `ready`; stale observations do not produce false ready.

7. UI behavior.
- Expected: VCAM compatibility control is non-editable and labeled forced ON.

8. Reset flow.
- Expected: reset writes `vcamCompatibilityMode=true` and runtime remains forced regardless of stored value.

## Assumptions and Defaults
- Chosen behavior: **Always VCAM mode**.
- Chosen control policy: **Force ON and lock in UI**.
- Chosen missing-media behavior: **black frame output**.
- Active hook entrypoint stays [xposed_init](c:/Users/Administrator/Downloads/virtucam/android/app/src/main/assets/xposed_init) -> `xposed/XposedEntry`.
- No switch to deprecated legacy [CameraHook.java](c:/Users/Administrator/Downloads/virtucam/android/app/src/main/java/com/briefplantrain/virtucam/CameraHook.java) as primary engine.
