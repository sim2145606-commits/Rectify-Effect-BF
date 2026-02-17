package com.briefplantrain.virtucam.hooks;

import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage.LoadPackageParam;

/**
 * Hook strategy for apps using AndroidX CameraX library.
 * CameraX wraps Camera2 but uses its own class hierarchy:
 * - androidx.camera.core.ImageCapture
 * - androidx.camera.core.Preview
 * - androidx.camera.core.ImageAnalysis
 * - androidx.camera.lifecycle.ProcessCameraProvider
 */
public class CameraXHookStrategy {

    private static final String TAG = "VirtuCam-CameraX";

    /**
     * Apply CameraX hooks to the loaded package.
     * Called alongside generic Camera2 hooks.
     */
    public static void applyIfAvailable(LoadPackageParam lpparam) {
        try {
            // Check if CameraX classes exist in this app
            Class<?> processCameraProvider = XposedHelpers.findClassIfExists(
                "androidx.camera.lifecycle.ProcessCameraProvider",
                lpparam.classLoader
            );

            if (processCameraProvider == null) {
                return; // App doesn't use CameraX
            }

            XposedBridge.log(TAG + ": CameraX detected in " + lpparam.packageName);

            // Hook ProcessCameraProvider.bindToLifecycle
            hookBindToLifecycle(lpparam);

            // Hook Preview.SurfaceProvider
            hookPreviewSurfaceProvider(lpparam);

            // Hook ImageCapture.takePicture
            hookImageCapture(lpparam);

            // Hook ImageAnalysis.Analyzer
            hookImageAnalysis(lpparam);

        } catch (Throwable t) {
            XposedBridge.log(TAG + ": CameraX hook setup failed: " + t.getMessage());
        }
    }

    private static void hookBindToLifecycle(LoadPackageParam lpparam) {
        try {
            Class<?> clazz = XposedHelpers.findClass(
                "androidx.camera.lifecycle.ProcessCameraProvider",
                lpparam.classLoader
            );

            XposedBridge.hookAllMethods(clazz, "bindToLifecycle", new XC_MethodHook() {
                @Override
                protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                    XposedBridge.log(TAG + ": bindToLifecycle intercepted with " +
                        param.args.length + " use cases");
                    // TODO: Intercept and modify use cases to inject virtual camera
                }
            });

            XposedBridge.log(TAG + ": Hooked ProcessCameraProvider.bindToLifecycle");
        } catch (Throwable t) {
            XposedBridge.log(TAG + ": bindToLifecycle hook failed: " + t.getMessage());
        }
    }

    private static void hookPreviewSurfaceProvider(LoadPackageParam lpparam) {
        try {
            Class<?> previewClass = XposedHelpers.findClassIfExists(
                "androidx.camera.core.Preview",
                lpparam.classLoader
            );

            if (previewClass != null) {
                XposedBridge.hookAllMethods(previewClass, "setSurfaceProvider",
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                            XposedBridge.log(TAG + ": Preview.setSurfaceProvider intercepted");
                            // TODO: Wrap the SurfaceProvider to inject virtual frames
                        }
                    }
                );
                XposedBridge.log(TAG + ": Hooked Preview.setSurfaceProvider");
            }
        } catch (Throwable t) {
            XposedBridge.log(TAG + ": Preview hook failed: " + t.getMessage());
        }
    }

    private static void hookImageCapture(LoadPackageParam lpparam) {
        try {
            Class<?> imageCaptureClass = XposedHelpers.findClassIfExists(
                "androidx.camera.core.ImageCapture",
                lpparam.classLoader
            );

            if (imageCaptureClass != null) {
                XposedBridge.hookAllMethods(imageCaptureClass, "takePicture",
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                            XposedBridge.log(TAG + ": ImageCapture.takePicture intercepted");
                            // TODO: Replace captured image with virtual camera frame
                        }
                    }
                );
                XposedBridge.log(TAG + ": Hooked ImageCapture.takePicture");
            }
        } catch (Throwable t) {
            XposedBridge.log(TAG + ": ImageCapture hook failed: " + t.getMessage());
        }
    }

    private static void hookImageAnalysis(LoadPackageParam lpparam) {
        try {
            Class<?> imageAnalysisClass = XposedHelpers.findClassIfExists(
                "androidx.camera.core.ImageAnalysis",
                lpparam.classLoader
            );

            if (imageAnalysisClass != null) {
                XposedBridge.hookAllMethods(imageAnalysisClass, "setAnalyzer",
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                            XposedBridge.log(TAG + ": ImageAnalysis.setAnalyzer intercepted");
                            // TODO: Wrap the Analyzer to provide virtual frames
                        }
                    }
                );
                XposedBridge.log(TAG + ": Hooked ImageAnalysis.setAnalyzer");
            }
        } catch (Throwable t) {
            XposedBridge.log(TAG + ": ImageAnalysis hook failed: " + t.getMessage());
        }
    }
}
