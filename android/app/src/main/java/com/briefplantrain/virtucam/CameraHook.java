package com.briefplantrain.virtucam;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.SurfaceTexture;
import android.hardware.Camera;
import android.media.Image;
import android.media.ImageReader;
import android.media.ImageWriter;
import android.media.MediaMetadataRetriever;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Surface;
import android.view.SurfaceHolder;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;

import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XC_MethodReplacement;
import de.robv.android.xposed.XSharedPreferences;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage.LoadPackageParam;

/**
 * VirtuCam Xposed Hook Module - Revised
 *
 * Hooks Camera1 API, Camera2 API (via ImageReader listener interception),
 * and Surface-level rendering for comprehensive virtual camera injection.
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

    // Reusable buffers to reduce GC pressure
    private int[] reusableArgbBuffer = null;
    private byte[] reusableYuvBuffer = null;
    private int reusableBufferWidth = 0;
    private int reusableBufferHeight = 0;

    // Video frame tracking
    private MediaMetadataRetriever activeRetriever = null;
    private long videoDurationUs = 0;
    private long videoStartTime = 0;
    private boolean isVideoSource = false;

    private long lastConfigReload = 0;
    private static final long CONFIG_RELOAD_INTERVAL = 3000;

    // Track original ImageReader listeners for wrapping
    private final Map<ImageReader, Object> originalListeners = new ConcurrentHashMap<>();
    
    // Surface replacement mappings for CameraCaptureSession hooks
    private final Map<Surface, SurfaceMapping> surfaceMappings = new ConcurrentHashMap<>();
    private final Map<Surface, SurfaceTexture> surfaceToTextureMap = new ConcurrentHashMap<>();
    private final Map<Object, List<SurfaceMapping>> sessionToMappings = new ConcurrentHashMap<>();
    
    // FIX 2: Track surface types (ImageReader vs SurfaceTexture)
    private final Map<Surface, String> surfaceTypeTracker = new ConcurrentHashMap<>();
    
    // Helper class to track surface replacements
    private static class SurfaceMapping {
        Surface originalSurface;
        Surface replacementSurface;
        ImageReader imageReader;
        ImageWriter imageWriter;
        int width;
        int height;
        int format;
        String detectedType; // FIX 2: Store detected surface type
        volatile boolean closed = false;
        
        SurfaceMapping(Surface original, Surface replacement, ImageReader reader, int w, int h, int fmt, String type) {
            this.originalSurface = original;
            this.replacementSurface = replacement;
            this.imageReader = reader;
            this.width = w;
            this.height = h;
            this.format = fmt;
            this.detectedType = type;
        }
        
        void cleanup() {
            if (closed) return;
            closed = true;
            
            if (imageReader != null) {
                try {
                    imageReader.close();
                } catch (Exception ignored) {}
                imageReader = null;
            }
            if (imageWriter != null) {
                try {
                    imageWriter.close();
                } catch (Exception ignored) {}
                imageWriter = null;
            }
        }
    }

    @Override
    public void handleLoadPackage(final LoadPackageParam lpparam) throws Throwable {
        log("Hook loaded in package: " + lpparam.packageName);

        if (lpparam.packageName.equals(PACKAGE_NAME)) {
            return;
        }

        loadPreferences();

        if (!isTargetedApp(lpparam.packageName)) {
            log("Package not targeted: " + lpparam.packageName);
            return;
        }

        log("Hooking package: " + lpparam.packageName + " (enabled=" + enabled + ")");

        hookCamera2API(lpparam);
        hookCamera1API(lpparam);
        hookSurfaceLevelRendering(lpparam);
        hookCameraCaptureSession(lpparam);
        hookSurfaceTextureAttachment(lpparam);
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
                    if (cachedFrame != null) {
                        cachedFrame.recycle();
                        cachedFrame = null;
                    }
                    cachedMediaPath = null;
                    closeVideoRetriever();
                }
            }
            mediaSourcePath = newMediaPath;

            lastConfigReload = System.currentTimeMillis();

            log("Config loaded - enabled=" + enabled
                    + ", mediaPath=" + (mediaSourcePath != null ? "set" : "null")
                    + ", target=" + cameraTarget
                    + ", targetMode=" + targetMode);
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

    // =========================================================================
    // Camera2 API Hooks
    // =========================================================================

    private void hookCamera2API(final LoadPackageParam lpparam) {
        try {
            // Hook CameraManager.openCamera for logging and config reload
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
                            String cameraId = (String) param.args[0];
                            log("Camera2 openCamera - ID: " + cameraId);
                            
                            // Check if this camera should be hooked based on cameraTarget preference
                            if (!shouldHookCamera(param.thisObject, cameraId, lpparam.classLoader)) {
                                log("Skipping camera ID " + cameraId + " (doesn't match target: " + cameraTarget + ")");
                            }
                        }
                    }
            );

            // Key hook: ImageReader.setOnImageAvailableListener
            // We wrap the listener to intercept frames before the app sees them
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

                            // Replace with our wrapper listener
                            param.args[0] = createWrappedImageReaderListener(
                                    originalListener, reader, lpparam.classLoader);
                            log("Wrapped ImageReader.OnImageAvailableListener");
                        }
                    }
            );

            // Hook acquireLatestImage — replace the Image data after acquisition
            XposedHelpers.findAndHookMethod(
                    "android.media.ImageReader",
                    lpparam.classLoader,
                    "acquireLatestImage",
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            if (!isActive()) return;
                            replaceImageData((Image) param.getResult(),
                                    (ImageReader) param.thisObject);
                        }
                    }
            );

            XposedHelpers.findAndHookMethod(
                    "android.media.ImageReader",
                    lpparam.classLoader,
                    "acquireNextImage",
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            if (!isActive()) return;
                            replaceImageData((Image) param.getResult(),
                                    (ImageReader) param.thisObject);
                        }
                    }
            );

            // FIX 2: Hook ImageReader.getSurface() to track ImageReader surfaces
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
                                surfaceTypeTracker.put(s, "ImageReader:" + format);
                                log("Tracked ImageReader surface: format=" + format);
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
     * Wraps the app's OnImageAvailableListener so we can intercept frames.
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
                        public Object invoke(Object proxy, Method method, Object[] args)
                                throws Throwable {
                            if ("onImageAvailable".equals(method.getName())) {
                                reloadPreferencesIfNeeded();
                                // The image data will be replaced when the app
                                // calls acquireLatestImage/acquireNextImage
                                // (hooked above), so just forward the callback.
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
     * Replace data in a Camera2 Image object.
     * Since Image planes are typically read-only, we use reflection to
     * write directly into the underlying buffer when possible, or replace
     * the plane data via native-level access.
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
                byte[] yuvData = getYuvData(frame, width, height);
                if (yuvData == null) return;

                int frameSize = width * height;

                // Y plane
                writeToPlaneBuffer(planes[0], yuvData, 0, frameSize);

                // U and V planes (interleaved in NV21, but YUV_420_888 has separate planes)
                // planes[1] = U, planes[2] = V
                int uvSize = frameSize / 4;
                byte[] uData = new byte[uvSize];
                byte[] vData = new byte[uvSize];

                // Extract U and V from NV21 interleaved UV data
                for (int i = 0; i < uvSize; i++) {
                    vData[i] = yuvData[frameSize + i * 2];
                    uData[i] = yuvData[frameSize + i * 2 + 1];
                }

                writeToPlaneBuffer(planes[1], uData, 0, uvSize);
                writeToPlaneBuffer(planes[2], vData, 0, uvSize);

            } else if (format == ImageFormat.JPEG) {
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                frame.compress(Bitmap.CompressFormat.JPEG, 90, bos);
                byte[] jpegData = bos.toByteArray();
                writeToPlaneBuffer(planes[0], jpegData, 0, jpegData.length);
            }

            if (frame != cachedFrame) {
                frame.recycle();
            }
        } catch (Exception e) {
            log("replaceImageData error: " + e.getMessage());
        }
    }

    /**
     * Attempt to write data into an Image.Plane's ByteBuffer.
     * Uses reflection to make the buffer writable if needed.
     */
    private void writeToPlaneBuffer(Image.Plane plane, byte[] data, int offset, int length) {
        try {
            ByteBuffer buffer = plane.getBuffer();

            // Try direct write first
            try {
                buffer.rewind();
                int writeLen = Math.min(length, buffer.remaining());
                buffer.put(data, offset, writeLen);
                return;
            } catch (Exception ignored) {
                // Buffer is read-only, try reflection
            }

            // Use reflection to access the underlying byte array or native pointer
            try {
                // Try to get a writable duplicate via reflection on the
                // DirectByteBuffer's internal address
                Field addressField = null;
                Class<?> bufClass = buffer.getClass();
                while (bufClass != null) {
                    try {
                        addressField = bufClass.getDeclaredField("address");
                        addressField.setAccessible(true);
                        break;
                    } catch (NoSuchFieldException e) {
                        bufClass = bufClass.getSuperclass();
                    }
                }

                if (addressField != null) {
                    long address = addressField.getLong(buffer);
                    if (address != 0) {
                        // Use Unsafe or direct memory copy
                        // This is a last resort for read-only direct buffers
                        sun.misc.Unsafe unsafe = getUnsafe();
                        if (unsafe != null) {
                            int writeLen = Math.min(length, buffer.capacity());
                            for (int i = 0; i < writeLen; i++) {
                                unsafe.putByte(address + i, data[offset + i]);
                            }
                        }
                    }
                }
            } catch (Exception e) {
                log("Reflection buffer write failed: " + e.getMessage());
            }
        } catch (Exception e) {
            log("writeToPlaneBuffer error: " + e.getMessage());
        }
    }

    private static sun.misc.Unsafe getUnsafe() {
        try {
            Field f = sun.misc.Unsafe.class.getDeclaredField("theUnsafe");
            f.setAccessible(true);
            return (sun.misc.Unsafe) f.get(null);
        } catch (Exception e) {
            return null;
        }
    }

    // =========================================================================
    // Camera1 API Hooks
    // =========================================================================

    private void hookCamera1API(final LoadPackageParam lpparam) {
        try {
            // Hook Camera.open(int)
            XposedHelpers.findAndHookMethod(
                    "android.hardware.Camera",
                    lpparam.classLoader,
                    "open", int.class,
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            reloadPreferencesIfNeeded();
                            log("Camera1 open(int) - ID: " + param.args[0]);
                        }
                    }
            );

            // Hook Camera.open()
            XposedHelpers.findAndHookMethod(
                    "android.hardware.Camera",
                    lpparam.classLoader,
                    "open",
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            reloadPreferencesIfNeeded();
                            log("Camera1 open() - default");
                        }
                    }
            );

            // Hook all three preview callback setters
            String[] callbackMethods = {
                    "setPreviewCallback",
                    "setPreviewCallbackWithBuffer",
                    "setOneShotPreviewCallback"
            };

            for (String methodName : callbackMethods) {
                XposedHelpers.findAndHookMethod(
                        "android.hardware.Camera",
                        lpparam.classLoader,
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

            // Hook Camera.addCallbackBuffer to ensure we keep getting callbacks
            XposedHelpers.findAndHookMethod(
                    "android.hardware.Camera",
                    lpparam.classLoader,
                    "addCallbackBuffer",
                    byte[].class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            // Just let it through — ensures buffer recycling works
                        }
                    }
            );

            log("Camera1 API hooks installed");
        } catch (Exception e) {
            log("Failed to hook Camera1 API: " + e.getMessage());
        }
    }

    /**
     * Create a wrapped Camera.PreviewCallback that injects our frames.
     * We store a reference to the Camera at wrap time to avoid casting issues.
     */
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
                        public Object invoke(Object proxy, Method method, Object[] args)
                                throws Throwable {
                            if ("onPreviewFrame".equals(method.getName())
                                    && isActive() && args.length >= 2) {
                                try {
                                    reloadPreferencesIfNeeded();

                                    // args[0] = byte[] data, args[1] = Camera
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
                                                int copyLen = Math.min(
                                                        yuvData.length, origData.length);
                                                System.arraycopy(
                                                        yuvData, 0, origData, 0, copyLen);
                                                // Write into the same buffer instead
                                                // of replacing the reference, so
                                                // addCallbackBuffer still works
                                            }
                                            if (frame != cachedFrame) {
                                                frame.recycle();
                                            }
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
    // Surface-Level Hooks (replaces ineffective SurfaceView/TextureView draw)
    // =========================================================================

    private void hookSurfaceLevelRendering(final LoadPackageParam lpparam) {
        try {
            // Hook Surface.lockCanvas — used by apps that draw camera
            // preview manually to a Surface
            XposedHelpers.findAndHookMethod(
                    "android.view.Surface",
                    lpparam.classLoader,
                    "lockCanvas",
                    android.graphics.Rect.class,
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            // Tag the canvas so we can inject in unlockCanvasAndPost
                        }
                    }
            );

            // Hook SurfaceTexture.updateTexImage
            // This is called when a new camera frame is ready on a GL texture.
            // We can't directly replace GL texture content from Java, but we
            // can detect when camera frames arrive.
            XposedHelpers.findAndHookMethod(
                    "android.graphics.SurfaceTexture",
                    lpparam.classLoader,
                    "updateTexImage",
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            // For GL-based camera previews, the most effective
                            // approach is hooking at the ImageReader/callback
                            // level (already done above). This hook is a
                            // placeholder for future GL injection.
                        }
                    }
            );

            log("Surface-level hooks installed");
        } catch (Exception e) {
            log("Failed to hook Surface-level rendering: " + e.getMessage());
        }
    }

    // =========================================================================
    // Frame Loading & Processing
    // =========================================================================

    /**
     * Get a processed (scaled, rotated, mirrored) frame ready for injection.
     */
    private Bitmap getProcessedFrame(int targetWidth, int targetHeight) {
        synchronized (frameLock) {
            ensureFrameLoaded();
            if (cachedFrame == null) return null;
            return processFrame(cachedFrame, targetWidth, targetHeight);
        }
    }

    /**
     * Load the media frame if not already cached.
     */
    private void ensureFrameLoaded() {
        if (cachedFrame != null && mediaSourcePath != null
                && mediaSourcePath.equals(cachedMediaPath)) {
            // For video sources, get the current frame based on elapsed time
            if (isVideoSource && activeRetriever != null) {
                updateVideoFrame();
            }
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

        if (cachedFrame != null) {
            log("Frame loaded: " + cachedFrame.getWidth() + "x" + cachedFrame.getHeight());
        }
    }

    private void loadImageSource() {
        try {
            isVideoSource = false;
            closeVideoRetriever();

            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
            cachedFrame = BitmapFactory.decodeFile(mediaSourcePath, opts);
        } catch (Exception e) {
            log("Image loading failed: " + e.getMessage());
        }
    }

    private void loadVideoSource() {
        try {
            isVideoSource = true;
            closeVideoRetriever();

            activeRetriever = new MediaMetadataRetriever();
            activeRetriever.setDataSource(mediaSourcePath);

            String durationStr = activeRetriever.extractMetadata(
                    MediaMetadataRetriever.METADATA_KEY_DURATION);
            videoDurationUs = (durationStr != null)
                    ? Long.parseLong(durationStr) * 1000 : 0; // convert ms to us
            videoStartTime = System.currentTimeMillis();

            cachedFrame = activeRetriever.getFrameAtTime(0,
                    MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
        } catch (Exception e) {
            log("Video loading failed: " + e.getMessage());
            isVideoSource = false;
        }
    }

    /**
     * Update the cached frame to the current video position (looping).
     */
    private void updateVideoFrame() {
        if (activeRetriever == null || videoDurationUs <= 0) return;

        try {
            long elapsed = (System.currentTimeMillis() - videoStartTime) * 1000; // to us
            long positionUs = elapsed % videoDurationUs;

            Bitmap newFrame = activeRetriever.getFrameAtTime(positionUs,
                    MediaMetadataRetriever.OPTION_CLOSEST);
            if (newFrame != null) {
                Bitmap old = cachedFrame;
                cachedFrame = newFrame;
                if (old != null && old != newFrame) {
                    old.recycle();
                }
            }
        } catch (Exception e) {
            log("Video frame update error: " + e.getMessage());
        }
    }

    private void closeVideoRetriever() {
        if (activeRetriever != null) {
            try {
                activeRetriever.release();
            } catch (Exception ignored) {
            }
            activeRetriever = null;
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
            canvas.drawColor(Color.BLACK); // Black letterbox

            float srcW = source.getWidth();
            float srcH = source.getHeight();

            // Fit within target while maintaining aspect ratio
            float fitScale = Math.min(targetWidth / srcW, targetHeight / srcH);

            Matrix matrix = new Matrix();

            // Center the source in the target
            float scaledW = srcW * fitScale;
            float scaledH = srcH * fitScale;
            float translateX = (targetWidth - scaledW) / 2f;
            float translateY = (targetHeight - scaledH) / 2f;

            // Apply user scale factors on top of fit scale
            float finalScaleX = fitScale * scaleX * (mirrored ? -1 : 1);
            float finalScaleY = fitScale * scaleY;

            matrix.postScale(finalScaleX, finalScaleY);

            if (mirrored) {
                // After negative X scale, translate to compensate
                matrix.postTranslate(scaledW * scaleX, 0);
            }

            matrix.postTranslate(translateX, translateY);

            if (rotation != 0) {
                matrix.postRotate(rotation, targetWidth / 2f, targetHeight / 2f);
            }

            // Apply user offset (as fraction of target dimensions)
            matrix.postTranslate(offsetX * targetWidth, offsetY * targetHeight);

            canvas.drawBitmap(source, matrix, null);
            return output;
        } catch (Exception e) {
            log("processFrame error: " + e.getMessage());
            return Bitmap.createScaledBitmap(source, targetWidth, targetHeight, true);
        }
    }

    // =========================================================================
    // YUV Conversion (with buffer reuse)
    // =========================================================================

    /**
     * Convert a bitmap to NV21 YUV data, reusing buffers when possible.
     */
    private byte[] getYuvData(Bitmap bitmap, int width, int height) {
        try {
            // Reuse buffers if dimensions match
            if (width != reusableBufferWidth || height != reusableBufferHeight) {
                reusableArgbBuffer = new int[width * height];
                reusableYuvBuffer = new byte[width * height * 3 / 2];
                reusableBufferWidth = width;
                reusableBufferHeight = height;
            }

            bitmap.getPixels(reusableArgbBuffer, 0, width, 0, 0, width, height);
            encodeNV21(reusableYuvBuffer, reusableArgbBuffer, width, height);
            return reusableYuvBuffer;
        } catch (Exception e) {
            log("YUV conversion failed: " + e.getMessage());
            return null;
        }
    }

    /**
     * Encode ARGB pixels to NV21 format.
     * NV21 layout: [Y plane (w*h bytes)] [VU interleaved (w*h/2 bytes)]
     */
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

    /**
     * Check if a camera should be hooked based on cameraTarget preference
     */
    private boolean shouldHookCamera(Object cameraManager, String cameraId, ClassLoader classLoader) {
        if ("all".equals(cameraTarget)) {
            return true;
        }
        
        try {
            // Get CameraCharacteristics for this camera
            Object characteristics = XposedHelpers.callMethod(
                    cameraManager, "getCameraCharacteristics", cameraId);
            
            // Get LENS_FACING
            Class<?> characteristicsClass = XposedHelpers.findClass(
                    "android.hardware.camera2.CameraCharacteristics", classLoader);
            Class<?> keyClass = XposedHelpers.findClass(
                    "android.hardware.camera2.CameraCharacteristics$Key", classLoader);
            
            Object lensFacingKey = XposedHelpers.getStaticObjectField(
                    characteristicsClass, "LENS_FACING");
            
            Object lensFacing = XposedHelpers.callMethod(
                    characteristics, "get", lensFacingKey);
            
            if (lensFacing == null) return true; // Hook if we can't determine
            
            int facing = (Integer) lensFacing;
            
            // CameraCharacteristics.LENS_FACING_FRONT = 0
            // CameraCharacteristics.LENS_FACING_BACK = 1
            // CameraCharacteristics.LENS_FACING_EXTERNAL = 2
            
            if ("front".equals(cameraTarget)) {
                return facing == 0;
            } else if ("back".equals(cameraTarget)) {
                return facing == 1;
            }
            
            return true;
        } catch (Exception e) {
            log("Failed to check camera facing: " + e.getMessage());
            return true; // Hook by default if we can't determine
        }
    }

    // =========================================================================
    // Strategy 1: Hook CameraCaptureSession Surface Replacement
    // =========================================================================

    private void hookCameraCaptureSession(final LoadPackageParam lpparam) {
        try {
            // Hook createCaptureSession(List<Surface>, StateCallback, Handler)
            XposedHelpers.findAndHookMethod(
                    "android.hardware.camera2.CameraDevice",
                    lpparam.classLoader,
                    "createCaptureSession",
                    List.class,
                    "android.hardware.camera2.CameraCaptureSession$StateCallback",
                    Handler.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                            if (!isActive()) return;
                            
                            reloadPreferencesIfNeeded();
                            log("Hooking createCaptureSession with Surface list");
                            
                            @SuppressWarnings("unchecked")
                            List<Surface> surfaces = (List<Surface>) param.args[0];
                            if (surfaces == null || surfaces.isEmpty()) return;
                            
                            List<Surface> replacementSurfaces = new ArrayList<>();
                            List<SurfaceMapping> sessionMappings = new ArrayList<>();
                            
                            for (Surface originalSurface : surfaces) {
                                try {
                                    // FIX 2: Check surface type before replacing
                                    String surfaceType = surfaceTypeTracker.get(originalSurface);
                                    if (surfaceType == null) {
                                        surfaceType = "Unknown";
                                    }
                                    
                                    // Get surface dimensions
                                    int[] dims = getSurfaceDimensions(originalSurface);
                                    int width = dims[0];
                                    int height = dims[1];
                                    
                                    if (width <= 0 || height <= 0) {
                                        // Use default dimensions if we can't determine
                                        width = 1920;
                                        height = 1080;
                                    }
                                    
                                    // FIX 2: Determine format based on surface type
                                    int format = ImageFormat.YUV_420_888;
                                    if (surfaceType.startsWith("ImageReader:")) {
                                        int detectedFormat = Integer.parseInt(surfaceType.substring(12));
                                        if (detectedFormat == ImageFormat.JPEG) {
                                            format = ImageFormat.JPEG;
                                        } else if (detectedFormat == ImageFormat.PRIVATE) {
                                            // Pass through PRIVATE surfaces
                                            replacementSurfaces.add(originalSurface);
                                            continue;
                                        }
                                    }
                                    
                                    // Create ImageReader for this surface
                                    ImageReader reader = ImageReader.newInstance(
                                            width, height, format, 2);
                                    
                                    Surface replacementSurface = reader.getSurface();
                                    
                                    // Store mapping
                                    SurfaceMapping mapping = new SurfaceMapping(
                                            originalSurface, replacementSurface, reader,
                                            width, height, format, surfaceType);
                                    surfaceMappings.put(replacementSurface, mapping);
                                    sessionMappings.add(mapping);
                                    
                                    // Set up listener to process frames
                                    setupImageReaderListener(reader, originalSurface, width, height);
                                    
                                    replacementSurfaces.add(replacementSurface);
                                    log("Replaced surface: " + width + "x" + height + " type=" + surfaceType);
                                } catch (Exception e) {
                                    log("Failed to replace surface: " + e.getMessage());
                                    replacementSurfaces.add(originalSurface);
                                }
                            }
                            
                            // Replace the surface list
                            param.args[0] = replacementSurfaces;
                            
                            // FIX 1: Hook the StateCallback instance methods instead of wrapping
                            Object originalCallback = param.args[1];
                            hookStateCallbackInstance(originalCallback, lpparam.classLoader, sessionMappings);
                        }
                    }
            );
            
            // Hook createCaptureSessionByOutputConfigurations for API 24+
            if (Build.VERSION.SDK_INT >= 24) {
                try {
                    XposedHelpers.findAndHookMethod(
                            "android.hardware.camera2.CameraDevice",
                            lpparam.classLoader,
                            "createCaptureSessionByOutputConfigurations",
                            List.class,
                            "android.hardware.camera2.CameraCaptureSession$StateCallback",
                            Handler.class,
                            new XC_MethodHook() {
                                @Override
                                protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                                    if (!isActive()) return;
                                    
                                    reloadPreferencesIfNeeded();
                                    log("Hooking createCaptureSessionByOutputConfigurations");
                                    
                                    @SuppressWarnings("unchecked")
                                    List<Object> outputConfigs = (List<Object>) param.args[0];
                                    if (outputConfigs == null || outputConfigs.isEmpty()) return;
                                    
                                    List<Object> replacementConfigs = new ArrayList<>();
                                    List<SurfaceMapping> sessionMappings = new ArrayList<>();
                                    
                                    for (Object config : outputConfigs) {
                                        try {
                                            @SuppressWarnings("unchecked")
                                            List<Surface> surfaces = (List<Surface>) XposedHelpers.callMethod(
                                                    config, "getSurfaces");
                                            
                                            if (surfaces != null && !surfaces.isEmpty()) {
                                                Surface originalSurface = surfaces.get(0);
                                                
                                                // FIX 2: Check surface type
                                                String surfaceType = surfaceTypeTracker.get(originalSurface);
                                                if (surfaceType == null) surfaceType = "Unknown";
                                                
                                                int[] dims = getSurfaceDimensions(originalSurface);
                                                int width = dims[0] > 0 ? dims[0] : 1920;
                                                int height = dims[1] > 0 ? dims[1] : 1080;
                                                
                                                // FIX 2: Determine format based on surface type
                                                int format = ImageFormat.YUV_420_888;
                                                if (surfaceType.startsWith("ImageReader:")) {
                                                    int detectedFormat = Integer.parseInt(surfaceType.substring(12));
                                                    if (detectedFormat == ImageFormat.JPEG) {
                                                        format = ImageFormat.JPEG;
                                                    } else if (detectedFormat == ImageFormat.PRIVATE) {
                                                        replacementConfigs.add(config);
                                                        continue;
                                                    }
                                                }
                                                
                                                ImageReader reader = ImageReader.newInstance(
                                                        width, height, format, 2);
                                                Surface replacementSurface = reader.getSurface();
                                                
                                                SurfaceMapping mapping = new SurfaceMapping(
                                                        originalSurface, replacementSurface, reader,
                                                        width, height, format, surfaceType);
                                                surfaceMappings.put(replacementSurface, mapping);
                                                sessionMappings.add(mapping);
                                                
                                                setupImageReaderListener(reader, originalSurface, width, height);
                                                
                                                // Create new OutputConfiguration with our surface
                                                Class<?> outputConfigClass = XposedHelpers.findClass(
                                                        "android.hardware.camera2.params.OutputConfiguration",
                                                        lpparam.classLoader);
                                                Object newConfig = XposedHelpers.newInstance(
                                                        outputConfigClass, replacementSurface);
                                                replacementConfigs.add(newConfig);
                                                
                                                log("Replaced OutputConfiguration surface: " + width + "x" + height + " type=" + surfaceType);
                                            } else {
                                                replacementConfigs.add(config);
                                            }
                                        } catch (Exception e) {
                                            log("Failed to replace OutputConfiguration: " + e.getMessage());
                                            replacementConfigs.add(config);
                                        }
                                    }
                                    
                                    param.args[0] = replacementConfigs;
                                    
                                    // FIX 1: Hook the StateCallback instance methods instead of wrapping
                                    Object originalCallback = param.args[1];
                                    hookStateCallbackInstance(originalCallback, lpparam.classLoader, sessionMappings);
                                }
                            }
                    );
                } catch (Exception e) {
                    log("createCaptureSessionByOutputConfigurations not available: " + e.getMessage());
                }
            }
            
            // Hook createCaptureSession(SessionConfiguration) for API 28+
            if (Build.VERSION.SDK_INT >= 28) {
                try {
                    XposedHelpers.findAndHookMethod(
                            "android.hardware.camera2.CameraDevice",
                            lpparam.classLoader,
                            "createCaptureSession",
                            "android.hardware.camera2.params.SessionConfiguration",
                            new XC_MethodHook() {
                                @Override
                                protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                                    if (!isActive()) return;
                                    
                                    reloadPreferencesIfNeeded();
                                    log("Hooking createCaptureSession with SessionConfiguration");
                                    
                                    Object sessionConfig = param.args[0];
                                    
                                    @SuppressWarnings("unchecked")
                                    List<Object> outputConfigs = (List<Object>) XposedHelpers.callMethod(
                                            sessionConfig, "getOutputConfigurations");
                                    
                                    if (outputConfigs == null || outputConfigs.isEmpty()) return;
                                    
                                    List<Object> replacementConfigs = new ArrayList<>();
                                    List<SurfaceMapping> sessionMappings = new ArrayList<>();
                                    
                                    for (Object config : outputConfigs) {
                                        try {
                                            @SuppressWarnings("unchecked")
                                            List<Surface> surfaces = (List<Surface>) XposedHelpers.callMethod(
                                                    config, "getSurfaces");
                                            
                                            if (surfaces != null && !surfaces.isEmpty()) {
                                                Surface originalSurface = surfaces.get(0);
                                                
                                                // FIX 2: Check surface type
                                                String surfaceType = surfaceTypeTracker.get(originalSurface);
                                                if (surfaceType == null) surfaceType = "Unknown";
                                                
                                                int[] dims = getSurfaceDimensions(originalSurface);
                                                int width = dims[0] > 0 ? dims[0] : 1920;
                                                int height = dims[1] > 0 ? dims[1] : 1080;
                                                
                                                // FIX 2: Determine format based on surface type
                                                int format = ImageFormat.YUV_420_888;
                                                if (surfaceType.startsWith("ImageReader:")) {
                                                    int detectedFormat = Integer.parseInt(surfaceType.substring(12));
                                                    if (detectedFormat == ImageFormat.JPEG) {
                                                        format = ImageFormat.JPEG;
                                                    } else if (detectedFormat == ImageFormat.PRIVATE) {
                                                        replacementConfigs.add(config);
                                                        continue;
                                                    }
                                                }
                                                
                                                ImageReader reader = ImageReader.newInstance(
                                                        width, height, format, 2);
                                                Surface replacementSurface = reader.getSurface();
                                                
                                                SurfaceMapping mapping = new SurfaceMapping(
                                                        originalSurface, replacementSurface, reader,
                                                        width, height, format, surfaceType);
                                                surfaceMappings.put(replacementSurface, mapping);
                                                sessionMappings.add(mapping);
                                                
                                                setupImageReaderListener(reader, originalSurface, width, height);
                                                
                                                Class<?> outputConfigClass = XposedHelpers.findClass(
                                                        "android.hardware.camera2.params.OutputConfiguration",
                                                        lpparam.classLoader);
                                                Object newConfig = XposedHelpers.newInstance(
                                                        outputConfigClass, replacementSurface);
                                                replacementConfigs.add(newConfig);
                                                
                                                log("Replaced SessionConfiguration surface: " + width + "x" + height + " type=" + surfaceType);
                                            } else {
                                                replacementConfigs.add(config);
                                            }
                                        } catch (Exception e) {
                                            log("Failed to replace SessionConfiguration output: " + e.getMessage());
                                            replacementConfigs.add(config);
                                        }
                                    }
                                    
                                    // FIX 5: SessionConfiguration is immutable - create a new one
                                    // Get the session type
                                    int sessionType = (int) XposedHelpers.callMethod(sessionConfig, "getSessionType");
                                    
                                    // Get the executor
                                    Object executor = XposedHelpers.callMethod(sessionConfig, "getExecutor");
                                    
                                    // Get the state callback
                                    Object originalCallback = XposedHelpers.callMethod(sessionConfig, "getStateCallback");
                                    
                                    // FIX 1: Hook the callback's methods for cleanup (don't wrap it)
                                    hookStateCallbackInstance(originalCallback, lpparam.classLoader, sessionMappings);
                                    
                                    // Create new SessionConfiguration
                                    Class<?> sessionConfigClass = XposedHelpers.findClass(
                                        "android.hardware.camera2.params.SessionConfiguration", lpparam.classLoader);
                                    Object newSessionConfig = XposedHelpers.newInstance(sessionConfigClass,
                                        sessionType, replacementConfigs, executor, originalCallback);
                                    
                                    // Copy over any session parameters if they exist
                                    try {
                                        Object sessionParams = XposedHelpers.callMethod(sessionConfig, "getSessionParameters");
                                        if (sessionParams != null) {
                                            XposedHelpers.callMethod(newSessionConfig, "setSessionParameters", sessionParams);
                                        }
                                    } catch (Exception ignored) {}
                                    
                                    // Replace the argument
                                    param.args[0] = newSessionConfig;
                                }
                            }
                    );
                } catch (Exception e) {
                    log("SessionConfiguration hook not available: " + e.getMessage());
                }
            }
            
            log("CameraCaptureSession hooks installed");
        } catch (Exception e) {
            log("Failed to hook CameraCaptureSession: " + e.getMessage());
        }
    }

    /**
     * Get surface dimensions using reflection
     */
    private int[] getSurfaceDimensions(Surface surface) {
        int[] dims = new int[]{0, 0};
        try {
            // Try to get dimensions via reflection
            Field widthField = null;
            Field heightField = null;
            
            Class<?> surfaceClass = surface.getClass();
            while (surfaceClass != null) {
                try {
                    widthField = surfaceClass.getDeclaredField("mWidth");
                    heightField = surfaceClass.getDeclaredField("mHeight");
                    widthField.setAccessible(true);
                    heightField.setAccessible(true);
                    break;
                } catch (NoSuchFieldException e) {
                    surfaceClass = surfaceClass.getSuperclass();
                }
            }
            
            if (widthField != null && heightField != null) {
                dims[0] = widthField.getInt(surface);
                dims[1] = heightField.getInt(surface);
            }
        } catch (Exception e) {
            log("Failed to get surface dimensions: " + e.getMessage());
        }
        return dims;
    }

    /**
     * Setup ImageReader listener to process and forward frames
     */
    private void setupImageReaderListener(final ImageReader reader,
                                         final Surface originalSurface,
                                         final int width, final int height) {
        reader.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
            @Override
            public void onImageAvailable(ImageReader imageReader) {
                Image image = null;
                try {
                    image = imageReader.acquireLatestImage();
                    if (image == null) return;
                    
                    // FIX 3: Don't modify the intercepted image - just forward our virtual frame
                    // to the original surface
                    forwardVirtualFrameToSurface(originalSurface, width, height);
                    
                } catch (Exception e) {
                    log("ImageReader listener error: " + e.getMessage());
                } finally {
                    if (image != null) {
                        image.close();
                    }
                }
            }
        }, new Handler(Looper.getMainLooper()));
    }

    /**
     * FIX 3 & 4: Forward virtual frame to the original surface (renamed and fixed)
     */
    private void forwardVirtualFrameToSurface(Surface originalSurface,
                                              int width, int height) {
        if (originalSurface == null || !originalSurface.isValid()) return;
        
        try {
            // Try Canvas-based drawing first
            Canvas canvas = null;
            try {
                canvas = originalSurface.lockCanvas(null);
                if (canvas != null) {
                    Bitmap frame = getProcessedFrame(width, height);
                    if (frame != null) {
                        canvas.drawBitmap(frame, 0, 0, null);
                        if (frame != cachedFrame) {
                            frame.recycle();
                        }
                    }
                    originalSurface.unlockCanvasAndPost(canvas);
                    return;
                }
            } catch (Exception e) {
                // Canvas approach failed, try ImageWriter
            }
            
            // FIX 4: Fallback to ImageWriter for GL surfaces (API 23+)
            // Write virtual frame YUV data, not copy from source image
            if (Build.VERSION.SDK_INT >= 23) {
                SurfaceMapping mapping = findMappingByOriginalSurface(originalSurface);
                
                if (mapping != null && mapping.imageWriter == null && !mapping.closed) {
                    try {
                        mapping.imageWriter = ImageWriter.newInstance(originalSurface, 2);
                    } catch (Exception e) {
                        log("Failed to create ImageWriter: " + e.getMessage());
                    }
                }
                
                if (mapping != null && mapping.imageWriter != null) {
                    try {
                        Image outputImage = mapping.imageWriter.dequeueInputImage();
                        
                        Bitmap frame = getProcessedFrame(width, height);
                        if (frame != null) {
                            // Convert frame to YUV and write to output image planes
                            byte[] yuvData = getYuvData(frame, width, height);
                            if (yuvData != null) {
                                Image.Plane[] dstPlanes = outputImage.getPlanes();
                                int frameSize = width * height;
                                
                                // Y plane
                                ByteBuffer yBuffer = dstPlanes[0].getBuffer();
                                yBuffer.rewind();
                                yBuffer.put(yuvData, 0, frameSize);
                                
                                // U plane
                                int uvSize = frameSize / 4;
                                byte[] uData = new byte[uvSize];
                                byte[] vData = new byte[uvSize];
                                for (int i = 0; i < uvSize; i++) {
                                    vData[i] = yuvData[frameSize + i * 2];
                                    uData[i] = yuvData[frameSize + i * 2 + 1];
                                }
                                
                                if (dstPlanes.length >= 3) {
                                    ByteBuffer uBuffer = dstPlanes[1].getBuffer();
                                    uBuffer.rewind();
                                    uBuffer.put(uData);
                                    
                                    ByteBuffer vBuffer = dstPlanes[2].getBuffer();
                                    vBuffer.rewind();
                                    vBuffer.put(vData);
                                }
                                
                                if (frame != cachedFrame) {
                                    frame.recycle();
                                }
                            }
                            
                            mapping.imageWriter.queueInputImage(outputImage);
                        }
                    } catch (Exception e) {
                        log("ImageWriter forward error: " + e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            log("forwardVirtualFrameToSurface error: " + e.getMessage());
        }
    }

    /**
     * FIX 4: Helper method to find mapping by original surface
     */
    private SurfaceMapping findMappingByOriginalSurface(Surface originalSurface) {
        for (SurfaceMapping m : surfaceMappings.values()) {
            if (m.originalSurface == originalSurface) {
                return m;
            }
        }
        return null;
    }

    /**
     * FIX 1: Hook StateCallback instance methods directly instead of wrapping
     * This avoids the Proxy.newProxyInstance issue with abstract classes
     */
    private void hookStateCallbackInstance(final Object callbackInstance,
                                           final ClassLoader classLoader,
                                           final List<SurfaceMapping> sessionMappings) {
        try {
            // Get the actual class of the callback instance
            Class<?> callbackClass = callbackInstance.getClass();
            
            // Hook onConfigured
            XposedHelpers.findAndHookMethod(callbackClass, "onConfigured",
                    "android.hardware.camera2.CameraCaptureSession",
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                            Object session = param.args[0];
                            sessionToMappings.put(session, new ArrayList<>(sessionMappings));
                            log("CameraCaptureSession configured, tracking " + sessionMappings.size() + " surfaces");
                        }
                    });
            
            // Hook onClosed
            XposedHelpers.findAndHookMethod(callbackClass, "onClosed",
                    "android.hardware.camera2.CameraCaptureSession",
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                            Object session = param.args[0];
                            List<SurfaceMapping> mappings = sessionToMappings.remove(session);
                            if (mappings != null) {
                                for (SurfaceMapping mapping : mappings) {
                                    mapping.cleanup();
                                    surfaceMappings.remove(mapping.replacementSurface);
                                }
                                log("CameraCaptureSession closed, cleaned up " + mappings.size() + " mappings");
                            }
                        }
                    });
            
            // Hook onConfigureFailed
            XposedHelpers.findAndHookMethod(callbackClass, "onConfigureFailed",
                    "android.hardware.camera2.CameraCaptureSession",
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                            Object session = param.args[0];
                            List<SurfaceMapping> mappings = sessionToMappings.remove(session);
                            if (mappings != null) {
                                for (SurfaceMapping mapping : mappings) {
                                    mapping.cleanup();
                                    surfaceMappings.remove(mapping.replacementSurface);
                                }
                            }
                            log("CameraCaptureSession configuration failed, cleaned up mappings");
                        }
                    });
            
            log("Hooked StateCallback instance methods for cleanup");
        } catch (Exception e) {
            log("Failed to hook StateCallback instance: " + e.getMessage());
        }
    }

    // =========================================================================
    // Strategy 2: Hook SurfaceTexture Attachment
    // =========================================================================

    private void hookSurfaceTextureAttachment(final LoadPackageParam lpparam) {
        try {
            // Hook SurfaceTexture.updateTexImage
            XposedHelpers.findAndHookMethod(
                    "android.graphics.SurfaceTexture",
                    lpparam.classLoader,
                    "updateTexImage",
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                            if (!isActive()) return;
                            
                            // After camera updates the texture, we could inject here
                            // This is a placeholder for GL-based injection
                            // Full implementation would require EGL context manipulation
                            SurfaceTexture texture = (SurfaceTexture) param.thisObject;
                            // log("SurfaceTexture.updateTexImage called");
                        }
                    }
            );
            
            // Hook SurfaceTexture.attachToGLContext
            XposedHelpers.findAndHookMethod(
                    "android.graphics.SurfaceTexture",
                    lpparam.classLoader,
                    "attachToGLContext",
                    int.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                            if (!isActive()) return;
                            
                            SurfaceTexture texture = (SurfaceTexture) param.thisObject;
                            int texName = (int) param.args[0];
                            log("SurfaceTexture.attachToGLContext: texName=" + texName);
                        }
                    }
            );
            
            // Hook Surface constructor with SurfaceTexture
            XposedHelpers.findAndHookConstructor(
                    "android.view.Surface",
                    lpparam.classLoader,
                    SurfaceTexture.class,
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                            if (!isActive()) return;
                            
                            Surface surface = (Surface) param.thisObject;
                            SurfaceTexture texture = (SurfaceTexture) param.args[0];
                            surfaceToTextureMap.put(surface, texture);
                            // FIX 2: Track SurfaceTexture surfaces
                            surfaceTypeTracker.put(surface, "SurfaceTexture");
                            log("Surface created from SurfaceTexture");
                        }
                    }
            );
            
            log("SurfaceTexture attachment hooks installed");
        } catch (Exception e) {
            log("Failed to hook SurfaceTexture attachment: " + e.getMessage());
        }
    }

    // =========================================================================
    // Strategy 3: Hook CaptureRequest Builder
    // =========================================================================

    private void hookCaptureRequestBuilder(final LoadPackageParam lpparam) {
        try {
            // Hook CaptureRequest.Builder.addTarget
            XposedHelpers.findAndHookMethod(
                    "android.hardware.camera2.CaptureRequest$Builder",
                    lpparam.classLoader,
                    "addTarget",
                    Surface.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                            if (!isActive()) return;
                            
                            Surface targetSurface = (Surface) param.args[0];
                            
                            // Check if we have a replacement for this surface
                            for (SurfaceMapping mapping : surfaceMappings.values()) {
                                if (mapping.originalSurface == targetSurface) {
                                    param.args[0] = mapping.replacementSurface;
                                    log("Replaced target surface in CaptureRequest.Builder");
                                    break;
                                }
                            }
                        }
                    }
            );
            
            // Hook CameraCaptureSession.setRepeatingRequest
            XposedHelpers.findAndHookMethod(
                    "android.hardware.camera2.CameraCaptureSession",
                    lpparam.classLoader,
                    "setRepeatingRequest",
                    "android.hardware.camera2.CaptureRequest",
                    "android.hardware.camera2.CameraCaptureSession$CaptureCallback",
                    Handler.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                            if (!isActive()) return;
                            reloadPreferencesIfNeeded();
                            // log("setRepeatingRequest called");
                        }
                    }
            );
            
            // Hook CameraCaptureSession.capture
            XposedHelpers.findAndHookMethod(
                    "android.hardware.camera2.CameraCaptureSession",
                    lpparam.classLoader,
                    "capture",
                    "android.hardware.camera2.CaptureRequest",
                    "android.hardware.camera2.CameraCaptureSession$CaptureCallback",
                    Handler.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                            if (!isActive()) return;
                            reloadPreferencesIfNeeded();
                            // log("capture called");
                        }
                    }
            );
            
            log("CaptureRequest builder hooks installed");
        } catch (Exception e) {
            log("Failed to hook CaptureRequest builder: " + e.getMessage());
        }
    }

    // =========================================================================
    // Strategy 4: Hook Camera1 Surface Binding
    // =========================================================================

    private void hookCamera1SurfaceBinding(final LoadPackageParam lpparam) {
        try {
            // Hook Camera.setPreviewTexture
            XposedHelpers.findAndHookMethod(
                    "android.hardware.Camera",
                    lpparam.classLoader,
                    "setPreviewTexture",
                    SurfaceTexture.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                            if (!isActive()) return;
                            
                            reloadPreferencesIfNeeded();
                            log("Camera1 setPreviewTexture called");
                            
                            // We could replace the SurfaceTexture here, but it's complex
                            // The PreviewCallback hook is more reliable for Camera1
                        }
                    }
            );
            
            // Hook Camera.setPreviewDisplay
            XposedHelpers.findAndHookMethod(
                    "android.hardware.Camera",
                    lpparam.classLoader,
                    "setPreviewDisplay",
                    SurfaceHolder.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                            if (!isActive()) return;
                            
                            reloadPreferencesIfNeeded();
                            log("Camera1 setPreviewDisplay called");
                            
                            // Similar to setPreviewTexture, PreviewCallback is more reliable
                        }
                    }
            );
            
            log("Camera1 surface binding hooks installed");
        } catch (Exception e) {
            log("Failed to hook Camera1 surface binding: " + e.getMessage());
        }
    }
}
