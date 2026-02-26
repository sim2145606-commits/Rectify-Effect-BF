# Hook Compatibility and Troubleshooting

## Active hook entrypoint

VirtuCam currently uses `com.briefplantrain.virtucam.xposed.XposedEntry` as defined in
`android/app/src/main/assets/xposed_init`.

## VCAM Compatibility Mode (Forced ON)

VCAM compatibility mode is **always enabled** at runtime for all targeted apps when the hook is active.
This ensures deterministic single-surface takeover behavior and eliminates "camera hook not working"
issues caused by multi-surface session configurations.

- The `vcamCompatibilityMode` config field is retained for backward compatibility but is **ignored at runtime**.
- The effective behavior is: `enabled && isTargeted(packageName)` → VCAM takeover path is always attempted first.
- If takeover fails for a specific call shape, the hook falls back to the standard remap logic.
- The UI shows VCAM compatibility as "Forced ON" and is non-editable.

### Black-frame behavior

When no media is selected (or `sourceMode=black`), the hook remains active and mapping events still
appear in logs. The camera output will be **intentionally black**. This is expected behavior, not a failure.

**Troubleshooting black output:** If hook is active but output is black, stage media in Studio
and set source mode to `file` or `test`.

## Camera API coverage checklist

- Camera2: `createCaptureSession(List<Surface>, ...)`
- Camera2: `createCaptureSessionByOutputConfigurations(...)`
- Camera2: `createCaptureSession(SessionConfiguration)` (Android P+)
- Camera2: `createConstrainedHighSpeedCaptureSession(...)`
- Camera2: `createReprocessableCaptureSession(...)` (Android M+)
- Camera2: `createReprocessableCaptureSessionByConfigurations(...)` (Android N+)
- Camera2 request target remap: `CaptureRequest.Builder.addTarget/removeTarget`
- Surface metadata tracking:
  - `new Surface(SurfaceTexture)`
  - `SurfaceTexture.setDefaultBufferSize(...)`

## Runtime diagnostics markers

Look for these tags:

- `VirtuCam/XposedEntry`:
  - package/process load confirmation
  - hook install status per overload
  - mapped output counts
  - `vcam_takeover_applied` — VCAM strict takeover was successfully applied
  - `vcam_takeover_fallback` — VCAM takeover returned false; fell back to remap logic
- `VirtuCam/Engine`:
  - render loop activity and frame-source fallback messages
  - `vcamCompatForced=true` in routing debug summary

## App camera stack → expected path

- Pure Camera2 app:
  - Session hooks + CaptureRequest target remap should be active.
  - VCAM takeover always attempted first.
- CameraX app:
  - CameraX eventually calls Camera2; the Camera2 hook set above should still apply.
- Legacy Camera1 app:
  - Requires dedicated Camera1 path in the active entrypoint.

## Notes compared with public virtual camera modules

Public modules often stabilize compatibility by:

1. Hooking multiple Camera2 session creation overloads (instead of just one).
2. Logging target resolution and mapped surface counts.
3. Providing explicit runtime feedback for misconfigured media path or permissions.
4. Using strict single-surface takeover (VCAM-style) for maximum compatibility.

This repo follows all four patterns. VCAM compatibility mode is forced ON at runtime to ensure
deterministic behavior across all targeted apps.
