package com.briefplantrain.virtucam.xposed;

import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.InputConfiguration;
import android.hardware.camera2.params.OutputConfiguration;
import android.hardware.camera2.params.SessionConfiguration;
import android.media.ImageReader;
import android.os.Build;
import android.os.Handler;
import android.view.Surface;

import com.briefplantrain.virtucam.engine.VirtualCameraEngine;
import com.briefplantrain.virtucam.util.LogUtil;
import com.briefplantrain.virtucam.util.VirtuCamIPC;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;

import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.IXposedHookZygoteInit;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage;

/**
 * Main Xposed entry point — VCAM-style surface substitution model.
 *
 * Architecture (matching proven VCAM approach):
 *   1. Give the real camera a THROWAWAY surface (it captures to nowhere).
 *   2. Feed the app's ORIGINAL surfaces with MediaPlayer (preview) + MediaCodec (ImageReader).
 *   3. The app receives valid frames on its own surfaces and never knows the difference.
 *
 * Hook chain:
 *   CameraManager.openCamera -> capture StateCallback.onOpened -> get runtime CameraDevice class
 *   -> hook all createCaptureSession variants on the RUNTIME class (not hardcoded CameraDeviceImpl)
 *   -> replace surface list with [throwaway_surface]
 *   -> hook addTarget to classify surfaces (preview vs ImageReader)
 *   -> hook CaptureRequest.Builder.build to trigger frame delivery
 *   -> ImageReader.newInstance to capture expected format/size
 */
public final class XposedEntry implements IXposedHookLoadPackage, IXposedHookZygoteInit {

    private static final String TAG = "VirtuCam/XposedEntry";

    private static final Set<String> INSTALLED = ConcurrentHashMap.newKeySet();
    private static final Set<String> SKIP_PACKAGES = ConcurrentHashMap.newKeySet();

    static {
        SKIP_PACKAGES.add("com.briefplantrain.virtucam");
        SKIP_PACKAGES.add("android");
        SKIP_PACKAGES.add("system");
        SKIP_PACKAGES.add("com.android.systemui");
    }

    @Override
    public void initZygote(StartupParam startupParam) {
        LogUtil.setVerboseLogging(isVerboseGateEnabled());
        LogUtil.d(TAG, "initZygote: VirtuCam VCAM-model hook ready");
    }

    @Override
    public void handleLoadPackage(XC_LoadPackage.LoadPackageParam lpparam) {
        LogUtil.setVerboseLogging(isVerboseGateEnabled());

        if (SKIP_PACKAGES.contains(lpparam.packageName)) return;

        final String key = lpparam.processName != null ? lpparam.processName : lpparam.packageName;
        if (!INSTALLED.add(key)) return;

        LogUtil.d(TAG, "handleLoadPackage: pkg=" + lpparam.packageName + " proc=" + lpparam.processName);

        VirtualCameraEngine engine;
        try {
            engine = VirtualCameraEngine.getOrCreate(lpparam.packageName, lpparam.processName);
        } catch (Throwable t) {
            XposedBridge.log(TAG + ": Engine init failed for " + lpparam.packageName + ": " + t.getMessage());
            return;
        }

        // Install hooks
        installCameraManagerOpenHook(lpparam.classLoader, engine);
        installImageReaderHook(engine);
        installCaptureRequestHooks(engine);
        installCamera1Hooks(engine);

        LogUtil.always(TAG, "module active in process: " + key);
        try { VirtuCamIPC.writeModuleActiveMarker(); } catch (Throwable ignored) {}
    }

    // ──────────────────────────────────────────────────────────────────────
    // CAMERA2 HOOKS — VCAM-style dynamic runtime class hooking
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Hook CameraManager.openCamera to capture the app's StateCallback.
     * When onOpened fires, we get the runtime CameraDevice class and hook its
     * createCaptureSession variants dynamically — catching vendor subclasses.
     */
    private static void installCameraManagerOpenHook(ClassLoader classLoader, final VirtualCameraEngine engine) {
        try {
            // Hook openCamera(String, StateCallback, Handler) — pre-P
            XposedHelpers.findAndHookMethod(
                    CameraManager.class,
                    "openCamera",
                    String.class,
                    CameraDevice.StateCallback.class,
                    Handler.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            CameraDevice.StateCallback originalCallback =
                                    (CameraDevice.StateCallback) param.args[1];
                            if (originalCallback == null) return;
                            hookStateCallbackOnOpened(originalCallback.getClass(), engine);
                        }
                    }
            );

            // Hook openCamera(String, Executor, StateCallback) — API 28+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                XposedHelpers.findAndHookMethod(
                        CameraManager.class,
                        "openCamera",
                        String.class,
                        Executor.class,
                        CameraDevice.StateCallback.class,
                        new XC_MethodHook() {
                            @Override
                            protected void beforeHookedMethod(MethodHookParam param) {
                                CameraDevice.StateCallback originalCallback =
                                        (CameraDevice.StateCallback) param.args[2];
                                if (originalCallback == null) return;
                                hookStateCallbackOnOpened(originalCallback.getClass(), engine);
                            }
                        }
                );
            }

            LogUtil.d(TAG, "CameraManager.openCamera hooks installed");
        } catch (Throwable t) {
            LogUtil.e(TAG, "CameraManager.openCamera hooks failed", t);
        }
    }

    /** Prevent double-hooking the same StateCallback class. */
    private static final Set<Class<?>> HOOKED_CALLBACK_CLASSES = ConcurrentHashMap.newKeySet();

    /**
     * Hook the app's StateCallback.onOpened to get the runtime CameraDevice object.
     * From that object's class, we hook all createCaptureSession variants.
     */
    private static void hookStateCallbackOnOpened(Class<?> callbackClass, final VirtualCameraEngine engine) {
        if (callbackClass == null) return;
        if (!HOOKED_CALLBACK_CLASSES.add(callbackClass)) return;

        try {
            XposedHelpers.findAndHookMethod(
                    callbackClass,
                    "onOpened",
                    CameraDevice.class,
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            CameraDevice device = (CameraDevice) param.args[0];
                            if (device == null) return;

                            // Reset engine state for new camera session
                            engine.onCameraOpened();

                            // Get the RUNTIME class — catches vendor subclasses
                            Class<?> deviceClass = device.getClass();
                            hookCameraDeviceSessionCreation(deviceClass, engine);
                        }
                    }
            );
            LogUtil.d(TAG, "Hooked StateCallback.onOpened on " + callbackClass.getName());
        } catch (Throwable t) {
            LogUtil.w(TAG, "Failed to hook onOpened on " + callbackClass.getName(), t);
        }
    }

    /** Prevent double-hooking the same CameraDevice implementation class. */
    private static final Set<Class<?>> HOOKED_DEVICE_CLASSES = ConcurrentHashMap.newKeySet();

    /**
     * Hook all createCaptureSession variants on the runtime CameraDevice class.
     * Replaces the surface list with a single throwaway surface.
     */
    private static void hookCameraDeviceSessionCreation(Class<?> deviceClass, final VirtualCameraEngine engine) {
        if (deviceClass == null) return;
        if (!HOOKED_DEVICE_CLASSES.add(deviceClass)) return;

        LogUtil.d(TAG, "Hooking Camera2 session on runtime class: " + deviceClass.getName());

        // 1. createCaptureSession(List<Surface>, StateCallback, Handler)
        try {
            XposedHelpers.findAndHookMethod(deviceClass,
                    "createCaptureSession",
                    List.class,
                    CameraCaptureSession.StateCallback.class,
                    Handler.class,
                    new SessionSurfaceListHook(engine, 0, "createCaptureSession(List)"));
        } catch (Throwable t) {
            LogUtil.d(TAG, "createCaptureSession(List) not found on " + deviceClass.getName());
        }

        // 2. createConstrainedHighSpeedCaptureSession
        try {
            XposedHelpers.findAndHookMethod(deviceClass,
                    "createConstrainedHighSpeedCaptureSession",
                    List.class,
                    CameraCaptureSession.StateCallback.class,
                    Handler.class,
                    new SessionSurfaceListHook(engine, 0, "createConstrainedHighSpeedCaptureSession"));
        } catch (Throwable t) {
            LogUtil.d(TAG, "createConstrainedHighSpeedCaptureSession not found");
        }

        // 3. createReprocessableCaptureSession (API 23+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                XposedHelpers.findAndHookMethod(deviceClass,
                        "createReprocessableCaptureSession",
                        InputConfiguration.class,
                        List.class,
                        CameraCaptureSession.StateCallback.class,
                        Handler.class,
                        new SessionSurfaceListHook(engine, 1, "createReprocessableCaptureSession"));
            } catch (Throwable ignored) {}
        }

        // 4. createCaptureSessionByOutputConfigurations (API 24+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                XposedHelpers.findAndHookMethod(deviceClass,
                        "createCaptureSessionByOutputConfigurations",
                        List.class,
                        CameraCaptureSession.StateCallback.class,
                        Handler.class,
                        new SessionOutputConfigListHook(engine, 0, "createCaptureSessionByOutputConfigurations"));
            } catch (Throwable ignored) {}

            try {
                XposedHelpers.findAndHookMethod(deviceClass,
                        "createReprocessableCaptureSessionByConfigurations",
                        InputConfiguration.class,
                        List.class,
                        CameraCaptureSession.StateCallback.class,
                        Handler.class,
                        new SessionOutputConfigListHook(engine, 1, "createReprocessableCaptureSessionByConfigurations"));
            } catch (Throwable ignored) {}
        }

        // 5. createCaptureSession(SessionConfiguration) — API 28+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                XposedHelpers.findAndHookMethod(deviceClass,
                        "createCaptureSession",
                        SessionConfiguration.class,
                        new XC_MethodHook() {
                            @Override
                            protected void beforeHookedMethod(MethodHookParam param) {
                                if (!engine.isActive()) return;
                                SessionConfiguration sc = (SessionConfiguration) param.args[0];
                                if (sc == null) return;

                                List<OutputConfiguration> outputs = sc.getOutputConfigurations();
                                if (outputs == null || outputs.isEmpty()) return;

                                // Collect original surfaces for tracking
                                List<Surface> originals = new ArrayList<>();
                                for (OutputConfiguration oc : outputs) {
                                    Surface s = safeGetSurface(oc);
                                    if (s != null) originals.add(s);
                                }
                                engine.trackOriginalSurfaces(originals);

                                // Replace with throwaway surface
                                Surface throwaway = engine.getOrCreateThrowawaySurface();
                                OutputConfiguration throwawayConfig = new OutputConfiguration(throwaway);
                                List<OutputConfiguration> replaced = new ArrayList<>();
                                replaced.add(throwawayConfig);

                                SessionConfiguration rebuilt = rebuildSessionConfiguration(sc, replaced);
                                if (rebuilt != null) {
                                    param.args[0] = rebuilt;
                                    LogUtil.i(TAG, "createCaptureSession(SessionConfig) replaced " +
                                            originals.size() + " surfaces with throwaway");
                                }
                            }
                        });
            } catch (Throwable ignored) {}
        }

        LogUtil.d(TAG, "Camera2 session hooks installed on " + deviceClass.getName());
    }

    // ──────────────────────────────────────────────────────────────────────
    // Session hook implementations — Surface list substitution
    // ──────────────────────────────────────────────────────────────────────

    /**
     * For createCaptureSession variants taking List<Surface>.
     * Replaces the entire list with a single throwaway surface.
     */
    private static class SessionSurfaceListHook extends XC_MethodHook {
        private final VirtualCameraEngine engine;
        private final int argIndex;
        private final String hookName;

        SessionSurfaceListHook(VirtualCameraEngine engine, int argIndex, String hookName) {
            this.engine = engine;
            this.argIndex = argIndex;
            this.hookName = hookName;
        }

        @Override
        protected void beforeHookedMethod(MethodHookParam param) {
            if (!engine.isActive()) return;

            Object arg = param.args[argIndex];
            if (!(arg instanceof List)) return;

            @SuppressWarnings("unchecked")
            List<Surface> in = (List<Surface>) arg;
            if (in.isEmpty()) return;

            // Track all original surfaces by type
            engine.trackOriginalSurfaces(in);

            // Replace with single throwaway surface
            Surface throwaway = engine.getOrCreateThrowawaySurface();
            List<Surface> replaced = new ArrayList<>(1);
            replaced.add(throwaway);
            param.args[argIndex] = replaced;

            LogUtil.i(TAG, hookName + ": replaced " + in.size() +
                    " original surfaces with throwaway");
        }
    }

    /**
     * For createCaptureSession variants taking List<OutputConfiguration>.
     */
    private static class SessionOutputConfigListHook extends XC_MethodHook {
        private final VirtualCameraEngine engine;
        private final int argIndex;
        private final String hookName;

        SessionOutputConfigListHook(VirtualCameraEngine engine, int argIndex, String hookName) {
            this.engine = engine;
            this.argIndex = argIndex;
            this.hookName = hookName;
        }

        @Override
        protected void beforeHookedMethod(MethodHookParam param) {
            if (!engine.isActive()) return;

            Object arg = param.args[argIndex];
            if (!(arg instanceof List)) return;

            @SuppressWarnings("unchecked")
            List<OutputConfiguration> in = (List<OutputConfiguration>) arg;
            if (in.isEmpty()) return;

            List<Surface> originals = new ArrayList<>();
            for (OutputConfiguration oc : in) {
                Surface s = safeGetSurface(oc);
                if (s != null) originals.add(s);
            }
            engine.trackOriginalSurfaces(originals);

            Surface throwaway = engine.getOrCreateThrowawaySurface();
            OutputConfiguration throwawayConfig = new OutputConfiguration(throwaway);
            List<OutputConfiguration> replaced = new ArrayList<>(1);
            replaced.add(throwawayConfig);
            param.args[argIndex] = replaced;

            LogUtil.i(TAG, hookName + ": replaced " + in.size() +
                    " output configs with throwaway");
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // CaptureRequest hooks — surface classification & playback trigger
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Hook addTarget/removeTarget to classify surfaces (preview vs ImageReader)
     * and hook build() to trigger playback when the first request is built.
     */
    private static void installCaptureRequestHooks(final VirtualCameraEngine engine) {
        try {
            // addTarget — classify and redirect to throwaway
            XposedHelpers.findAndHookMethod(
                    CaptureRequest.Builder.class,
                    "addTarget",
                    Surface.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (!engine.isActive()) return;

                            Surface original = (Surface) param.args[0];
                            if (original == null) return;

                            // Classify: "Surface(name=null)" = ImageReader, else = preview
                            String surfaceStr = original.toString();
                            boolean isImageReader = surfaceStr.contains("Surface(name=null)");

                            engine.classifyAndStoreSurface(original, isImageReader);

                            // Redirect to throwaway
                            Surface throwaway = engine.getOrCreateThrowawaySurface();
                            if (throwaway != null) {
                                param.args[0] = throwaway;
                            }
                        }
                    }
            );

            // removeTarget — track surface removal
            XposedHelpers.findAndHookMethod(
                    CaptureRequest.Builder.class,
                    "removeTarget",
                    Surface.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (!engine.isActive()) return;
                            Surface original = (Surface) param.args[0];
                            engine.onSurfaceRemoved(original);

                            Surface throwaway = engine.getOrCreateThrowawaySurface();
                            if (throwaway != null) {
                                param.args[0] = throwaway;
                            }
                        }
                    }
            );

            // build() — trigger frame delivery
            XposedHelpers.findAndHookMethod(
                    CaptureRequest.Builder.class,
                    "build",
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (!engine.isActive()) return;
                            engine.onCaptureRequestBuild();
                        }
                    }
            );

            LogUtil.d(TAG, "CaptureRequest hooks installed");
        } catch (Throwable t) {
            LogUtil.e(TAG, "CaptureRequest hooks failed", t);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // ImageReader hook — capture expected format/size
    // ──────────────────────────────────────────────────────────────────────

    private static void installImageReaderHook(final VirtualCameraEngine engine) {
        try {
            XposedHelpers.findAndHookMethod(
                    ImageReader.class,
                    "newInstance",
                    int.class, int.class, int.class, int.class,
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            int width = (int) param.args[0];
                            int height = (int) param.args[1];
                            int format = (int) param.args[2];
                            engine.onImageReaderCreated(width, height, format);
                            LogUtil.d(TAG, "ImageReader.newInstance: " +
                                    width + "x" + height + " format=" + format);
                        }
                    }
            );
            LogUtil.d(TAG, "ImageReader.newInstance hook installed");
        } catch (Throwable t) {
            LogUtil.d(TAG, "ImageReader.newInstance hook failed (non-critical)");
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // CAMERA1 HOOKS — Legacy Camera API full coverage
    // ──────────────────────────────────────────────────────────────────────

    @SuppressWarnings("deprecation")
    private static void installCamera1Hooks(final VirtualCameraEngine engine) {
        try {
            // setPreviewTexture — swap with fake, save original
            XposedHelpers.findAndHookMethod(
                    android.hardware.Camera.class,
                    "setPreviewTexture",
                    SurfaceTexture.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (!engine.isActive()) return;
                            SurfaceTexture original = (SurfaceTexture) param.args[0];
                            if (original == null) return;

                            engine.storeCamera1OriginalTexture(original);

                            // Replace with fake — real camera data goes to garbage
                            SurfaceTexture fake = new SurfaceTexture(10);
                            param.args[0] = fake;
                            LogUtil.d(TAG, "Camera1.setPreviewTexture: swapped with fake");
                        }
                    }
            );

            // setPreviewDisplay — swap with fake texture, save original holder
            XposedHelpers.findAndHookMethod(
                    android.hardware.Camera.class,
                    "setPreviewDisplay",
                    android.view.SurfaceHolder.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (!engine.isActive()) return;
                            android.view.SurfaceHolder originalHolder =
                                    (android.view.SurfaceHolder) param.args[0];
                            if (originalHolder == null) return;

                            engine.storeCamera1OriginalHolder(originalHolder);

                            // Redirect camera to a fake texture
                            SurfaceTexture fake = new SurfaceTexture(11);
                            try {
                                android.hardware.Camera camera =
                                        (android.hardware.Camera) param.thisObject;
                                camera.setPreviewTexture(fake);
                                param.setResult(null); // Skip original setPreviewDisplay
                            } catch (Throwable t) {
                                LogUtil.w(TAG, "Camera1.setPreviewDisplay fallback failed", t);
                            }
                        }
                    }
            );

            // startPreview — start MediaPlayer on the app's ORIGINAL surface
            XposedHelpers.findAndHookMethod(
                    android.hardware.Camera.class,
                    "startPreview",
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (!engine.isActive()) return;
                            engine.startCamera1Playback();
                            LogUtil.d(TAG, "Camera1.startPreview: triggered playback");
                        }
                    }
            );

            // setPreviewCallbackWithBuffer
            XposedHelpers.findAndHookMethod(
                    android.hardware.Camera.class,
                    "setPreviewCallbackWithBuffer",
                    android.hardware.Camera.PreviewCallback.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (!engine.isActive()) return;
                            android.hardware.Camera.PreviewCallback cb =
                                    (android.hardware.Camera.PreviewCallback) param.args[0];
                            if (cb != null) hookCamera1PreviewCallback(cb.getClass(), engine);
                        }
                    }
            );

            // setPreviewCallback
            XposedHelpers.findAndHookMethod(
                    android.hardware.Camera.class,
                    "setPreviewCallback",
                    android.hardware.Camera.PreviewCallback.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (!engine.isActive()) return;
                            android.hardware.Camera.PreviewCallback cb =
                                    (android.hardware.Camera.PreviewCallback) param.args[0];
                            if (cb != null) hookCamera1PreviewCallback(cb.getClass(), engine);
                        }
                    }
            );

            // setOneShotPreviewCallback
            XposedHelpers.findAndHookMethod(
                    android.hardware.Camera.class,
                    "setOneShotPreviewCallback",
                    android.hardware.Camera.PreviewCallback.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (!engine.isActive()) return;
                            android.hardware.Camera.PreviewCallback cb =
                                    (android.hardware.Camera.PreviewCallback) param.args[0];
                            if (cb != null) hookCamera1PreviewCallback(cb.getClass(), engine);
                        }
                    }
            );

            // addCallbackBuffer — zero buffer to prevent real data leaking
            XposedHelpers.findAndHookMethod(
                    android.hardware.Camera.class,
                    "addCallbackBuffer",
                    byte[].class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (!engine.isActive()) return;
                            byte[] buf = (byte[]) param.args[0];
                            if (buf != null) java.util.Arrays.fill(buf, (byte) 0);
                        }
                    }
            );

            // takePicture — intercept JPEG and raw callbacks
            XposedHelpers.findAndHookMethod(
                    android.hardware.Camera.class,
                    "takePicture",
                    android.hardware.Camera.ShutterCallback.class,
                    android.hardware.Camera.PictureCallback.class,
                    android.hardware.Camera.PictureCallback.class,
                    android.hardware.Camera.PictureCallback.class,
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            if (!engine.isActive()) return;
                            // JPEG callback (arg 3)
                            android.hardware.Camera.PictureCallback jpegCb =
                                    (android.hardware.Camera.PictureCallback) param.args[3];
                            if (jpegCb != null) {
                                hookCamera1PictureCallback(jpegCb.getClass(), engine, true);
                            }
                            // raw/YUV callback (arg 1)
                            android.hardware.Camera.PictureCallback rawCb =
                                    (android.hardware.Camera.PictureCallback) param.args[1];
                            if (rawCb != null) {
                                hookCamera1PictureCallback(rawCb.getClass(), engine, false);
                            }
                        }
                    }
            );

            LogUtil.d(TAG, "Camera1 hooks installed");
        } catch (Throwable t) {
            LogUtil.e(TAG, "Camera1 hooks failed", t);
        }
    }

    /** Prevent double-hooking the same PreviewCallback class. */
    private static final Set<Class<?>> HOOKED_PREVIEW_CALLBACKS = ConcurrentHashMap.newKeySet();

    @SuppressWarnings("deprecation")
    private static void hookCamera1PreviewCallback(Class<?> callbackClass, final VirtualCameraEngine engine) {
        if (!HOOKED_PREVIEW_CALLBACKS.add(callbackClass)) return;

        try {
            XposedHelpers.findAndHookMethod(callbackClass,
                    "onPreviewFrame",
                    byte[].class,
                    android.hardware.Camera.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (!engine.isActive()) return;
                            byte[] data = (byte[]) param.args[0];
                            if (data == null) return;

                            // Capture camera dimensions on first callback
                            android.hardware.Camera camera =
                                    (android.hardware.Camera) param.args[1];
                            if (camera != null) {
                                try {
                                    android.hardware.Camera.Parameters params = camera.getParameters();
                                    android.hardware.Camera.Size size = params.getPreviewSize();
                                    if (size != null) {
                                        engine.ensureCamera1Decoder(size.width, size.height);
                                    }
                                } catch (Throwable ignored) {}
                            }

                            // Replace frame data with virtual content
                            byte[] virtualFrame = engine.getCamera1Frame();
                            if (virtualFrame != null && virtualFrame.length <= data.length) {
                                System.arraycopy(virtualFrame, 0, data, 0, virtualFrame.length);
                            }
                        }
                    }
            );
            LogUtil.d(TAG, "Hooked onPreviewFrame on " + callbackClass.getName());
        } catch (Throwable t) {
            LogUtil.w(TAG, "Failed to hook onPreviewFrame: " + t.getMessage());
        }
    }

    /** Prevent double-hooking the same PictureCallback class. */
    private static final Set<Class<?>> HOOKED_PICTURE_CALLBACKS = ConcurrentHashMap.newKeySet();

    @SuppressWarnings("deprecation")
    private static void hookCamera1PictureCallback(Class<?> callbackClass,
                                                   final VirtualCameraEngine engine,
                                                   final boolean isJpeg) {
        if (!HOOKED_PICTURE_CALLBACKS.add(callbackClass)) return;

        try {
            XposedHelpers.findAndHookMethod(callbackClass,
                    "onPictureTaken",
                    byte[].class,
                    android.hardware.Camera.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (!engine.isActive()) return;
                            byte[] replacement = engine.getCamera1PictureData(isJpeg);
                            if (replacement != null) {
                                param.args[0] = replacement;
                            }
                        }
                    }
            );
            LogUtil.d(TAG, "Hooked onPictureTaken (" + (isJpeg ? "JPEG" : "RAW") +
                    ") on " + callbackClass.getName());
        } catch (Throwable t) {
            LogUtil.w(TAG, "Failed to hook onPictureTaken: " + t.getMessage());
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Utilities
    // ──────────────────────────────────────────────────────────────────────

    private static Surface safeGetSurface(OutputConfiguration oc) {
        if (oc == null) return null;
        try { return oc.getSurface(); } catch (Throwable ignored) { return null; }
    }

    private static SessionConfiguration rebuildSessionConfiguration(
            SessionConfiguration original, List<OutputConfiguration> outputs) {
        try {
            Object sessionType = XposedHelpers.callMethod(original, "getSessionType");
            Object executor = XposedHelpers.callMethod(original, "getExecutor");
            Object callback = XposedHelpers.callMethod(original, "getStateCallback");
            Object rebuilt = XposedHelpers.newInstance(
                    original.getClass(), sessionType, outputs, executor, callback);
            if (!(rebuilt instanceof SessionConfiguration)) return null;
            try {
                Object sessionParams = XposedHelpers.callMethod(original, "getSessionParameters");
                if (sessionParams != null) {
                    XposedHelpers.callMethod(rebuilt, "setSessionParameters", sessionParams);
                }
            } catch (Throwable ignored) {}
            return (SessionConfiguration) rebuilt;
        } catch (Throwable t) {
            LogUtil.e(TAG, "SessionConfiguration rebuild failed", t);
            return null;
        }
    }

    private static boolean isVerboseGateEnabled() {
        try {
            return new File("/data/local/tmp/virtucam_verbose_logging").exists();
        } catch (Throwable ignored) {
            return false;
        }
    }
}
