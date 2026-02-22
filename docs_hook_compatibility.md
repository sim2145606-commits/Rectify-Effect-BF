# Hook Compatibility and Troubleshooting

## Active hook entrypoint

VirtuCam currently uses `com.briefplantrain.virtucam.xposed.XposedEntry` as defined in
`android/app/src/main/assets/xposed_init`.

## Camera API coverage checklist

- Camera2: `createCaptureSession(List<Surface>, ...)`
- Camera2: `createCaptureSessionByOutputConfigurations(...)`
- Camera2: `createCaptureSession(SessionConfiguration)` (Android P+)
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
- `VirtuCam/Engine`:
  - render loop activity and frame-source fallback messages

## App camera stack → expected path

- Pure Camera2 app:
  - Session hooks + CaptureRequest target remap should be active.
- CameraX app:
  - CameraX eventually calls Camera2; the Camera2 hook set above should still apply.
- Legacy Camera1 app:
  - Requires dedicated Camera1 path in the active entrypoint.

## Notes compared with public virtual camera modules

Public modules often stabilize compatibility by:

1. Hooking multiple Camera2 session creation overloads (instead of just one).
2. Logging target resolution and mapped surface counts.
3. Providing explicit runtime feedback for misconfigured media path or permissions.

This repo now follows (1) and (2) in the active Xposed entrypoint and adds clearer source-mode fallback logging.
