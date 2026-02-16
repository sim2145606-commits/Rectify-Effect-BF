package com.briefplantrain.virtucam;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.graphics.YuvImage;
import android.media.Image;
import android.media.MediaMetadataRetriever;
import android.os.Handler;
import android.os.Looper;

import java.io.ByteArrayOutputStream;
import java.io.File;
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

public class CameraHook implements IXposedHookLoadPackage {
    
    private static final String PACKAGE_NAME = "com.briefplantrain.virtucam";
    private static final String PREFS_NAME = "virtucam_config";
    
    private XSharedPreferences prefs;
    private boolean enabled = false;
    private String mediaSourcePath = null;
    private String cameraTarget = "front";
    private boolean mirrored = false;
    private int rotation = 0;
    private String targetMode = "whitelist";
    private Set<String> targetPackages = new HashSet<>();
    
    private Bitmap cachedFrame = null;
    private byte[] cachedYuvData = null;
    private Handler mainHandler;

    @Override
    public void handleLoadPackage(final LoadPackageParam lpparam) throws Throwable {
        // Always log to prove hook is loading
        XposedBridge.log("VirtuCam: hook loaded in " + lpparam.packageName);
        
        // Skip our own app
        if (lpparam.packageName.equals(PACKAGE_NAME)) {
            XposedBridge.log("VirtuCam: skipping own package");
            return;
        }

        // Load preferences and verify readability
        loadPreferences();
        
        // Debug: verify prefs are readable
        if (prefs != null) {
            XposedBridge.log("VirtuCam: prefs readable=" + prefs.getFile().canRead() +
                " enabled=" + enabled +
                " mediaPath=" + (mediaSourcePath != null ? "set" : "null") +
                " targetMode=" + targetMode);
        }
        
        // Check if this app is targeted
        if (!isTargetedApp(lpparam.packageName)) {
            XposedBridge.log("VirtuCam: package not targeted: " + lpparam.packageName);
            return;
        }

        XposedBridge.log("VirtuCam: Hooking package: " + lpparam.packageName + " (enabled=" + enabled + ")");

        // Initialize handler for async operations
        try {
            mainHandler = new Handler(Looper.getMainLooper());
        } catch (Exception e) {
            XposedBridge.log("VirtuCam: Could not create handler: " + e.getMessage());
        }

        // Hook Camera2 API (modern)
        hookCamera2API(lpparam);
        
        // Hook Camera1 API (legacy)
        hookCamera1API(lpparam);
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
            targetMode = prefs.getString("targetMode", "whitelist");
            
            String packagesStr = prefs.getString("targetPackages", "");
            if (!packagesStr.isEmpty()) {
                targetPackages = new HashSet<>(Arrays.asList(packagesStr.split(",")));
            }
            
            XposedBridge.log("VirtuCam: Config loaded - enabled=" + enabled + 
                ", mediaPath=" + mediaSourcePath + 
                ", target=" + cameraTarget +
                ", targetMode=" + targetMode);
        } catch (Exception e) {
            XposedBridge.log("VirtuCam: Failed to load preferences: " + e.getMessage());
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

    private void hookCamera2API(final LoadPackageParam lpparam) {
        try {
            // Hook CameraManager.openCamera to intercept camera opening
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
                        XposedBridge.log("VirtuCam: Camera2 openCamera() - ID: " + cameraId);
                        
                        // Reload preferences to get latest config
                        loadPreferences();
                    }
                }
            );

            // Hook ImageReader.OnImageAvailableListener to replace frames
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
                                XposedBridge.log("VirtuCam: Frame injection failed: " + e.getMessage());
                            }
                        }
                    }
                }
            );

            XposedBridge.log("VirtuCam: Successfully hooked Camera2 API");
        } catch (Exception e) {
            XposedBridge.log("VirtuCam: Failed to hook Camera2 API: " + e.getMessage());
        }
    }

    private void hookCamera1API(final LoadPackageParam lpparam) {
        try {
            // Hook Camera.open()
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
                        XposedBridge.log("VirtuCam: Camera1 open() - ID: " + cameraId);
                        
                        // Reload preferences
                        loadPreferences();
                    }
                }
            );

            // Hook setPreviewCallback to inject frames
            XposedHelpers.findAndHookMethod(
                "android.hardware.Camera",
                lpparam.classLoader,
                "setPreviewCallback",
                "android.hardware.Camera$PreviewCallback",
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                        if (!enabled || mediaSourcePath == null) return;
                        
                        // Wrap the original callback
                        Object originalCallback = param.args[0];
                        if (originalCallback != null) {
                            param.args[0] = createWrappedPreviewCallback(originalCallback, lpparam.classLoader);
                        }
                    }
                }
            );

            XposedBridge.log("VirtuCam: Successfully hooked Camera1 API");
        } catch (Exception e) {
            XposedBridge.log("VirtuCam: Failed to hook Camera1 API: " + e.getMessage());
        }
    }

    private Object createWrappedPreviewCallback(final Object originalCallback, final ClassLoader classLoader) {
        return XposedHelpers.newInstance(
            XposedHelpers.findClass("android.hardware.Camera$PreviewCallback", classLoader),
            new XC_MethodHook() {
                @Override
                protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                    if (enabled && mediaSourcePath != null) {
                        // Replace the byte[] data with our injected frame
                        byte[] injectedData = getInjectedYuvFrame();
                        if (injectedData != null) {
                            param.args[0] = injectedData;
                        }
                    }
                    
                    // Call original callback
                    XposedBridge.invokeOriginalMethod(
                        XposedHelpers.findMethodExact(originalCallback.getClass(), "onPreviewFrame", byte[].class, "android.hardware.Camera"),
                        originalCallback,
                        param.args
                    );
                }
            }
        );
    }

    private void injectFrameIntoImage(Image image) {
        try {
            if (cachedFrame == null) {
                loadMediaFrame();
            }
            
            if (cachedFrame == null) {
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
            
            Bitmap scaledFrame = Bitmap.createScaledBitmap(cachedFrame, width, height, true);
            byte[] yuvData = convertBitmapToYuv(scaledFrame, width, height);
            
            if (yuvData != null && planes[0].getBuffer().capacity() >= yuvData.length) {
                planes[0].getBuffer().put(yuvData);
            }
            
            scaledFrame.recycle();
        } catch (Exception e) {
            XposedBridge.log("VirtuCam: Image injection error: " + e.getMessage());
        }
    }

    private byte[] getInjectedYuvFrame() {
        try {
            if (cachedYuvData == null) {
                loadMediaFrame();
                if (cachedFrame != null) {
                    cachedYuvData = convertBitmapToYuv(cachedFrame, cachedFrame.getWidth(), cachedFrame.getHeight());
                }
            }
            return cachedYuvData;
        } catch (Exception e) {
            XposedBridge.log("VirtuCam: YUV frame generation error: " + e.getMessage());
            return null;
        }
    }

    private void loadMediaFrame() {
        try {
            if (mediaSourcePath == null || mediaSourcePath.isEmpty()) {
                return;
            }

            File mediaFile = new File(mediaSourcePath);
            if (!mediaFile.exists()) {
                XposedBridge.log("VirtuCam: Media file not found: " + mediaSourcePath);
                return;
            }

            // Check if it's a video or image
            String path = mediaSourcePath.toLowerCase();
            if (path.endsWith(".mp4") || path.endsWith(".avi") || path.endsWith(".mov")) {
                loadVideoFrame();
            } else if (path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".png")) {
                loadImageFrame();
            }

            // Apply transformations
            if (cachedFrame != null) {
                cachedFrame = applyTransformations(cachedFrame);
            }

            XposedBridge.log("VirtuCam: Media frame loaded successfully");
        } catch (Exception e) {
            XposedBridge.log("VirtuCam: Failed to load media frame: " + e.getMessage());
        }
    }

    private void loadVideoFrame() {
        try {
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            retriever.setDataSource(mediaSourcePath);
            cachedFrame = retriever.getFrameAtTime(0);
            retriever.release();
        } catch (Exception e) {
            XposedBridge.log("VirtuCam: Video frame extraction failed: " + e.getMessage());
        }
    }

    private void loadImageFrame() {
        try {
            cachedFrame = BitmapFactory.decodeFile(mediaSourcePath);
        } catch (Exception e) {
            XposedBridge.log("VirtuCam: Image loading failed: " + e.getMessage());
        }
    }

    private Bitmap applyTransformations(Bitmap bitmap) {
        Matrix matrix = new Matrix();
        
        // Apply rotation
        if (rotation != 0) {
            matrix.postRotate(rotation);
        }
        
        // Apply mirroring
        if (mirrored) {
            matrix.postScale(-1, 1);
        }
        
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
    }

    private byte[] convertBitmapToYuv(Bitmap bitmap, int width, int height) {
        try {
            int[] argb = new int[width * height];
            bitmap.getPixels(argb, 0, width, 0, 0, width, height);
            
            byte[] yuv = new byte[width * height * 3 / 2];
            encodeYUV420SP(yuv, argb, width, height);
            
            return yuv;
        } catch (Exception e) {
            XposedBridge.log("VirtuCam: YUV conversion failed: " + e.getMessage());
            return null;
        }
    }

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
                
                Y = ((66 * R + 129 * G + 25 * B + 128) >> 8) + 16;
                U = ((-38 * R - 74 * G + 112 * B + 128) >> 8) + 128;
                V = ((112 * R - 94 * G - 18 * B + 128) >> 8) + 128;
                
                yuv420sp[yIndex++] = (byte) ((Y < 0) ? 0 : ((Y > 255) ? 255 : Y));
                
                if (j % 2 == 0 && index % 2 == 0) {
                    yuv420sp[uvIndex++] = (byte) ((U < 0) ? 0 : ((U > 255) ? 255 : U));
                    yuv420sp[uvIndex++] = (byte) ((V < 0) ? 0 : ((V > 255) ? 255 : V));
                }
                
                index++;
            }
        }
    }
}
