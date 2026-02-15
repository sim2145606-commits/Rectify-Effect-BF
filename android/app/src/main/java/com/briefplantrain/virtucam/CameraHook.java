package com.briefplantrain.virtucam;

import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage.LoadPackageParam;

public class CameraHook implements IXposedHookLoadPackage {
    public void handleLoadPackage(final LoadPackageParam lpparam) throws Throwable {
        // Log that the app is loaded
        XposedBridge.log("VirtuCam loaded for package: " + lpparam.packageName);

        // Hook for the older Camera API
        try {
            XposedHelpers.findAndHookMethod(
                "android.hardware.Camera", 
                lpparam.classLoader, 
                "open", 
                int.class, 
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                        XposedBridge.log("VirtuCam: Hooked Camera.open(). Camera ID: " + param.args[0]);
                        // Here you could replace the camera, or modify parameters.
                        // For now, we just log.
                    }

                    @Override
                    protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                        XposedBridge.log("VirtuCam: Camera.open() executed. Result: " + param.getResult());
                    }
                }
            );
            XposedBridge.log("VirtuCam: Successfully hooked Camera.open()");
        } catch (XposedHelpers.ClassNotFoundError | NoSuchMethodError e) {
            XposedBridge.log("VirtuCam: Could not find Camera.open() to hook: " + e.getMessage());
        }

        // Hook for the newer Camera2 API
        try {
            XposedHelpers.findAndHookMethod(
                "android.hardware.camera2.CameraManager", 
                lpparam.classLoader, 
                "openCamera", 
                String.class, 
                android.hardware.camera2.CameraDevice.StateCallback.class, 
                android.os.Handler.class, 
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                        XposedBridge.log("VirtuCam: Hooked CameraManager.openCamera(). Camera ID: " + param.args[0]);
                        // Here you could modify parameters, e.g., redirect to a virtual camera.
                    }

                    @Override
                    protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                        XposedBridge.log("VirtuCam: CameraManager.openCamera() executed.");
                    }
                }
            );
            XposedBridge.log("VirtuCam: Successfully hooked CameraManager.openCamera()");
        } catch (XposedHelpers.ClassNotFoundError | NoSuchMethodError e) {
            XposedBridge.log("VirtuCam: Could not find CameraManager.openCamera() to hook: " + e.getMessage());
        }
    }
}
