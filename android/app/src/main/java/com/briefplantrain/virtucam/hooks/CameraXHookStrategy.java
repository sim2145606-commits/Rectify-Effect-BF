package com.briefplantrain.virtucam.hooks;

import android.view.Surface;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.concurrent.Executor;

import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage.LoadPackageParam;

/**
 * Hook strategy for apps using AndroidX CameraX library.
 * CameraX wraps Camera2 but uses its own class hierarchy.
 * 
 * IMPLEMENTATION NOTE:
 * CameraX eventually calls standard Camera2 APIs under the hood.
 * This strategy intercepts the CameraX-specific SurfaceProvider layer,
 * but the actual surface replacement happens in the generic CameraHook.java
 * when CameraX calls camera2.createCaptureSession.
 */
public class CameraXHookStrategy {

    private static final String TAG = "VirtuCam-CameraX";

    /**
     * Apply CameraX hooks if the library is available in the target app.
     */
    public static void applyIfAvailable(LoadPackageParam lpparam) {
        try {
            // Check if CameraX classes exist
            Class<?> processCameraProvider = XposedHelpers.findClassIfExists(
                "androidx.camera.lifecycle.ProcessCameraProvider",
                lpparam.classLoader
            );

            if (processCameraProvider == null) {
                return; // App doesn't use CameraX
            }

            XposedBridge.log(TAG + ": CameraX detected in " + lpparam.packageName);
            
            // 1. Hook Preview.setSurfaceProvider to intercept the preview stream
            hookPreviewSurfaceProvider(lpparam);
            
            // 2. Hook ImageCapture (if you want to affect photos taken by CameraX)
            // Note: Many apps use CameraX for preview but generic Camera2 for capture, 
            // so this acts as a fallback.
            hookImageCapture(lpparam);

        } catch (Throwable t) {
            XposedBridge.log(TAG + ": CameraX hook setup failed: " + t);
        }
    }

    /**
     * Hook Preview.setSurfaceProvider to intercept CameraX preview streams.
     * This wraps the app's SurfaceProvider to log when surfaces are requested.
     * The actual surface replacement happens in CameraHook.java's generic hooks.
     */
    private static void hookPreviewSurfaceProvider(LoadPackageParam lpparam) {
        try {
            Class<?> previewClass = XposedHelpers.findClassIfExists(
                "androidx.camera.core.Preview",
                lpparam.classLoader
            );
            
            if (previewClass == null) return;

            // Hook setSurfaceProvider(Executor, SurfaceProvider)
            XposedHelpers.findAndHookMethod(previewClass, "setSurfaceProvider",
                Executor.class,
                "androidx.camera.core.Preview$SurfaceProvider",
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                        Object originalProvider = param.args[1];
                        if (originalProvider == null) return;

                        // Create a proxy to intercept onSurfaceRequested
                        Object wrappedProvider = createWrappedSurfaceProvider(
                            originalProvider, lpparam.classLoader);
                            
                        if (wrappedProvider != null) {
                            param.args[1] = wrappedProvider;
                            XposedBridge.log(TAG + ": Wrapped SurfaceProvider successfully");
                        }
                    }
                }
            );
            
            // Also hook the overload setSurfaceProvider(SurfaceProvider)
            XposedHelpers.findAndHookMethod(previewClass, "setSurfaceProvider",
                "androidx.camera.core.Preview$SurfaceProvider",
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                        Object originalProvider = param.args[0];
                        if (originalProvider == null) return;

                        Object wrappedProvider = createWrappedSurfaceProvider(
                            originalProvider, lpparam.classLoader);
                            
                        if (wrappedProvider != null) {
                            param.args[0] = wrappedProvider;
                        }
                    }
                }
            );

            XposedBridge.log(TAG + ": Hooked Preview.setSurfaceProvider");
        } catch (Throwable t) {
            XposedBridge.log(TAG + ": Preview hook failed: " + t);
        }
    }

    /**
     * Create a proxy SurfaceProvider that wraps the original.
     * This allows us to intercept onSurfaceRequested calls.
     */
    private static Object createWrappedSurfaceProvider(final Object originalProvider, 
                                                     final ClassLoader classLoader) {
        try {
            Class<?> providerInterface = XposedHelpers.findClass(
                "androidx.camera.core.Preview$SurfaceProvider", classLoader);
            
            return Proxy.newProxyInstance(classLoader, new Class<?>[]{providerInterface}, 
                new InvocationHandler() {
                    @Override
                    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
                        if ("onSurfaceRequested".equals(method.getName()) && args.length > 0) {
                            // Arg 0 is SurfaceRequest
                            Object surfaceRequest = args[0];
                            handleSurfaceRequest(surfaceRequest, classLoader);
                        }
                        try {
                            return method.invoke(originalProvider, args);
                        } catch (java.lang.reflect.InvocationTargetException e) {
                            Throwable cause = e.getCause();
                            XposedBridge.log(TAG + ": SurfaceProvider invocation failed: " + (cause != null ? cause : e));
                            throw cause != null ? cause : e;
                        }
                    }
                });
        } catch (ClassNotFoundException | IllegalArgumentException e) {
            XposedBridge.log(TAG + ": Failed to create wrapped provider: " + e.getMessage());
            return null;
        }
    }

    /**
     * Handle CameraX SurfaceRequest.
     * 
     * IMPORTANT: CameraX's SurfaceRequest is final and we cannot easily replace 
     * the surface inside it. However, CameraX uses the surface provided by the 
     * app (View/SurfaceView), and eventually calls camera2.createCaptureSession.
     * 
     * Our generic CameraHook.java hooks will intercept that call and swap the 
     * surface there. This method just logs to confirm CameraX is active.
     */
    private static void handleSurfaceRequest(Object surfaceRequest, ClassLoader classLoader) {
        try {
            // CameraX eventually calls camera2.createCaptureSession under the hood.
            // Our Main Generic Hook in CameraHook.java will kick in and swap the surface there.
            // So for 90% of cases, we just need to log here to confirm it's working.
            XposedBridge.log(TAG + ": Intercepted onSurfaceRequested - " +
                "surface replacement will happen in generic Camera2 hooks");
            
        } catch (Exception e) {
            XposedBridge.log(TAG + ": Error handling surface request: " + e.getClass().getSimpleName());
        }
    }

    /**
     * Hook ImageCapture for photo capture.
     * Similar to Preview, CameraX eventually calls standard Camera2 APIs for capture.
     * The existing CameraHook.java should handle the underlying ImageReader.
     */
    private static void hookImageCapture(LoadPackageParam lpparam) {
        try {
            Class<?> imageCaptureClass = XposedHelpers.findClassIfExists(
                "androidx.camera.core.ImageCapture",
                lpparam.classLoader
            );

            if (imageCaptureClass != null) {
                XposedHelpers.findAndHookMethod(imageCaptureClass, "takePicture",
                    Executor.class,
                    "androidx.camera.core.ImageCapture$OnImageCapturedCallback",
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                            XposedBridge.log(TAG + ": ImageCapture.takePicture intercepted - " +
                                "image replacement will happen in generic Camera2 hooks");
                        }
                    }
                );
                XposedBridge.log(TAG + ": Hooked ImageCapture.takePicture");
            }
        } catch (Throwable t) {
            XposedBridge.log(TAG + ": ImageCapture hook failed: " + t);
        }
    }
}
