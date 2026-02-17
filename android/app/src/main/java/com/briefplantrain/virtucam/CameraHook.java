package com.briefplantrain.virtucam;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.SurfaceTexture;
import android.hardware.Camera;
import android.media.Image;
import android.media.ImageReader;
import android.media.ImageWriter;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMetadataRetriever;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.view.Surface;
import android.view.SurfaceHolder;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.lang.ref.WeakReference;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;

import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XSharedPreferences;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage.LoadPackageParam;

/**
 * VirtuCam Xposed Hook Module — Patched Production Version
 *
 * Hooks Camera1 API, Camera2 API (ImageReader listener interception + Surface replacement),
 * for comprehensive virtual camera injection.
 */
public class CameraHook implements IXposedHookLoadPackage {

    private static final String PACKAGE_NAME = "com.briefplantrain.virtucam";
    private static final String PREFS_NAME = "virtucam_config";
    private static final String TAG = "VirtuCam";

    // --- Configuration fields ---
    private volatile boolean enabled = false;
    private volatile String mediaSourcePath = null;
    private volatile String cameraTarget = "front";
    private volatile boolean mirrored = false;
    private volatile int rotation = 0;
    private volatile float scaleX = 1.0f;
    private volatile float scaleY = 1.0f;
    private volatile float offsetX = 0.0f;
    private volatile float offsetY = 0.0f;
    private volatile String targetMode = "whitelist";
    private volatile Set<String> targetPackages = new HashSet<>();

    // --- Frame cache ---
    private Bitmap cachedFrame = null;
    private String cachedMediaPath = null;
    private final Object frameLock = new Object();

    // Thread-local YUV buffers to avoid races
    private final ThreadLocal<int[]> threadLocalArgbBuffer = new ThreadLocal<>();
    private final ThreadLocal<byte[]> threadLocalYuvBuffer = new ThreadLocal<>();
    private final ThreadLocal<int[]> threadLocalBufferDims = new ThreadLocal<>();

    // Video frame decoding
    private final Object videoLock = new Object();
    private volatile boolean isVideoSource = false;
    private volatile long videoDurationUs = 0;
    private volatile long videoStartTime = 0;
    // Pre-decoded video frame queue
    private final LinkedBlockingQueue<Bitmap> videoFrameQueue = new LinkedBlockingQueue<>(4);
    private HandlerThread videoDecodeThread;
    private Handler videoDecodeHandler;
    private volatile boolean videoDecoderRunning = false;
    private MediaExtractor videoExtractor;
    private MediaCodec videoCodec;
    private volatile Bitmap currentVideoFrame = null;

    private long lastConfigReload = 0;
    private static final long CONFIG_RELOAD_INTERVAL = 3000;

    // Frame processing thread
    private HandlerThread frameProcessThread;
    private Handler frameProcessHandler;

    // Track original ImageReader listeners for wrapping
    private final Map<ImageReader, Object> originalListeners = new ConcurrentHashMap<>();

    // Track which ImageReaders are hooked
    private final Set<ImageReader> hookedImageReaders = Collections.newSetFromMap(new ConcurrentHashMap<ImageReader, Boolean>());

    // Surface replacement mappings
    private final Map<Surface, SurfaceMapping> surfaceMappings = new ConcurrentHashMap<>();
    private final Map<Object, List<SurfaceMapping>> sessionToMappings = new ConcurrentHashMap<>();

    // Surface type tracking (use WeakReference keys to avoid leaks)
    private final Map<Integer, String> surfaceTypeByIdentity = new ConcurrentHashMap<>();
    private final Map<Integer, int[]> surfaceDimsByIdentity = new ConcurrentHashMap<>();

    // Camera device tracking — use identity hash to avoid leaking device references
    private final Map<Integer, Boolean> cameraDeviceHookStatus = new ConcurrentHashMap<>();
    private final Map<Integer, List<SurfaceMapping>> deviceToMappings = new ConcurrentHashMap<>();

    // Track SurfaceTexture dimensions
    private final Map<Integer, int[]> surfaceTextureDimensions = new ConcurrentHashMap<>();

    // Track which concrete StateCallback classes we've already hooked
    private final Set<Class<?>> hookedCallbackClasses = Collections.newSetFromMap(new ConcurrentHashMap<Class<?>, Boolean>());

    // Track which concrete onOpened classes we've already hooked
    private final Set<Class<?>> hookedOnOpenedClasses = Collections.newSetFromMap(new ConcurrentHashMap<Class<?>, Boolean>());

    // Helper class to track surface replacements
    private static class SurfaceMapping {
        final Surface originalSurface;
        final Surface replacementSurface;
        ImageReader imageReader;
        ImageWriter imageWriter;
        final int width;
        final int height;
        final int format;
        final String detectedType;
        volatile boolean closed = false;

        SurfaceMapping(Surface original, Surface replacement, ImageReader reader,
                       int w, int h, int fmt, String type) {
            this.originalSurface = original;
            this.replacementSurface = replacement;
            this.imageReader = reader;
            this.width = w;
            this.height = h;
            this.format = fmt;
            this.detectedType = type;
        }

        synchronized void cleanup() {
            if (closed) return;
            closed = true;
            if (imageReader != null) {
                try { imageReader.close(); } catch (Exception ignored) {}
                imageReader = null;
            }
            if (imageWriter != null) {
                try { imageWriter.close(); } catch (Exception ignored) {}
                imageWriter = null;
            }
        }
    }

    @Override
    public void handleLoadPackage(final LoadPackageParam lpparam) throws Throwable {
        if (lpparam.packageName.equals(PACKAGE_NAME)) {
            return;
        }

        // Create marker file to indicate module is active
        createModuleActiveMarker();

        loadPreferences();

        if (!isTargetedApp(lpparam.packageName)) {
            return;
        }

        log("Hooking package: " + lpparam.packageName + " (enabled=" + enabled + ")");

        hookCamera2API(lpparam);
        hookCamera1API(lpparam);
        hookCameraCaptureSession(lpparam);
        hookSurfaceTextureTracking(lpparam);
        hookCaptureRequestBuilder(lpparam);
        hookCamera1SurfaceBinding(lpparam);

        log("All hooks installed for: " + lpparam.packageName);
    }

    // =========================================================================
    // Configuration
    // =========================================================================

    private void log(String message) {
        XposedBridge.log(TAG + ": " + message);
    }

    /**
     * Create a marker file to indicate the module is active and loaded by LSPosed.
     * This file is used by the VirtuCam app to detect if the module is properly activated.
     */
    private void createModuleActiveMarker() {
        try {
            File markerFile = new File("/data/local/tmp/virtucam_module_active");
            if (!markerFile.exists()) {
                markerFile.createNewFile();
            }
            // Update timestamp to indicate recent activity
            markerFile.setLastModified(System.currentTimeMillis());
            log("Module active marker created/updated");
        } catch (Exception e) {
            log("Failed to create module active marker: " + e.getMessage());
        }
    }

    private void loadPreferences() {
        try {
            XSharedPreferences prefs = new XSharedPreferences(PACKAGE_NAME, PREFS_NAME);
            if (Build.VERSION.SDK_INT < 24) {
                prefs.makeWorldReadable();
            }
            prefs.reload();

            enabled = prefs.getBoolean("enabled", false);
            String newMediaPath = prefs.getString("mediaSourcePath", null);
            cameraTarget = prefs.getString("cameraTarget", "front");
            mirrored = prefs.getBoolean("mirrored", false);
            rotation = prefs.getInt("rotation", 0);
            scaleX = prefs.getFloat("scaleX", 1.0f);
            scaleY = prefs.getFloat("scaleY", 1.0f);
            offsetX = prefs.getFloat("offsetX", 0.0f);
            offsetY = prefs.getFloat("offsetY", 0.0f);
            targetMode = prefs.getString("targetMode", "whitelist");

            String packagesStr = prefs.getString("targetPackages", "");
            if (!packagesStr.isEmpty()) {
                targetPackages = new HashSet<>(Arrays.asList(packagesStr.split(",")));
            } else {
                targetPackages = new HashSet<>();
            }

            // Invalidate frame cache if media source changed
            if (newMediaPath != null && !newMediaPath.equals(cachedMediaPath)) {
                synchronized (frameLock) {
                    if (cachedFrame != null && cachedFrame != currentVideoFrame) {
                        cachedFrame.recycle();
                    }
                    cachedFrame = null;
                    cachedMediaPath = null;
                }
                stopVideoDecoder();
            }
            mediaSourcePath = newMediaPath;
            lastConfigReload = System.currentTimeMillis();

        } catch (Exception e) {
            log("Failed to load preferences: " + e.getMessage());
        }
    }

    private void reloadPreferencesIfNeeded() {
        if (System.currentTimeMillis() - lastConfigReload > CONFIG_RELOAD_INTERVAL) {
            loadPreferences();
        }
    }

    private boolean isTargetedApp(String packageName) {
        if (!enabled) return false;
        if ("whitelist".equals(targetMode)) {
            return targetPackages.contains(packageName);
        } else {
            return !targetPackages.contains(packageName);
        }
    }

    private boolean isActive() {
        return enabled && mediaSourcePath != null;
    }

    private synchronized Handler getFrameProcessHandler() {
        if (frameProcessThread == null || !frameProcessThread.isAlive()) {
            frameProcessThread = new HandlerThread("VirtuCamFrameProcess");
            frameProcessThread.start();
            frameProcessHandler = new Handler(frameProcessThread.getLooper());
        }
        return frameProcessHandler;
    }

    // Identity-based key helpers (avoid holding strong refs in map keys)
    private static int identityKey(Object obj) {
        return System.identityHashCode(obj);
    }

    // =========================================================================
    // Camera2 API Hooks
    // =========================================================================

    private void hookCamera2API(final LoadPackageParam lpparam) {
        try {
            // Hook CameraManager.openCamera to track which cameras to hook
            XposedHelpers.findAndHookMethod(
                    "android.hardware.camera2.CameraManager",
                    lpparam.classLoader,
                    "openCamera",
                    String.class,
                    "android.hardware.camera2.CameraDevice$StateCallback",
                    android.os.Handler.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            reloadPreferencesIfNeeded();
                            if (!isActive()) return;

                            final String cameraId = (String) param.args[0];
                            final Object cameraManager = param.thisObject;

                            Object stateCallback = param.args[1];
                            if (stateCallback != null) {
                                hookOnOpenedForTracking(stateCallback, cameraManager,
                                        cameraId, lpparam.classLoader);
                            }
                        }
                    }
            );

            // Also hook the Executor variant (API 28+)
            if (Build.VERSION.SDK_INT >= 28) {
                try {
                    XposedHelpers.findAndHookMethod(
                            "android.hardware.camera2.CameraManager",
                            lpparam.classLoader,
                            "openCamera",
                            String.class,
                            java.util.concurrent.Executor.class,
                            "android.hardware.camera2.CameraDevice$StateCallback",
                            new XC_MethodHook() {
                                @Override
                                protected void beforeHookedMethod(MethodHookParam param) {
                                    reloadPreferencesIfNeeded();
                                    if (!isActive()) return;

                                    final String cameraId = (String) param.args[0];
                                    final Object cameraManager = param.thisObject;

                                    Object stateCallback = param.args[2];
                                    if (stateCallback != null) {
                                        hookOnOpenedForTracking(stateCallback, cameraManager,
                                                cameraId, lpparam.classLoader);
                                    }
                                }
                            }
                    );
                } catch (Exception ignored) {}
            }

            // Hook ImageReader.setOnImageAvailableListener
            XposedHelpers.findAndHookMethod(
                    "android.media.ImageReader",
                    lpparam.classLoader,
                    "setOnImageAvailableListener",
                    "android.media.ImageReader$OnImageAvailableListener",
                    Handler.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (!isActive()) return;

                            Object originalListener = param.args[0];
                            if (originalListener == null) return;

                            ImageReader reader = (ImageReader) param.thisObject;
                            originalListeners.put(reader, originalListener);
                            hookedImageReaders.add(reader);

                            param.args[0] = createWrappedImageReaderListener(
                                    originalListener, reader, lpparam.classLoader);
                        }
                    }
            );

            // Hook acquireLatestImage / acquireNextImage
            XC_MethodHook imageAcquireHook = new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    if (!isActive()) return;
                    if (!hookedImageReaders.contains(param.thisObject)) return;
                    replaceImageData((Image) param.getResult(), (ImageReader) param.thisObject);
                }
            };

            XposedHelpers.findAndHookMethod("android.media.ImageReader",
                    lpparam.classLoader, "acquireLatestImage", imageAcquireHook);
            XposedHelpers.findAndHookMethod("android.media.ImageReader",
                    lpparam.classLoader, "acquireNextImage", imageAcquireHook);

            // Track ImageReader surfaces and dimensions
            XposedHelpers.findAndHookMethod(
                    "android.media.ImageReader",
                    lpparam.classLoader,
                    "getSurface",
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            Surface s = (Surface) param.getResult();
                            if (s != null) {
                                ImageReader reader = (ImageReader) param.thisObject;
                                int format = reader.getImageFormat();
                                surfaceTypeByIdentity.put(identityKey(s), "ImageReader:" + format);
                                surfaceDimsByIdentity.put(identityKey(s),
                                        new int[]{reader.getWidth(), reader.getHeight()});
                            }
                        }
                    }
            );

            log("Camera2 API hooks installed");
        } catch (Exception e) {
            log("Failed to hook Camera2 API: " + e.getMessage());
        }
    }

    /**
     * Hook onOpened on a per-class basis (not per-instance) to track camera device targeting.
     * Only hooks each concrete class once to avoid stacking.
     */
    private void hookOnOpenedForTracking(Object stateCallback, final Object cameraManager,
                                         final String cameraId, final ClassLoader classLoader) {
        Class<?> callbackClass = stateCallback.getClass();
        if (hookedOnOpenedClasses.contains(callbackClass)) {
            return; // Already hooked this class
        }

        try {
            // Find onOpened method walking up hierarchy
            Method onOpenedMethod = findMethodInHierarchy(callbackClass,
                    "onOpened", "android.hardware.camera2.CameraDevice");
            if (onOpenedMethod == null) return;

            Class<?> declaringClass = onOpenedMethod.getDeclaringClass();
            if (hookedOnOpenedClasses.contains(declaringClass)) return;

            XposedHelpers.findAndHookMethod(declaringClass, "onOpened",
                    "android.hardware.camera2.CameraDevice",
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            Object cameraDevice = param.args[0];
                            boolean shouldHook = shouldHookCamera(cameraManager, cameraId, classLoader);
                            cameraDeviceHookStatus.put(identityKey(cameraDevice), shouldHook);
                        }
                    });

            hookedOnOpenedClasses.add(declaringClass);
        } catch (Exception e) {
            log("Failed to hook onOpened: " + e.getMessage());
        }
    }

    private Method findMethodInHierarchy(Class<?> clazz, String methodName, String... paramTypeNames) {
        Class<?> current = clazz;
        while (current != null && current != Object.class) {
            for (Method m : current.getDeclaredMethods()) {
                if (!m.getName().equals(methodName)) continue;
                Class<?>[] paramTypes = m.getParameterTypes();
                if (paramTypes.length != paramTypeNames.length) continue;
                boolean match = true;
                for (int i = 0; i < paramTypes.length; i++) {
                    if (!paramTypes[i].getName().equals(paramTypeNames[i])) {
                        match = false;
                        break;
                    }
                }
                if (match) return m;
            }
            current = current.getSuperclass();
        }
        return null;
    }

    /**
     * Wraps the app's OnImageAvailableListener.
     */
    private Object createWrappedImageReaderListener(
            final Object originalListener,
            final ImageReader reader,
            final ClassLoader classLoader) {
        try {
            Class<?> listenerClass = XposedHelpers.findClass(
                    "android.media.ImageReader$OnImageAvailableListener", classLoader);

            return Proxy.newProxyInstance(
                    classLoader,
                    new Class<?>[]{listenerClass},
                    new InvocationHandler() {
                        @Override
                        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
                            if ("onImageAvailable".equals(method.getName())) {
                                reloadPreferencesIfNeeded();
                            }
                            return method.invoke(originalListener, args);
                        }
                    }
            );
        } catch (Exception e) {
            log("Failed to create wrapped listener: " + e.getMessage());
            return originalListener;
        }
    }

    /**
     * Replace data in a Camera2 Image object, respecting plane strides.
     */
    private void replaceImageData(Image image, ImageReader reader) {
        if (image == null) return;

        try {
            int width = image.getWidth();
            int height = image.getHeight();
            int format = image.getFormat();

            Bitmap frame = getProcessedFrame(width, height);
            if (frame == null) return;

            Image.Plane[] planes = image.getPlanes();

            if (format == ImageFormat.YUV_420_888 && planes.length >= 3) {
                byte[] nv21 = getYuvData(frame, width, height);
                if (nv21 == null) { recycleTempFrame(frame); return; }

                int frameSize = width * height;

                // Write Y plane respecting row stride
                writeYPlane(planes[0], nv21, width, height);

                // Write U and V planes respecting pixel stride and row stride
                writeUVPlanes(planes[1], planes[2], nv21, frameSize, width, height);

            } else if (format == ImageFormat.JPEG) {
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                frame.compress(Bitmap.CompressFormat.JPEG, 90, bos);
                byte[] jpegData = bos.toByteArray();
                ByteBuffer buf = planes[0].getBuffer();
                try {
                    buf.rewind();
                    buf.put(jpegData, 0, Math.min(jpegData.length, buf.remaining()));
                } catch (Exception e) {
                    log("JPEG plane write failed: " + e.getMessage());
                }
            }

            recycleTempFrame(frame);
        } catch (Exception e) {
            log("replaceImageData error: " + e.getMessage());
        }
    }

    private void recycleTempFrame(Bitmap frame) {
        synchronized (frameLock) {
            if (frame != cachedFrame && frame != currentVideoFrame) {
                frame.recycle();
            }
        }
    }

    /**
     * Write Y plane data respecting the plane's row stride.
     */
    private void writeYPlane(Image.Plane yPlane, byte[] nv21, int width, int height) {
        ByteBuffer yBuffer = yPlane.getBuffer();
        int rowStride = yPlane.getRowStride();

        try {
            yBuffer.rewind();
            if (rowStride == width) {
                // Contiguous — fast path
                yBuffer.put(nv21, 0, Math.min(width * height, yBuffer.remaining()));
            } else {
                // Strided
                for (int row = 0; row < height; row++) {
                    int srcOffset = row * width;
                    int remaining = yBuffer.remaining();
                    if (remaining <= 0) break;
                    int writeLen = Math.min(width, remaining);
                    yBuffer.put(nv21, srcOffset, writeLen);
                    if (rowStride > width && row < height - 1 && yBuffer.remaining() > 0) {
                        // Skip padding bytes
                        int skip = Math.min(rowStride - width, yBuffer.remaining());
                        yBuffer.position(yBuffer.position() + skip);
                    }
                }
            }
        } catch (Exception e) {
            log("writeYPlane error: " + e.getMessage());
        }
    }

    /**
     * Write UV plane data respecting pixel stride and row stride.
     * Source NV21: after Y data, interleaved V,U bytes.
     */
    private void writeUVPlanes(Image.Plane uPlane, Image.Plane vPlane,
                               byte[] nv21, int frameSize, int width, int height) {
        try {
            int uvHeight = height / 2;
            int uvWidth = width / 2;

            int uPixelStride = uPlane.getPixelStride();
            int vPixelStride = vPlane.getPixelStride();
            int uRowStride = uPlane.getRowStride();
            int vRowStride = vPlane.getRowStride();

            ByteBuffer uBuffer = uPlane.getBuffer();
            ByteBuffer vBuffer = vPlane.getBuffer();
            uBuffer.rewind();
            vBuffer.rewind();

            if (uPixelStride == 1 && vPixelStride == 1) {
                // Fully planar — write U and V separately
                for (int row = 0; row < uvHeight; row++) {
                    for (int col = 0; col < uvWidth; col++) {
                        int nv21Index = frameSize + row * width + col * 2;
                        byte vVal = nv21[nv21Index];       // V in NV21
                        byte uVal = nv21[nv21Index + 1];   // U in NV21

                        if (uBuffer.remaining() > 0) uBuffer.put(uVal);
                        if (vBuffer.remaining() > 0) vBuffer.put(vVal);
                    }
                    // Skip row stride padding
                    if (row < uvHeight - 1) {
                        if (uRowStride > uvWidth && uBuffer.remaining() > 0) {
                            int skip = Math.min(uRowStride - uvWidth, uBuffer.remaining());
                            uBuffer.position(uBuffer.position() + skip);
                        }
                        if (vRowStride > uvWidth && vBuffer.remaining() > 0) {
                            int skip = Math.min(vRowStride - uvWidth, vBuffer.remaining());
                            vBuffer.position(vBuffer.position() + skip);
                        }
                    }
                }
            } else if (uPixelStride == 2 && vPixelStride == 2) {
                // Semi-planar (NV12 or NV21 style) — U and V buffers overlap
                // Write interleaved UV to whichever buffer has lower address
                // Typically U buffer starts at V+1 or V buffer starts at U+1
                // We write to both, letting the stride handle interleaving
                for (int row = 0; row < uvHeight; row++) {
                    for (int col = 0; col < uvWidth; col++) {
                        int nv21Index = frameSize + row * width + col * 2;
                        byte vVal = nv21[nv21Index];
                        byte uVal = nv21[nv21Index + 1];

                        if (uBuffer.remaining() > 0) {
                            uBuffer.put(uVal);
                            if (uBuffer.remaining() > 0) {
                                uBuffer.position(uBuffer.position() + 1); // skip interleaved byte
                            }
                        }
                        if (vBuffer.remaining() > 0) {
                            vBuffer.put(vVal);
                            if (vBuffer.remaining() > 0) {
                                vBuffer.position(vBuffer.position() + 1);
                            }
                        }
                    }
                    // Row stride padding
                    if (row < uvHeight - 1) {
                        int uExpected = uvWidth * 2;
                        int vExpected = uvWidth * 2;
                        if (uRowStride > uExpected && uBuffer.remaining() > 0) {
                            int skip = Math.min(uRowStride - uExpected, uBuffer.remaining());
                            uBuffer.position(uBuffer.position() + skip);
                        }
                        if (vRowStride > vExpected && vBuffer.remaining() > 0) {
                            int skip = Math.min(vRowStride - vExpected, vBuffer.remaining());
                            vBuffer.position(vBuffer.position() + skip);
                        }
                    }
                }
            } else {
                // Unknown stride layout — best effort
                log("Unknown UV pixel stride: u=" + uPixelStride + " v=" + vPixelStride);
                int uvSize = uvWidth * uvHeight;
                for (int i = 0; i < uvSize; i++) {
                    int nv21Index = frameSize + i * 2;
                    if (nv21Index + 1 >= nv21.length) break;
                    byte vVal = nv21[nv21Index];
                    byte uVal = nv21[nv21Index + 1];
                    if (uBuffer.remaining() > 0) uBuffer.put(uVal);
                    if (vBuffer.remaining() > 0) vBuffer.put(vVal);
                }
            }
        } catch (Exception e) {
            log("writeUVPlanes error: " + e.getMessage());
        }
    }

    // =========================================================================
    // Camera1 API Hooks
    // =========================================================================

    private void hookCamera1API(final LoadPackageParam lpparam) {
        try {
            XposedHelpers.findAndHookMethod(
                    "android.hardware.Camera", lpparam.classLoader,
                    "open", int.class,
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            reloadPreferencesIfNeeded();
                        }
                    }
            );

            XposedHelpers.findAndHookMethod(
                    "android.hardware.Camera", lpparam.classLoader,
                    "open",
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            reloadPreferencesIfNeeded();
                        }
                    }
            );

            String[] callbackMethods = {
                    "setPreviewCallback",
                    "setPreviewCallbackWithBuffer",
                    "setOneShotPreviewCallback"
            };

            for (String methodName : callbackMethods) {
                XposedHelpers.findAndHookMethod(
                        "android.hardware.Camera", lpparam.classLoader,
                        methodName,
                        "android.hardware.Camera$PreviewCallback",
                        new XC_MethodHook() {
                            @Override
                            protected void beforeHookedMethod(MethodHookParam param) {
                                if (!isActive()) return;
                                Object originalCallback = param.args[0];
                                if (originalCallback == null) return;

                                Camera camera = (Camera) param.thisObject;
                                param.args[0] = createWrappedPreviewCallback(
                                        originalCallback, camera, lpparam.classLoader);
                            }
                        }
                );
            }

            log("Camera1 API hooks installed");
        } catch (Exception e) {
            log("Failed to hook Camera1 API: " + e.getMessage());
        }
    }

    private Object createWrappedPreviewCallback(
            final Object originalCallback,
            final Camera camera,
            final ClassLoader classLoader) {
        try {
            Class<?> callbackClass = XposedHelpers.findClass(
                    "android.hardware.Camera$PreviewCallback", classLoader);

            return Proxy.newProxyInstance(
                    classLoader,
                    new Class<?>[]{callbackClass},
                    new InvocationHandler() {
                        @Override
                        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
                            if ("onPreviewFrame".equals(method.getName())
                                    && isActive() && args.length >= 2) {
                                try {
                                    reloadPreferencesIfNeeded();
                                    Camera callbackCamera = (Camera) args[1];
                                    Camera.Parameters params = callbackCamera.getParameters();
                                    Camera.Size previewSize = params.getPreviewSize();

                                    if (previewSize != null) {
                                        Bitmap frame = getProcessedFrame(
                                                previewSize.width, previewSize.height);
                                        if (frame != null) {
                                            byte[] yuvData = getYuvData(
                                                    frame, previewSize.width, previewSize.height);
                                            if (yuvData != null && args[0] != null) {
                                                byte[] origData = (byte[]) args[0];
                                                int copyLen = Math.min(yuvData.length, origData.length);
                                                System.arraycopy(yuvData, 0, origData, 0, copyLen);
                                            }
                                            recycleTempFrame(frame);
                                        }
                                    }
                                } catch (Exception e) {
                                    log("PreviewCallback injection error: " + e.getMessage());
                                }
                            }
                            return method.invoke(originalCallback, args);
                        }
                    }
            );
        } catch (Exception e) {
            log("Failed to create wrapped callback: " + e.getMessage());
            return originalCallback;
        }
    }

    // =========================================================================
    // Frame Loading & Processing
    // =========================================================================

    private Bitmap getProcessedFrame(int targetWidth, int targetHeight) {
        synchronized (frameLock) {
            ensureFrameLoaded();
            if (cachedFrame == null) return null;
            return processFrame(cachedFrame, targetWidth, targetHeight);
        }
    }

    private void ensureFrameLoaded() {
        if (isVideoSource) {
            // Grab latest decoded video frame
            Bitmap latest = videoFrameQueue.poll();
            if (latest != null) {
                Bitmap old = cachedFrame;
                cachedFrame = latest;
                currentVideoFrame = latest;
                if (old != null && old != latest) {
                    old.recycle();
                }
            }
            if (cachedFrame != null) return;
        }

        if (cachedFrame != null && mediaSourcePath != null
                && mediaSourcePath.equals(cachedMediaPath)) {
            return;
        }

        if (mediaSourcePath == null || mediaSourcePath.isEmpty()) return;

        File mediaFile = new File(mediaSourcePath);
        if (!mediaFile.exists() || !mediaFile.canRead()) {
            log("Media file not accessible: " + mediaSourcePath);
            return;
        }

        String path = mediaSourcePath.toLowerCase();
        boolean video = path.endsWith(".mp4") || path.endsWith(".avi")
                || path.endsWith(".mov") || path.endsWith(".mkv")
                || path.endsWith(".webm");

        if (video) {
            loadVideoSource();
        } else {
            loadImageSource();
        }
        cachedMediaPath = mediaSourcePath;
    }

    private void loadImageSource() {
        try {
            isVideoSource = false;
            stopVideoDecoder();

            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
            cachedFrame = BitmapFactory.decodeFile(mediaSourcePath, opts);

            if (cachedFrame != null) {
                log("Image loaded: " + cachedFrame.getWidth() + "x" + cachedFrame.getHeight());
            }
        } catch (Exception e) {
            log("Image loading failed: " + e.getMessage());
        }
    }

    /**
     * Video loading: use MediaMetadataRetriever for first frame,
     * then start async MediaCodec decoder for subsequent frames.
     */
    private void loadVideoSource() {
        try {
            isVideoSource = true;
            stopVideoDecoder();

            // Get first frame and duration with retriever
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            try {
                retriever.setDataSource(mediaSourcePath);
                String durationStr = retriever.extractMetadata(
                        MediaMetadataRetriever.METADATA_KEY_DURATION);
                videoDurationUs = (durationStr != null)
                        ? Long.parseLong(durationStr) * 1000 : 0;
                videoStartTime = System.currentTimeMillis();

                cachedFrame = retriever.getFrameAtTime(0,
                        MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
                currentVideoFrame = cachedFrame;
            } finally {
                try { retriever.release(); } catch (Exception ignored) {}
            }

            // Start async decoder
            startVideoDecoder();

            if (cachedFrame != null) {
                log("Video loaded, first frame: " + cachedFrame.getWidth() + "x"
                        + cachedFrame.getHeight() + ", duration=" + (videoDurationUs / 1000) + "ms");
            }
        } catch (Exception e) {
            log("Video loading failed: " + e.getMessage());
            isVideoSource = false;
        }
    }

    /**
     * Start async video decoder using MediaCodec for efficient frame extraction.
     */
    private void startVideoDecoder() {
        synchronized (videoLock) {
            if (videoDecoderRunning) return;
            videoDecoderRunning = true;

            videoDecodeThread = new HandlerThread("VirtuCamVideoDecode");
            videoDecodeThread.start();
            videoDecodeHandler = new Handler(videoDecodeThread.getLooper());

            final String path = mediaSourcePath;
            videoDecodeHandler.post(new Runnable() {
                @Override
                public void run() {
                    runVideoDecoderLoop(path);
                }
            });
        }
    }

    private void runVideoDecoderLoop(String path) {
        MediaExtractor extractor = null;
        MediaCodec codec = null;

        try {
            extractor = new MediaExtractor();
            extractor.setDataSource(path);

            int videoTrackIndex = -1;
            MediaFormat format = null;
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                MediaFormat trackFormat = extractor.getTrackFormat(i);
                String mime = trackFormat.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("video/")) {
                    videoTrackIndex = i;
                    format = trackFormat;
                    break;
                }
            }

            if (videoTrackIndex < 0 || format == null) {
                log("No video track found");
                return;
            }

            extractor.selectTrack(videoTrackIndex);
            String mime = format.getString(MediaFormat.KEY_MIME);

            codec = MediaCodec.createDecoderByType(mime);
            codec.configure(format, null, null, 0);
            codec.start();

            synchronized (videoLock) {
                videoExtractor = extractor;
                videoCodec = codec;
            }

            MediaCodec.BufferInfo bufferInfo = new MediaCodec.BufferInfo();
            boolean inputDone = false;
            long startTimeMs = System.currentTimeMillis();

            while (videoDecoderRunning) {
                // Feed input
                if (!inputDone) {
                    int inputIndex = codec.dequeueInputBuffer(10000);
                    if (inputIndex >= 0) {
                        ByteBuffer inputBuffer;
                        if (Build.VERSION.SDK_INT >= 21) {
                            inputBuffer = codec.getInputBuffer(inputIndex);
                        } else {
                            inputBuffer = codec.getInputBuffers()[inputIndex];
                        }

                        int sampleSize = extractor.readSampleData(inputBuffer, 0);
                        if (sampleSize < 0) {
                            // End of stream — loop
                            codec.queueInputBuffer(inputIndex, 0, 0, 0,
                                    MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            inputDone = true;
                        } else {
                            long pts = extractor.getSampleTime();
                            codec.queueInputBuffer(inputIndex, 0, sampleSize, pts, 0);
                            extractor.advance();
                        }
                    }
                }

                // Get output
                int outputIndex = codec.dequeueOutputBuffer(bufferInfo, 10000);
                if (outputIndex >= 0) {
                    if ((bufferInfo.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        // Loop: seek back to beginning
                        codec.flush();
                        extractor.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC);
                        inputDone = false;
                        startTimeMs = System.currentTimeMillis();
                        codec.releaseOutputBuffer(outputIndex, false);
                        continue;
                    }

                    // Rate control: wait for correct presentation time
                    long framePtsUs = bufferInfo.presentationTimeUs;
                    long elapsedUs = (System.currentTimeMillis() - startTimeMs) * 1000;
                    long waitUs = framePtsUs - elapsedUs;
                    if (waitUs > 5000) { // More than 5ms ahead
                        try { Thread.sleep(waitUs / 1000); } catch (InterruptedException ignored) { break; }
                    }

                    // Extract frame as Bitmap
                    Bitmap frameBitmap = extractFrameFromCodecOutput(codec, outputIndex,
                            bufferInfo, format);
                    codec.releaseOutputBuffer(outputIndex, false);

                    if (frameBitmap != null) {
                        // Non-blocking offer — drop old frames if queue is full
                        if (!videoFrameQueue.offer(frameBitmap)) {
                            Bitmap dropped = videoFrameQueue.poll();
                            if (dropped != null) dropped.recycle();
                            videoFrameQueue.offer(frameBitmap);
                        }
                    }
                } else if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    format = codec.getOutputFormat();
                }
            }
        } catch (Exception e) {
            log("Video decoder error: " + e.getMessage());
        } finally {
            if (codec != null) {
                try { codec.stop(); } catch (Exception ignored) {}
                try { codec.release(); } catch (Exception ignored) {}
            }
            if (extractor != null) {
                try { extractor.release(); } catch (Exception ignored) {}
            }
            synchronized (videoLock) {
                videoExtractor = null;
                videoCodec = null;
            }
        }
    }

    /**
     * Extract a Bitmap from MediaCodec output buffer.
     * The output format is typically YUV — we convert to ARGB.
     */
    private Bitmap extractFrameFromCodecOutput(MediaCodec codec, int outputIndex,
                                                MediaCodec.BufferInfo info,
                                                MediaFormat format) {
        try {
            ByteBuffer outputBuffer;
            if (Build.VERSION.SDK_INT >= 21) {
                outputBuffer = codec.getOutputBuffer(outputIndex);
            } else {
                outputBuffer = codec.getOutputBuffers()[outputIndex];
            }
            if (outputBuffer == null) return null;

            int width, height;
            try {
                // Use output format which may differ from input format
                MediaFormat outputFormat = codec.getOutputFormat();
                width = outputFormat.getInteger(MediaFormat.KEY_WIDTH);
                height = outputFormat.getInteger(MediaFormat.KEY_HEIGHT);

                // Check for stride/slice height
                int stride = width;
                int sliceHeight = height;
                try { stride = outputFormat.getInteger(MediaFormat.KEY_STRIDE); } catch (Exception ignored) {}
                try { sliceHeight = outputFormat.getInteger("slice-height"); } catch (Exception ignored) {}
                if (stride <= 0) stride = width;
                if (sliceHeight <= 0) sliceHeight = height;

                // Check color format
                int colorFormat = 0;
                try { colorFormat = outputFormat.getInteger(MediaFormat.KEY_COLOR_FORMAT); } catch (Exception ignored) {}

                outputBuffer.position(info.offset);
                outputBuffer.limit(info.offset + info.size);

                byte[] yuvBytes = new byte[info.size];
                outputBuffer.get(yuvBytes);

                // Convert YUV to ARGB
                int[] argb = new int[width * height];
                decodeYUV420ToARGB(argb, yuvBytes, stride, sliceHeight, width, height);

                Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
                bitmap.setPixels(argb, 0, width, 0, 0, width, height);
                return bitmap;

            } catch (Exception e) {
                log("Frame extraction format error: " + e.getMessage());
                return null;
            }
        } catch (Exception e) {
            log("extractFrameFromCodecOutput error: " + e.getMessage());
            return null;
        }
    }

    /**
     * Decode YUV420 (semi-planar NV12/NV21 or planar) to ARGB.
     */
    private static void decodeYUV420ToARGB(int[] argb, byte[] yuv,
                                            int stride, int sliceHeight,
                                            int width, int height) {
        int frameSize = stride * sliceHeight;

        for (int j = 0; j < height; j++) {
            for (int i = 0; i < width; i++) {
                int yIndex = j * stride + i;
                int uvIndex = frameSize + (j / 2) * stride + (i / 2) * 2;

                int Y = (yuv[yIndex] & 0xFF) - 16;
                if (Y < 0) Y = 0;

                int U, V;
                if (uvIndex + 1 < yuv.length) {
                    // NV12: U then V
                    U = (yuv[uvIndex] & 0xFF) - 128;
                    V = (yuv[uvIndex + 1] & 0xFF) - 128;
                } else {
                    U = 0;
                    V = 0;
                }

                int R = (int) (1.164f * Y + 1.596f * V);
                int G = (int) (1.164f * Y - 0.813f * V - 0.391f * U);
                int B = (int) (1.164f * Y + 2.018f * U);

                R = Math.max(0, Math.min(255, R));
                G = Math.max(0, Math.min(255, G));
                B = Math.max(0, Math.min(255, B));

                argb[j * width + i] = 0xFF000000 | (R << 16) | (G << 8) | B;
            }
        }
    }

    private void stopVideoDecoder() {
        synchronized (videoLock) {
            videoDecoderRunning = false;

            if (videoDecodeThread != null) {
                videoDecodeThread.quitSafely();
                videoDecodeThread = null;
                videoDecodeHandler = null;
            }

            // Drain frame queue
            Bitmap frame;
            while ((frame = videoFrameQueue.poll()) != null) {
                frame.recycle();
            }
            currentVideoFrame = null;
        }
    }

    /**
     * Apply transformations: scale, rotation, mirror, offset.
     */
    private Bitmap processFrame(Bitmap source, int targetWidth, int targetHeight) {
        if (targetWidth <= 0 || targetHeight <= 0) return source;

        try {
            Bitmap output = Bitmap.createBitmap(targetWidth, targetHeight,
                    Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(output);
            canvas.drawColor(Color.BLACK);

            float srcW = source.getWidth();
            float srcH = source.getHeight();

            float fitScale = Math.min(targetWidth / srcW, targetHeight / srcH);

            Matrix matrix = new Matrix();

            float scaledW = srcW * fitScale;
            float scaledH = srcH * fitScale;
            float translateX = (targetWidth - scaledW) / 2f;
            float translateY = (targetHeight - scaledH) / 2f;

            float finalScaleX = fitScale * scaleX * (mirrored ? -1 : 1);
            float finalScaleY = fitScale * scaleY;

            matrix.postScale(finalScaleX, finalScaleY);

            if (mirrored) {
                matrix.postTranslate(scaledW * scaleX, 0);
            }

            matrix.postTranslate(translateX, translateY);

            if (rotation != 0) {
                matrix.postRotate(rotation, targetWidth / 2f, targetHeight / 2f);
            }

            matrix.postTranslate(offsetX * targetWidth, offsetY * targetHeight);

            canvas.drawBitmap(source, matrix, null);
            return output;
        } catch (Exception e) {
            log("processFrame error: " + e.getMessage());
            try {
                Bitmap scaled = Bitmap.createScaledBitmap(source, targetWidth, targetHeight, true);
                if (scaled == source) {
                    scaled = source.copy(Bitmap.Config.ARGB_8888, false);
                }
                return scaled;
            } catch (Exception e2) {
                return null;
            }
        }
    }

    // =========================================================================
    // YUV Conversion (thread-safe with ThreadLocal buffers)
    // =========================================================================

    private byte[] getYuvData(Bitmap bitmap, int width, int height) {
        try {
            int[] dims = threadLocalBufferDims.get();
            int[] argbBuf = threadLocalArgbBuffer.get();
            byte[] yuvBuf = threadLocalYuvBuffer.get();

            if (dims == null || dims[0] != width || dims[1] != height
                    || argbBuf == null || yuvBuf == null) {
                argbBuf = new int[width * height];
                yuvBuf = new byte[width * height * 3 / 2];
                threadLocalArgbBuffer.set(argbBuf);
                threadLocalYuvBuffer.set(yuvBuf);
                threadLocalBufferDims.set(new int[]{width, height});
            }

            bitmap.getPixels(argbBuf, 0, width, 0, 0, width, height);
            encodeNV21(yuvBuf, argbBuf, width, height);
            return yuvBuf;
        } catch (Exception e) {
            log("YUV conversion failed: " + e.getMessage());
            return null;
        }
    }

    private static void encodeNV21(byte[] nv21, int[] argb, int width, int height) {
        final int frameSize = width * height;
        int yIndex = 0;
        int uvIndex = frameSize;

        for (int j = 0; j < height; j++) {
            int rowStart = j * width;
            for (int i = 0; i < width; i++) {
                int pixel = argb[rowStart + i];
                int R = (pixel >> 16) & 0xFF;
                int G = (pixel >> 8) & 0xFF;
                int B = pixel & 0xFF;

                int Y = ((66 * R + 129 * G + 25 * B + 128) >> 8) + 16;
                nv21[yIndex++] = (byte) Math.max(0, Math.min(255, Y));

                if ((j & 1) == 0 && (i & 1) == 0 && uvIndex < nv21.length - 1) {
                    int V = ((112 * R - 94 * G - 18 * B + 128) >> 8) + 128;
                    int U = ((-38 * R - 74 * G + 112 * B + 128) >> 8) + 128;
                    nv21[uvIndex++] = (byte) Math.max(0, Math.min(255, V));
                    nv21[uvIndex++] = (byte) Math.max(0, Math.min(255, U));
                }
            }
        }
    }

    // =========================================================================
    // Camera Filtering Helper
    // =========================================================================

    private boolean shouldHookCamera(Object cameraManager, String cameraId,
                                     ClassLoader classLoader) {
        // Handle "both" and "all" as synonyms for hooking all cameras
        if ("both".equals(cameraTarget) || "all".equals(cameraTarget)) return true;
        
        // Handle "none" - don't hook any camera
        if ("none".equals(cameraTarget)) return false;

        try {
            Object characteristics = XposedHelpers.callMethod(
                    cameraManager, "getCameraCharacteristics", cameraId);

            Class<?> characteristicsClass = XposedHelpers.findClass(
                    "android.hardware.camera2.CameraCharacteristics", classLoader);
            Object lensFacingKey = XposedHelpers.getStaticObjectField(
                    characteristicsClass, "LENS_FACING");
            Object lensFacing = XposedHelpers.callMethod(characteristics, "get", lensFacingKey);

            if (lensFacing == null) return true;
            int facing = (Integer) lensFacing;

            if ("front".equals(cameraTarget)) return facing == 0;
            if ("back".equals(cameraTarget)) return facing == 1;
            return true;
        } catch (Exception e) {
            return true;
        }
    }

    // =========================================================================
    // CameraCaptureSession Hooks (Surface Replacement Strategy)
    // =========================================================================

    private void cleanupExistingMappings(Object cameraDevice) {
        List<SurfaceMapping> existing = deviceToMappings.remove(identityKey(cameraDevice));
        if (existing != null) {
            for (SurfaceMapping mapping : existing) {
                mapping.cleanup();
                surfaceMappings.remove(mapping.replacementSurface);
            }
        }
    }

    private void hookCameraCaptureSession(final LoadPackageParam lpparam) {
        try {
            // === Primary hook: createCaptureSession(List, StateCallback, Handler) ===
            hookCreateCaptureSessionList(lpparam, "android.hardware.camera2.CameraDevice");

            // Also try CameraDeviceImpl
            try {
                hookCreateCaptureSessionList(lpparam, "android.hardware.camera2.impl.CameraDeviceImpl");
            } catch (Exception ignored) {}

            // === API 24+: createCaptureSessionByOutputConfigurations ===
            if (Build.VERSION.SDK_INT >= 24) {
                try {
                    hookCreateCaptureSessionOutputConfigs(lpparam, "android.hardware.camera2.CameraDevice");
                } catch (Exception ignored) {}
                try {
                    hookCreateCaptureSessionOutputConfigs(lpparam, "android.hardware.camera2.impl.CameraDeviceImpl");
                } catch (Exception ignored) {}
            }

            // === API 28+: createCaptureSession(SessionConfiguration) ===
            if (Build.VERSION.SDK_INT >= 28) {
                try {
                    hookCreateCaptureSessionConfig(lpparam, "android.hardware.camera2.CameraDevice");
                } catch (Exception ignored) {}
                try {
                    hookCreateCaptureSessionConfig(lpparam, "android.hardware.camera2.impl.CameraDeviceImpl");
                } catch (Exception ignored) {}
            }

            log("CameraCaptureSession hooks installed");
        } catch (Exception e) {
            log("Failed to hook CameraCaptureSession: " + e.getMessage());
        }
    }

    private void hookCreateCaptureSessionList(final LoadPackageParam lpparam,
                                               final String className) {
        XposedHelpers.findAndHookMethod(
                className, lpparam.classLoader,
                "createCaptureSession",
                List.class,
                "android.hardware.camera2.CameraCaptureSession$StateCallback",
                Handler.class,
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                        if (!isActive()) return;

                        Object cameraDevice = param.thisObject;
                        Boolean shouldHook = cameraDeviceHookStatus.get(identityKey(cameraDevice));
                        if (shouldHook != null && !shouldHook) return;

                        cleanupExistingMappings(cameraDevice);
                        reloadPreferencesIfNeeded();

                        @SuppressWarnings("unchecked")
                        List<Surface> surfaces = (List<Surface>) param.args[0];
                        if (surfaces == null || surfaces.isEmpty()) return;

                        ReplacementResult result = replaceSurfaces(surfaces, lpparam.classLoader);
                        param.args[0] = result.replacementSurfaces;

                        deviceToMappings.put(identityKey(cameraDevice),
                                new ArrayList<>(result.sessionMappings));

                        hookStateCallbackForCleanup(param.args[1],
                                lpparam.classLoader, result.sessionMappings);
                    }
                }
        );
    }

    private void hookCreateCaptureSessionOutputConfigs(final LoadPackageParam lpparam,
                                                        final String className) {
        XposedHelpers.findAndHookMethod(
                className, lpparam.classLoader,
                "createCaptureSessionByOutputConfigurations",
                List.class,
                "android.hardware.camera2.CameraCaptureSession$StateCallback",
                Handler.class,
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                        if (!isActive()) return;

                        Object cameraDevice = param.thisObject;
                        Boolean shouldHook = cameraDeviceHookStatus.get(identityKey(cameraDevice));
                        if (shouldHook != null && !shouldHook) return;

                        cleanupExistingMappings(cameraDevice);
                        reloadPreferencesIfNeeded();

                        @SuppressWarnings("unchecked")
                        List<Object> outputConfigs = (List<Object>) param.args[0];
                        if (outputConfigs == null || outputConfigs.isEmpty()) return;

                        List<Object> replacementConfigs = new ArrayList<>();
                        List<SurfaceMapping> sessionMappings = new ArrayList<>();

                        for (Object config : outputConfigs) {
                            try {
                                Surface originalSurface = extractSurfaceFromOutputConfig(config);
                                if (originalSurface == null) {
                                    replacementConfigs.add(config);
                                    continue;
                                }

                                SurfaceMapping mapping = createSurfaceMapping(originalSurface);
                                if (mapping == null) {
                                    replacementConfigs.add(config);
                                    continue;
                                }

                                sessionMappings.add(mapping);

                                Class<?> outputConfigClass = XposedHelpers.findClass(
                                        "android.hardware.camera2.params.OutputConfiguration",
                                        lpparam.classLoader);
                                Object newConfig = XposedHelpers.newInstance(
                                        outputConfigClass, mapping.replacementSurface);
                                replacementConfigs.add(newConfig);
                            } catch (Exception e) {
                                replacementConfigs.add(config);
                            }
                        }

                        param.args[0] = replacementConfigs;
                        deviceToMappings.put(identityKey(cameraDevice),
                                new ArrayList<>(sessionMappings));
                        hookStateCallbackForCleanup(param.args[1],
                                lpparam.classLoader, sessionMappings);
                    }
                }
        );
    }

    private void hookCreateCaptureSessionConfig(final LoadPackageParam lpparam,
                                                 final String className) {
        XposedHelpers.findAndHookMethod(
                className, lpparam.classLoader,
                "createCaptureSession",
                "android.hardware.camera2.params.SessionConfiguration",
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                        if (!isActive()) return;

                        Object cameraDevice = param.thisObject;
                        Boolean shouldHook = cameraDeviceHookStatus.get(identityKey(cameraDevice));
                        if (shouldHook != null && !shouldHook) return;

                        cleanupExistingMappings(cameraDevice);
                        reloadPreferencesIfNeeded();

                        Object sessionConfig = param.args[0];

                        @SuppressWarnings("unchecked")
                        List<Object> outputConfigs = (List<Object>) XposedHelpers.callMethod(
                                sessionConfig, "getOutputConfigurations");
                        if (outputConfigs == null || outputConfigs.isEmpty()) return;

                        List<Object> replacementConfigs = new ArrayList<>();
                        List<SurfaceMapping> sessionMappings = new ArrayList<>();

                        for (Object config : outputConfigs) {
                            try {
                                Surface originalSurface = extractSurfaceFromOutputConfig(config);
                                if (originalSurface == null) {
                                    replacementConfigs.add(config);
                                    continue;
                                }

                                SurfaceMapping mapping = createSurfaceMapping(originalSurface);
                                if (mapping == null) {
                                    replacementConfigs.add(config);
                                    continue;
                                }

                                sessionMappings.add(mapping);

                                Class<?> outputConfigClass = XposedHelpers.findClass(
                                        "android.hardware.camera2.params.OutputConfiguration",
                                        lpparam.classLoader);
                                Object newConfig = XposedHelpers.newInstance(
                                        outputConfigClass, mapping.replacementSurface);
                                replacementConfigs.add(newConfig);
                            } catch (Exception e) {
                                replacementConfigs.add(config);
                            }
                        }

                        // Build new SessionConfiguration
                        int sessionType = (int) XposedHelpers.callMethod(sessionConfig, "getSessionType");
                        Object executor = XposedHelpers.callMethod(sessionConfig, "getExecutor");
                        Object originalCallback = XposedHelpers.callMethod(sessionConfig, "getStateCallback");

                        deviceToMappings.put(identityKey(cameraDevice),
                                new ArrayList<>(sessionMappings));
                        hookStateCallbackForCleanup(originalCallback,
                                lpparam.classLoader, sessionMappings);

                        Class<?> sessionConfigClass = XposedHelpers.findClass(
                                "android.hardware.camera2.params.SessionConfiguration",
                                lpparam.classLoader);
                        Object newSessionConfig = XposedHelpers.newInstance(sessionConfigClass,
                                sessionType, replacementConfigs, executor, originalCallback);

                        try {
                            Object sessionParams = XposedHelpers.callMethod(
                                    sessionConfig, "getSessionParameters");
                            if (sessionParams != null) {
                                XposedHelpers.callMethod(newSessionConfig,
                                        "setSessionParameters", sessionParams);
                            }
                        } catch (Exception ignored) {}

                        param.args[0] = newSessionConfig;
                    }
                }
        );
    }

    /**
     * Extract the first Surface from an OutputConfiguration.
     */
    private Surface extractSurfaceFromOutputConfig(Object config) {
        try {
            Object surfaceObj = XposedHelpers.callMethod(config, "getSurface");
            if (surfaceObj instanceof Surface) return (Surface) surfaceObj;
        } catch (Exception ignored) {}

        try {
            @SuppressWarnings("unchecked")
            List<Surface> surfaces = (List<Surface>) XposedHelpers.callMethod(config, "getSurfaces");
            if (surfaces != null && !surfaces.isEmpty()) return surfaces.get(0);
        } catch (Exception ignored) {}

        return null;
    }

    /**
     * Shared logic for replacing a list of Surfaces.
     */
    private static class ReplacementResult {
        List<Surface> replacementSurfaces;
        List<SurfaceMapping> sessionMappings;
    }

    private ReplacementResult replaceSurfaces(List<Surface> surfaces, ClassLoader classLoader) {
        ReplacementResult result = new ReplacementResult();
        result.replacementSurfaces = new ArrayList<>();
        result.sessionMappings = new ArrayList<>();

        for (Surface originalSurface : surfaces) {
            SurfaceMapping mapping = createSurfaceMapping(originalSurface);
            if (mapping != null) {
                result.sessionMappings.add(mapping);
                result.replacementSurfaces.add(mapping.replacementSurface);
            } else {
                result.replacementSurfaces.add(originalSurface);
            }
        }
        return result;
    }

    /**
     * Create a SurfaceMapping for the given original surface.
     * Returns null if the surface should be passed through unmodified.
     */
    private SurfaceMapping createSurfaceMapping(Surface originalSurface) {
        try {
            String surfaceType = surfaceTypeByIdentity.get(identityKey(originalSurface));
            if (surfaceType == null) surfaceType = "Unknown";

            int[] dims = getSurfaceDimensions(originalSurface);
            int width = dims[0] > 0 ? dims[0] : 1920;
            int height = dims[1] > 0 ? dims[1] : 1080;

            int format = ImageFormat.YUV_420_888;
            if (surfaceType.startsWith("ImageReader:")) {
                try {
                    int detectedFormat = Integer.parseInt(surfaceType.substring(12));
                    if (detectedFormat == ImageFormat.JPEG) {
                        format = ImageFormat.JPEG;
                    } else if (detectedFormat == ImageFormat.PRIVATE) {
                        // Can't write to PRIVATE format — pass through
                        return null;
                    }
                } catch (NumberFormatException e) {
                    log("Invalid format in surface type: " + surfaceType);
                }
            } else if ("SurfaceTexture".equals(surfaceType)) {
                // SurfaceTexture-backed surfaces use YUV for ImageWriter injection
                format = ImageFormat.YUV_420_888;
            }

            // maxImages=4 to avoid buffer exhaustion
            ImageReader reader = ImageReader.newInstance(width, height, format, 4);
            Surface replacementSurface = reader.getSurface();

            SurfaceMapping mapping = new SurfaceMapping(
                    originalSurface, replacementSurface, reader,
                    width, height, format, surfaceType);
            surfaceMappings.put(replacementSurface, mapping);

            setupImageReaderForForwarding(reader, mapping);

            log("Replaced surface: " + width + "x" + height
                    + " type=" + surfaceType + " format=" + format);
            return mapping;
        } catch (Exception e) {
            log("Failed to create surface mapping: " + e.getMessage());
            return null;
        }
    }

    private int[] getSurfaceDimensions(Surface surface) {
        int[] tracked = surfaceDimsByIdentity.get(identityKey(surface));
        if (tracked != null && tracked[0] > 0 && tracked[1] > 0) {
            return tracked;
        }

        // Reflection fallback
        try {
            Class<?> surfaceClass = surface.getClass();
            while (surfaceClass != null) {
                try {
                    Field wf = surfaceClass.getDeclaredField("mWidth");
                    Field hf = surfaceClass.getDeclaredField("mHeight");
                    wf.setAccessible(true);
                    hf.setAccessible(true);
                    int w = wf.getInt(surface);
                    int h = hf.getInt(surface);
                    if (w > 0 && h > 0) return new int[]{w, h};
                    break;
                } catch (NoSuchFieldException e) {
                    surfaceClass = surfaceClass.getSuperclass();
                }
            }
        } catch (Exception ignored) {}

        return new int[]{1920, 1080};
    }

    /**
     * Setup ImageReader to intercept camera frames and forward virtual frames.
     */
    private void setupImageReaderForForwarding(final ImageReader reader,
                                                final SurfaceMapping mapping) {
        reader.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
            @Override
            public void onImageAvailable(ImageReader imageReader) {
                if (mapping.closed) return;

                Image image = null;
                try {
                    image = imageReader.acquireLatestImage();
                    if (image == null) return;

                    // Forward virtual frame to the original surface
                    forwardVirtualFrame(mapping);
                } catch (Exception e) {
                    // Silently handle — common during session teardown
                } finally {
                    if (image != null) {
                        try { image.close(); } catch (Exception ignored) {}
                    }
                }
            }
        }, getFrameProcessHandler());
    }

    /**
     * Forward virtual frame to the original surface via ImageWriter.
     */
    private void forwardVirtualFrame(SurfaceMapping mapping) {
        if (mapping.closed || mapping.originalSurface == null
                || !mapping.originalSurface.isValid()) return;

        try {
            // Initialize ImageWriter lazily
            if (mapping.imageWriter == null) {
                try {
                    if (Build.VERSION.SDK_INT >= 23) {
                        mapping.imageWriter = ImageWriter.newInstance(
                                mapping.originalSurface, 2);
                    } else {
                        // API < 23: try Canvas fallback
                        forwardVirtualFrameViaCanvas(mapping);
                        return;
                    }
                } catch (Exception e) {
                    // Canvas fallback
                    forwardVirtualFrameViaCanvas(mapping);
                    return;
                }
            }

            Image outputImage = null;
            try {
                outputImage = mapping.imageWriter.dequeueInputImage();
            } catch (Exception e) {
                return; // No buffer available
            }

            Bitmap frame = getProcessedFrame(mapping.width, mapping.height);
            if (frame == null) {
                outputImage.close();
                return;
            }

            try {
                int format = outputImage.getFormat();

                if (format == ImageFormat.YUV_420_888) {
                    byte[] nv21 = getYuvData(frame, mapping.width, mapping.height);
                    if (nv21 != null) {
                        Image.Plane[] planes = outputImage.getPlanes();
                        writeYPlane(planes[0], nv21, mapping.width, mapping.height);
                        writeUVPlanes(planes[1], planes[2], nv21,
                                mapping.width * mapping.height, mapping.width, mapping.height);
                    }
                } else if (format == ImageFormat.JPEG) {
                    ByteArrayOutputStream bos = new ByteArrayOutputStream();
                    frame.compress(Bitmap.CompressFormat.JPEG, 90, bos);
                    byte[] jpegData = bos.toByteArray();
                    ByteBuffer buf = outputImage.getPlanes()[0].getBuffer();
                    buf.rewind();
                    buf.put(jpegData, 0, Math.min(jpegData.length, buf.remaining()));
                }

                mapping.imageWriter.queueInputImage(outputImage);
            } catch (Exception e) {
                try { outputImage.close(); } catch (Exception ignored) {}
                log("ImageWriter queue error: " + e.getMessage());
            }

            recycleTempFrame(frame);
        } catch (Exception e) {
            log("forwardVirtualFrame error: " + e.getMessage());
        }
    }

    /**
     * Canvas-based fallback for forwarding frames to surfaces.
     */
    private void forwardVirtualFrameViaCanvas(SurfaceMapping mapping) {
        if (mapping.originalSurface == null || !mapping.originalSurface.isValid()) return;

        Canvas canvas = null;
        try {
            canvas = mapping.originalSurface.lockCanvas(null);
            if (canvas != null) {
                Bitmap frame = getProcessedFrame(mapping.width, mapping.height);
                if (frame != null) {
                    canvas.drawBitmap(frame, 0, 0, null);
                    recycleTempFrame(frame);
                }
                mapping.originalSurface.unlockCanvasAndPost(canvas);
            }
        } catch (Exception e) {
            // Surface doesn't support Canvas — nothing we can do
        }
    }

    /**
     * Hook StateCallback for session lifecycle cleanup.
     * Hooks per-class, not per-instance, to avoid stack accumulation.
     */
    private void hookStateCallbackForCleanup(final Object callbackInstance,
                                              final ClassLoader classLoader,
                                              final List<SurfaceMapping> sessionMappings) {
        if (callbackInstance == null) return;

        Class<?> callbackClass = callbackInstance.getClass();
        if (hookedCallbackClasses.contains(callbackClass)) {
            // Already hooked this class — just register the mappings
            // They'll be cleaned up when onClosed fires via sessionToMappings
            return;
        }

        // Hook onConfigured — track session → mappings
        Method onConfigured = findMethodInHierarchy(callbackClass,
                "onConfigured", "android.hardware.camera2.CameraCaptureSession");
        if (onConfigured != null) {
            Class<?> declaring = onConfigured.getDeclaringClass();
            try {
                XposedHelpers.findAndHookMethod(declaring, "onConfigured",
                        "android.hardware.camera2.CameraCaptureSession",
                        new XC_MethodHook() {
                            @Override
                            protected void afterHookedMethod(MethodHookParam param) {
                                Object session = param.args[0];
                                // Store the most recent mappings for this session
                                sessionToMappings.put(session, new ArrayList<>(sessionMappings));
                            }
                        });
            } catch (Exception e) {
                log("Failed to hook onConfigured: " + e.getMessage());
            }
        }

        // Hook onClosed — cleanup
        Method onClosed = findMethodInHierarchy(callbackClass,
                "onClosed", "android.hardware.camera2.CameraCaptureSession");
        if (onClosed != null) {
            Class<?> declaring = onClosed.getDeclaringClass();
            try {
                XposedHelpers.findAndHookMethod(declaring, "onClosed",
                        "android.hardware.camera2.CameraCaptureSession",
                        new XC_MethodHook() {
                            @Override
                            protected void afterHookedMethod(MethodHookParam param) {
                                Object session = param.args[0];
                                cleanupSessionMappings(session);
                            }
                        });
            } catch (Exception e) {
                log("Failed to hook onClosed: " + e.getMessage());
            }
        }

        // Hook onConfigureFailed — cleanup
        Method onFailed = findMethodInHierarchy(callbackClass,
                "onConfigureFailed", "android.hardware.camera2.CameraCaptureSession");
        if (onFailed != null) {
            Class<?> declaring = onFailed.getDeclaringClass();
            try {
                XposedHelpers.findAndHookMethod(declaring, "onConfigureFailed",
                        "android.hardware.camera2.CameraCaptureSession",
                        new XC_MethodHook() {
                            @Override
                            protected void afterHookedMethod(MethodHookParam param) {
                                Object session = param.args[0];
                                cleanupSessionMappings(session);
                            }
                        });
            } catch (Exception e) {
                log("Failed to hook onConfigureFailed: " + e.getMessage());
            }
        }

        hookedCallbackClasses.add(callbackClass);
    }

    private void cleanupSessionMappings(Object session) {
        List<SurfaceMapping> mappings = sessionToMappings.remove(session);
        if (mappings != null) {
            for (SurfaceMapping mapping : mappings) {
                mapping.cleanup();
                surfaceMappings.remove(mapping.replacementSurface);
            }
        }
    }

    // =========================================================================
    // SurfaceTexture Tracking Hooks
    // =========================================================================

    private void hookSurfaceTextureTracking(final LoadPackageParam lpparam) {
        try {
            // Track SurfaceTexture buffer sizes
            XposedHelpers.findAndHookMethod(
                    "android.graphics.SurfaceTexture", lpparam.classLoader,
                    "setDefaultBufferSize", int.class, int.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            SurfaceTexture texture = (SurfaceTexture) param.thisObject;
                            int w = (int) param.args[0];
                            int h = (int) param.args[1];
                            surfaceTextureDimensions.put(identityKey(texture), new int[]{w, h});
                        }
                    }
            );

            // Track Surface(SurfaceTexture) constructor
            XposedHelpers.findAndHookConstructor(
                    "android.view.Surface", lpparam.classLoader,
                    SurfaceTexture.class,
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            Surface surface = (Surface) param.thisObject;
                            SurfaceTexture texture = (SurfaceTexture) param.args[0];
                            surfaceTypeByIdentity.put(identityKey(surface), "SurfaceTexture");

                            int[] dims = surfaceTextureDimensions.get(identityKey(texture));
                            if (dims != null) {
                                surfaceDimsByIdentity.put(identityKey(surface), dims);
                            }
                        }
                    }
            );

            log("SurfaceTexture tracking hooks installed");
        } catch (Exception e) {
            log("Failed to hook SurfaceTexture tracking: " + e.getMessage());
        }
    }

    // =========================================================================
    // CaptureRequest Builder Hooks
    // =========================================================================

    private void hookCaptureRequestBuilder(final LoadPackageParam lpparam) {
        try {
            // Hook addTarget to swap surfaces
            XposedHelpers.findAndHookMethod(
                    "android.hardware.camera2.CaptureRequest$Builder", lpparam.classLoader,
                    "addTarget", Surface.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (!isActive()) return;

                            Surface targetSurface = (Surface) param.args[0];
                            for (SurfaceMapping mapping : surfaceMappings.values()) {
                                if (mapping.originalSurface == targetSurface && !mapping.closed) {
                                    param.args[0] = mapping.replacementSurface;
                                    break;
                                }
                            }
                        }
                    }
            );

            // Hook removeTarget as well
            XposedHelpers.findAndHookMethod(
                    "android.hardware.camera2.CaptureRequest$Builder", lpparam.classLoader,
                    "removeTarget", Surface.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (!isActive()) return;

                            Surface targetSurface = (Surface) param.args[0];
                            for (SurfaceMapping mapping : surfaceMappings.values()) {
                                if (mapping.originalSurface == targetSurface && !mapping.closed) {
                                    param.args[0] = mapping.replacementSurface;
                                    break;
                                }
                            }
                        }
                    }
            );

            // Hook setRepeatingRequest and capture for config reload
            String[] sessionMethods = {"setRepeatingRequest", "capture"};
            String[] sessionClasses = {
                    "android.hardware.camera2.CameraCaptureSession",
                    "android.hardware.camera2.impl.CameraCaptureSessionImpl"
            };

            for (String sessionClass : sessionClasses) {
                for (String methodName : sessionMethods) {
                    try {
                        XposedHelpers.findAndHookMethod(
                                sessionClass, lpparam.classLoader,
                                methodName,
                                "android.hardware.camera2.CaptureRequest",
                                "android.hardware.camera2.CameraCaptureSession$CaptureCallback",
                                Handler.class,
                                new XC_MethodHook() {
                                    @Override
                                    protected void beforeHookedMethod(MethodHookParam param) {
                                        if (isActive()) reloadPreferencesIfNeeded();
                                    }
                                }
                        );
                    } catch (Exception ignored) {}
                }
            }

            log("CaptureRequest builder hooks installed");
        } catch (Exception e) {
            log("Failed to hook CaptureRequest builder: " + e.getMessage());
        }
    }

    // =========================================================================
    // Camera1 Surface Binding Hooks
    // =========================================================================

    private void hookCamera1SurfaceBinding(final LoadPackageParam lpparam) {
        try {
            XposedHelpers.findAndHookMethod(
                    "android.hardware.Camera", lpparam.classLoader,
                    "setPreviewTexture", SurfaceTexture.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (isActive()) reloadPreferencesIfNeeded();
                        }
                    }
            );

            XposedHelpers.findAndHookMethod(
                    "android.hardware.Camera", lpparam.classLoader,
                    "setPreviewDisplay", SurfaceHolder.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (isActive()) reloadPreferencesIfNeeded();
                        }
                    }
            );

            log("Camera1 surface binding hooks installed");
        } catch (Exception e) {
            log("Failed to hook Camera1 surface binding: " + e.getMessage());
        }
    }
}