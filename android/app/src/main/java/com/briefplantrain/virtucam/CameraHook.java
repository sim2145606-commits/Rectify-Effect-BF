package com.briefplantrain.virtucam;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.graphics.SurfaceTexture;
import android.graphics.YuvImage;
import android.hardware.Camera;
import android.media.Image;
import android.media.ImageReader;
import android.media.MediaMetadataRetriever;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Surface;
import android.view.SurfaceHolder;
import android.view.TextureView;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.lang.reflect.Method;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XSharedPreferences;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage.LoadPackageParam;

/**
 * VirtuCam Xposed Hook Module
 * 
 * Based on reference implementations:
 * - XVirtualCamera (sandyz987/XVirtualCamera)
 * - vcam (Xposed-Modules-Repo/com.example.vcam)
 * 
 * Hooks Camera1 API, Camera2 API, SurfaceView, and TextureView to inject virtual camera feeds.
 */
public class CameraHook implements IXposedHookLoadPackage {
    
    private static final String PACKAGE_NAME = "com.briefplantrain.virtucam";
    private static final String PREFS_NAME = "virtucam_config";
    private static final String TAG = "VirtuCam";
    
    private XSharedPreferences prefs;
    private boolean enabled = false;
    private String mediaSourcePath = null;
    private String cameraTarget = "front";
    private boolean mirrored = false;
    private int rotation = 0;
    private float scaleX = 1.0f;
    private float scaleY = 1.0f;
    private float offsetX = 0.0f;
    private float offsetY = 0.0f;
    private String targetMode = "whitelist";
    private Set<String> targetPackages = new HashSet<>();
    
    private Bitmap cachedFrame = null;
    private byte[] cachedYuvData = null;
    private Handler mainHandler;
    private long lastConfigReload = 0;
    private static final long CONFIG_RELOAD_INTERVAL = 5000; // 5 seconds

    @Override
    public void handleLoadPackage(final LoadPackageParam lpparam) throws Throwable {
        // Log hook initialization
        log("Hook loaded in package: " + lpparam.packageName);
        
        // Skip our own app
        if (lpparam.packageName.equals(PACKAGE_NAME)) {
            log("Skipping own package");
            return;
        }

        // Load preferences
        loadPreferences();
        
        // Check if this app is targeted
        if (!isTargetedApp(lpparam.packageName)) {
            log("Package not targeted: " + lpparam.packageName);
            return;
        }

        log("Hooking package: " + lpparam.packageName + " (enabled=" + enabled + ")");

        // Initialize handler
        try {
            mainHandler = new Handler(Looper.getMainLooper());
        } catch (Exception e) {
            log("Could not create handler: " + e.getMessage());
        }

        // Hook all camera APIs
        hookCamera2API(lpparam);
        hookCamera1API(lpparam);
        hookSurfaceView(lpparam);
        hookTextureView(lpparam);
        
        log("All hooks installed successfully for: " + lpparam.packageName);
    }

    private void log(String message) {
        XposedBridge.log(TAG + ": " + message);
    }

    private void loadPreferences() {
        try {
            prefs = new XSharedPreferences(PACKAGE_NAME, PREFS_NAME);
            prefs.makeWorldReadable();
            prefs.reload();
            
            enabled = prefs.getBoolean("enabled", false);
            mediaSourcePath = prefs.getString("mediaSourcePath", null);
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
            }
            
            lastConfigReload = System.currentTimeMillis();
            
            log("Config loaded - enabled=" + enabled + 
                ", mediaPath=" + (mediaSourcePath != null ? "set" : "null") + 
                ", target=" + cameraTarget +
                ", scale=(" + scaleX + "," + scaleY + ")" +
                ", offset=(" + offsetX + "," + offsetY + ")" +
                ", targetMode=" + targetMode);
        } catch (Exception e) {
            log("Failed to load preferences: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private void reloadPreferencesIfNeeded() {
        long now = System.currentTimeMillis();
        if (now - lastConfigReload > CONFIG_RELOAD_INTERVAL) {
            loadPreferences();
        }
    }

    private boolean isTargetedApp(String packageName) {
        if (!enabled) {
            return false;
        }
        
        if (targetMode.equals("whitelist")) {
            return targetPackages.contains(packageName);
        } else {
            return !targetPackages.contains(packageName);
        }
    }

    /**
     * Hook Camera2 API (modern Android camera API)
     */
    private void hookCamera2API(final LoadPackageParam lpparam) {
        try {
            // Hook CameraManager.openCamera
            XposedHelpers.findAndHookMethod(
                "android.hardware.camera2.CameraManager",
                lpparam.classLoader,
                "openCamera",
                String.class,
                "android.hardware.camera2.CameraDevice$StateCallback",
                android.os.Handler.class,
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                        if (!enabled) return;
                        
                        String cameraId = (String) param.args[0];
                        log("Camera2 openCamera() - ID: " + cameraId);
                        reloadPreferencesIfNeeded();
                    }
                }
            );

            // Hook ImageReader.acquireLatestImage to inject frames
            XposedHelpers.findAndHookMethod(
                "android.media.ImageReader",
                lpparam.classLoader,
                "acquireLatestImage",
                new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                        if (!enabled || mediaSourcePath == null) return;
                        
                        Image image = (Image) param.getResult();
                        if (image != null) {
                            try {
                                injectFrameIntoImage(image);
                            } catch (Exception e) {
                                log("Frame injection failed: " + e.getMessage());
                            }
                        }
                    }
                }
            );

            // Hook ImageReader.acquireNextImage as well
            XposedHelpers.findAndHookMethod(
                "android.media.ImageReader",
                lpparam.classLoader,
                "acquireNextImage",
                new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                        if (!enabled || mediaSourcePath == null) return;
                        
                        Image image = (Image) param.getResult();
                        if (image != null) {
                            try {
                                injectFrameIntoImage(image);
                            } catch (Exception e) {
                                log("Frame injection failed: " + e.getMessage());
                            }
                        }
                    }
                }
            );

            log("Successfully hooked Camera2 API");
        } catch (Exception e) {
            log("Failed to hook Camera2 API: " + e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * Hook Camera1 API (legacy Android camera API)
     */
    private void hookCamera1API(final LoadPackageParam lpparam) {
        try {
            // Hook Camera.open(int)
            XposedHelpers.findAndHookMethod(
                "android.hardware.Camera",
                lpparam.classLoader,
                "open",
                int.class,
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                        if (!enabled) return;
                        
                        int cameraId = (int) param.args[0];
                        log("Camera1 open() - ID: " + cameraId);
                        reloadPreferencesIfNeeded();
                    }
                }
            );

            // Hook Camera.open() (no args)
            XposedHelpers.findAndHookMethod(
                "android.hardware.Camera",
                lpparam.classLoader,
                "open",
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                        if (!enabled) return;
                        log("Camera1 open() - default camera");
                        reloadPreferencesIfNeeded();
                    }
                }
            );

            // Hook setPreviewCallback
            XposedHelpers.findAndHookMethod(
                "android.hardware.Camera",
                lpparam.classLoader,
                "setPreviewCallback",
                "android.hardware.Camera$PreviewCallback",
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                        if (!enabled || mediaSourcePath == null) return;
                        
                        final Object originalCallback = param.args[0];
                        if (originalCallback != null) {
                            param.args[0] = createWrappedPreviewCallback(originalCallback, lpparam.classLoader);
                        }
                    }
                }
            );

            // Hook setPreviewCallbackWithBuffer
            XposedHelpers.findAndHookMethod(
                "android.hardware.Camera",
                lpparam.classLoader,
                "setPreviewCallbackWithBuffer",
                "android.hardware.Camera$PreviewCallback",
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                        if (!enabled || mediaSourcePath == null) return;
                        
                        final Object originalCallback = param.args[0];
                        if (originalCallback != null) {
                            param.args[0] = createWrappedPreviewCallback(originalCallback, lpparam.classLoader);
                        }
                    }
                }
            );

            // Hook setOneShotPreviewCallback
            XposedHelpers.findAndHookMethod(
                "android.hardware.Camera",
                lpparam.classLoader,
                "setOneShotPreviewCallback",
                "android.hardware.Camera$PreviewCallback",
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                        if (!enabled || mediaSourcePath == null) return;
                        
                        final Object originalCallback = param.args[0];
                        if (originalCallback != null) {
                            param.args[0] = createWrappedPreviewCallback(originalCallback, lpparam.classLoader);
                        }
                    }
                }
            );

            log("Successfully hooked Camera1 API");
        } catch (Exception e) {
            log("Failed to hook Camera1 API: " + e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * Hook SurfaceView to inject virtual camera feed into preview
     */
    private void hookSurfaceView(final LoadPackageParam lpparam) {
        try {
            XposedHelpers.findAndHookMethod(
                "android.view.SurfaceView",
                lpparam.classLoader,
                "draw",
                Canvas.class,
                new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                        if (!enabled || mediaSourcePath == null) return;
                        
                        Canvas canvas = (Canvas) param.args[0];
                        if (canvas != null && cachedFrame != null) {
                            try {
                                drawVirtualFrame(canvas);
                            } catch (Exception e) {
                                log("SurfaceView draw failed: " + e.getMessage());
                            }
                        }
                    }
                }
            );
            
            log("Successfully hooked SurfaceView");
        } catch (Exception e) {
            log("Failed to hook SurfaceView: " + e.getMessage());
        }
    }

    /**
     * Hook TextureView to inject virtual camera feed into preview
     */
    private void hookTextureView(final LoadPackageParam lpparam) {
        try {
            XposedHelpers.findAndHookMethod(
                "android.view.TextureView",
                lpparam.classLoader,
                "draw",
                Canvas.class,
                new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                        if (!enabled || mediaSourcePath == null) return;
                        
                        Canvas canvas = (Canvas) param.args[0];
                        if (canvas != null && cachedFrame != null) {
                            try {
                                drawVirtualFrame(canvas);
                            } catch (Exception e) {
                                log("TextureView draw failed: " + e.getMessage());
                            }
                        }
                    }
                }
            );
            
            log("Successfully hooked TextureView");
        } catch (Exception e) {
            log("Failed to hook TextureView: " + e.getMessage());
        }
    }

    /**
     * Create a wrapped preview callback that injects virtual frames
     */
    private Object createWrappedPreviewCallback(final Object originalCallback, final ClassLoader classLoader) {
        try {
            Class<?> callbackClass = XposedHelpers.findClass("android.hardware.Camera$PreviewCallback", classLoader);
            
            return java.lang.reflect.Proxy.newProxyInstance(
                classLoader,
                new Class<?>[] { callbackClass },
                (proxy, method, args) -> {
                    if (method.getName().equals("onPreviewFrame") && enabled && mediaSourcePath != null) {
                        // Replace the byte[] data with our injected frame
                        byte[] injectedData = getInjectedYuvFrame((Camera) args[1]);
                        if (injectedData != null) {
                            args[0] = injectedData;
                        }
                    }
                    
                    // Call original callback
                    return method.invoke(originalCallback, args);
                }
            );
        } catch (Exception e) {
            log("Failed to create wrapped callback: " + e.getMessage());
            return originalCallback;
        }
    }

    /**
     * Inject virtual frame into Camera2 Image
     */
    private void injectFrameIntoImage(Image image) {
        try {
            if (cachedFrame == null) {
                loadMediaFrame();
            }
            
            if (cachedFrame == null) {
                log("No cached frame available for injection");
                return;
            }

            // Get image planes
            Image.Plane[] planes = image.getPlanes();
            if (planes.length < 1) {
                return;
            }

            // Convert cached bitmap to YUV and write to image buffer
            int width = image.getWidth();
            int height = image.getHeight();
            
            Bitmap processedFrame = processFrame(cachedFrame, width, height);
            byte[] yuvData = convertBitmapToYuv(processedFrame, width, height);
            
            if (yuvData != null) {
                ByteBuffer buffer = planes[0].getBuffer();
                buffer.rewind();
                int capacity = buffer.remaining();
                int dataLength = Math.min(yuvData.length, capacity);
                buffer.put(yuvData, 0, dataLength);
            }
            
            if (processedFrame != cachedFrame) {
                processedFrame.recycle();
            }
        } catch (Exception e) {
            log("Image injection error: " + e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * Get injected YUV frame for Camera1 API
     */
    private byte[] getInjectedYuvFrame(Camera camera) {
        try {
            if (cachedFrame == null) {
                loadMediaFrame();
            }
            
            if (cachedFrame == null) {
                return null;
            }
            
            // Get preview size from camera
            Camera.Parameters params = camera.getParameters();
            Camera.Size previewSize = params.getPreviewSize();
            
            Bitmap processedFrame = processFrame(cachedFrame, previewSize.width, previewSize.height);
            byte[] yuvData = convertBitmapToYuv(processedFrame, previewSize.width, previewSize.height);
            
            if (processedFrame != cachedFrame) {
                processedFrame.recycle();
            }
            
            return yuvData;
        } catch (Exception e) {
            log("YUV frame generation error: " + e.getMessage());
            return null;
        }
    }

    /**
     * Draw virtual frame onto canvas (for SurfaceView/TextureView)
     */
    private void drawVirtualFrame(Canvas canvas) {
        try {
            if (cachedFrame == null) {
                loadMediaFrame();
            }
            
            if (cachedFrame == null) {
                return;
            }
            
            int canvasWidth = canvas.getWidth();
            int canvasHeight = canvas.getHeight();
            
            Bitmap processedFrame = processFrame(cachedFrame, canvasWidth, canvasHeight);
            canvas.drawBitmap(processedFrame, 0, 0, null);
            
            if (processedFrame != cachedFrame) {
                processedFrame.recycle();
            }
        } catch (Exception e) {
            log("Canvas draw error: " + e.getMessage());
        }
    }

    /**
     * Load media frame from file (image or video)
     */
    private void loadMediaFrame() {
        try {
            if (mediaSourcePath == null || mediaSourcePath.isEmpty()) {
                log("No media source path configured");
                return;
            }

            File mediaFile = new File(mediaSourcePath);
            if (!mediaFile.exists()) {
                log("Media file not found: " + mediaSourcePath);
                return;
            }

            // Check if it's a video or image
            String path = mediaSourcePath.toLowerCase();
            if (path.endsWith(".mp4") || path.endsWith(".avi") || path.endsWith(".mov") || path.endsWith(".mkv")) {
                loadVideoFrame();
            } else if (path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".png") || path.endsWith(".webp")) {
                loadImageFrame();
            } else {
                log("Unsupported media format: " + mediaSourcePath);
            }

            if (cachedFrame != null) {
                log("Media frame loaded successfully: " + cachedFrame.getWidth() + "x" + cachedFrame.getHeight());
            } else {
                log("Failed to load media frame");
            }
        } catch (Exception e) {
            log("Failed to load media frame: " + e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * Load frame from video file
     */
    private void loadVideoFrame() {
        try {
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            retriever.setDataSource(mediaSourcePath);
            cachedFrame = retriever.getFrameAtTime(0);
            retriever.release();
        } catch (Exception e) {
            log("Video frame extraction failed: " + e.getMessage());
        }
    }

    /**
     * Load image file
     */
    private void loadImageFrame() {
        try {
            cachedFrame = BitmapFactory.decodeFile(mediaSourcePath);
        } catch (Exception e) {
            log("Image loading failed: " + e.getMessage());
        }
    }

    /**
     * Process frame with transformations (scale, offset, rotation, mirror)
     */
    private Bitmap processFrame(Bitmap source, int targetWidth, int targetHeight) {
        try {
            Matrix matrix = new Matrix();
            
            // Calculate scale to fit target dimensions
            float sourceWidth = source.getWidth();
            float sourceHeight = source.getHeight();
            float scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
            
            // Apply user-defined scale
            scale *= scaleX;
            
            // Apply transformations
            matrix.postScale(scale * (mirrored ? -1 : 1), scale * scaleY);
            
            if (rotation != 0) {
                matrix.postRotate(rotation);
            }
            
            // Apply offset
            matrix.postTranslate(offsetX * targetWidth, offsetY * targetHeight);
            
            // Create transformed bitmap
            Bitmap transformed = Bitmap.createBitmap(
                targetWidth,
                targetHeight,
                Bitmap.Config.ARGB_8888
            );
            
            Canvas canvas = new Canvas(transformed);
            canvas.drawBitmap(source, matrix, null);
            
            return transformed;
        } catch (Exception e) {
            log("Frame processing error: " + e.getMessage());
            return Bitmap.createScaledBitmap(source, targetWidth, targetHeight, true);
        }
    }

    /**
     * Convert bitmap to YUV420 format
     */
    private byte[] convertBitmapToYuv(Bitmap bitmap, int width, int height) {
        try {
            int[] argb = new int[width * height];
            bitmap.getPixels(argb, 0, width, 0, 0, width, height);
            
            byte[] yuv = new byte[width * height * 3 / 2];
            encodeYUV420SP(yuv, argb, width, height);
            
            return yuv;
        } catch (Exception e) {
            log("YUV conversion failed: " + e.getMessage());
            return null;
        }
    }

    /**
     * Encode ARGB to YUV420SP (NV21)
     */
    private void encodeYUV420SP(byte[] yuv420sp, int[] argb, int width, int height) {
        final int frameSize = width * height;
        int yIndex = 0;
        int uvIndex = frameSize;
        
        int R, G, B, Y, U, V;
        int index = 0;
        for (int j = 0; j < height; j++) {
            for (int i = 0; i < width; i++) {
                R = (argb[index] & 0xff0000) >> 16;
                G = (argb[index] & 0xff00) >> 8;
                B = (argb[index] & 0xff);
                
                // RGB to YUV conversion
                Y = ((66 * R + 129 * G + 25 * B + 128) >> 8) + 16;
                U = ((-38 * R - 74 * G + 112 * B + 128) >> 8) + 128;
                V = ((112 * R - 94 * G - 18 * B + 128) >> 8) + 128;
                
                yuv420sp[yIndex++] = (byte) ((Y < 0) ? 0 : ((Y > 255) ? 255 : Y));
                
                if (j % 2 == 0 && index % 2 == 0) {
                    yuv420sp[uvIndex++] = (byte) ((V < 0) ? 0 : ((V > 255) ? 255 : V));
                    yuv420sp[uvIndex++] = (byte) ((U < 0) ? 0 : ((U > 255) ? 255 : U));
                }
                
                index++;
            }
        }
    }
}
