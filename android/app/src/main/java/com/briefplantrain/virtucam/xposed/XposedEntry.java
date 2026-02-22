package com.briefplantrain.virtucam.xposed;

import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.OutputConfiguration;
import android.hardware.camera2.params.SessionConfiguration;
import android.os.Build;
import android.os.Handler;
import android.view.Surface;

import com.briefplantrain.virtucam.engine.SurfaceInfo;
import com.briefplantrain.virtucam.engine.VirtualCameraEngine;
import com.briefplantrain.virtucam.util.LogUtil;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.IXposedHookZygoteInit;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage;

public final class XposedEntry implements IXposedHookLoadPackage, IXposedHookZygoteInit {

    private static final String TAG = "VirtuCam/XposedEntry";

    private static final Set<String> INSTALLED = ConcurrentHashMap.newKeySet();

    @Override
    public void initZygote(StartupParam startupParam) {
        // No-op for now; keep for future modulePath needs.
    }

    @Override
    public void handleLoadPackage(XC_LoadPackage.LoadPackageParam lpparam) {
        if ("com.briefplantrain.virtucam".equals(lpparam.packageName)) return;

        final String key = lpparam.processName != null ? lpparam.processName : lpparam.packageName;
        if (!INSTALLED.add(key)) return;

        LogUtil.d(TAG, "Loaded into: pkg=" + lpparam.packageName + " proc=" + lpparam.processName);

        final VirtualCameraEngine engine = VirtualCameraEngine.getOrCreate(lpparam.packageName, lpparam.processName);
        engine.start();

        installSurfaceTrackingHooks(engine);
        installCamera2SessionHooks(engine);
        installCaptureRequestHooks(engine);
    }

    private static void installSurfaceTrackingHooks(final VirtualCameraEngine engine) {
        try {
            XposedHelpers.findAndHookConstructor(
                    Surface.class,
                    SurfaceTexture.class,
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            Surface s = (Surface) param.thisObject;
                            SurfaceTexture st = (SurfaceTexture) param.args[0];
                            engine.onSurfaceCreatedFromSurfaceTexture(s, st);
                        }
                    }
            );

            XposedHelpers.findAndHookMethod(
                    SurfaceTexture.class,
                    "setDefaultBufferSize",
                    int.class,
                    int.class,
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            SurfaceTexture st = (SurfaceTexture) param.thisObject;
                            int w = (Integer) param.args[0];
                            int h = (Integer) param.args[1];
                            engine.onSurfaceTextureBufferSize(st, w, h);
                        }
                    }
            );

            LogUtil.d(TAG, "Surface tracking hooks installed");
        } catch (Throwable t) {
            LogUtil.e(TAG, "Surface tracking hooks failed", t);
        }
    }

    private static void installCamera2SessionHooks(final VirtualCameraEngine engine) {
        try {
            Class<?> cameraDeviceImpl = XposedHelpers.findClassIfExists(
                    "android.hardware.camera2.impl.CameraDeviceImpl",
                    null
            );
            if (cameraDeviceImpl == null) {
                LogUtil.d(TAG, "CameraDeviceImpl not found; Camera2 session hook skipped");
                return;
            }

            XposedHelpers.findAndHookMethod(
                    cameraDeviceImpl,
                    "createCaptureSession",
                    List.class,
                    CameraCaptureSession.StateCallback.class,
                    Handler.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            Object arg0 = param.args[0];
                            if (!(arg0 instanceof List)) return;
                            @SuppressWarnings("unchecked")
                            List<Object> in = (List<Object>) arg0;
                            if (in.isEmpty()) return;

                            param.args[0] = mapSurfaceList(engine, in);
                        }
                    }
            );
            LogUtil.d(TAG, "Hooked Camera2 createCaptureSession(List<Surface>, ...) overload");

            XposedHelpers.findAndHookMethod(
                    cameraDeviceImpl,
                    "createCaptureSessionByOutputConfigurations",
                    List.class,
                    CameraCaptureSession.StateCallback.class,
                    Handler.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            Object arg0 = param.args[0];
                            if (!(arg0 instanceof List)) return;

                            @SuppressWarnings("unchecked")
                            List<Object> in = (List<Object>) arg0;
                            if (in.isEmpty()) return;

                            int replaced = 0;
                            for (Object item : in) {
                                if (!(item instanceof OutputConfiguration)) continue;
                                OutputConfiguration oc = (OutputConfiguration) item;
                                Surface original = oc.getSurface();
                                if (original == null) continue;

                                SurfaceInfo info = engine.inferSurfaceInfo(original);
                                Surface mapped = engine.mapOutputSurface(original, info);
                                if (mapped != original) {
                                    replaced++;
                                    try {
                                        oc.setSurface(mapped);
                                    } catch (Throwable t) {
                                        LogUtil.e(TAG, "Failed to set mapped surface on OutputConfiguration", t);
                                    }
                                }
                            }
                            LogUtil.d(TAG, "createCaptureSessionByOutputConfigurations mapped=" + replaced + " outputs");
                        }
                    }
            );
            LogUtil.d(TAG, "Hooked Camera2 createCaptureSessionByOutputConfigurations(...) overload");

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                XposedHelpers.findAndHookMethod(
                        cameraDeviceImpl,
                        "createCaptureSession",
                        SessionConfiguration.class,
                        new XC_MethodHook() {
                            @Override
                            protected void beforeHookedMethod(MethodHookParam param) {
                                Object arg0 = param.args[0];
                                if (!(arg0 instanceof SessionConfiguration)) return;
                                SessionConfiguration sc = (SessionConfiguration) arg0;
                                List<OutputConfiguration> outputs = sc.getOutputConfigurations();
                                if (outputs == null || outputs.isEmpty()) return;

                                int replaced = 0;
                                for (OutputConfiguration oc : outputs) {
                                    if (oc == null) continue;
                                    Surface original = oc.getSurface();
                                    if (original == null) continue;

                                    SurfaceInfo info = engine.inferSurfaceInfo(original);
                                    Surface mapped = engine.mapOutputSurface(original, info);
                                    if (mapped != original) {
                                        replaced++;
                                        try {
                                            oc.setSurface(mapped);
                                        } catch (Throwable t) {
                                            LogUtil.e(TAG, "Failed to set mapped surface in SessionConfiguration", t);
                                        }
                                    }
                                }
                                LogUtil.d(TAG, "createCaptureSession(SessionConfiguration) mapped=" + replaced + " outputs");
                            }
                        }
                );
                LogUtil.d(TAG, "Hooked Camera2 createCaptureSession(SessionConfiguration) overload");
            }

            LogUtil.d(TAG, "Camera2 session hooks installed");
        } catch (Throwable t) {
            LogUtil.e(TAG, "Camera2 session hooks failed", t);
        }
    }

    private static List<Object> mapSurfaceList(VirtualCameraEngine engine, List<Object> in) {
        List<Object> out = new ArrayList<>(in.size());
        int replaced = 0;
        for (Object o : in) {
            if (o instanceof Surface) {
                Surface original = (Surface) o;
                SurfaceInfo info = engine.inferSurfaceInfo(original);
                Surface mapped = engine.mapOutputSurface(original, info);
                if (mapped != original) replaced++;
                out.add(mapped);
            } else {
                out.add(o);
            }
        }
        LogUtil.d(TAG, "createCaptureSession(List<Surface>) mapped=" + replaced + " outputs");
        return out;
    }

    private static void installCaptureRequestHooks(final VirtualCameraEngine engine) {
        try {
            XposedHelpers.findAndHookMethod(
                    CaptureRequest.Builder.class,
                    "addTarget",
                    Surface.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            Surface s = (Surface) param.args[0];
                            Surface mapped = engine.mapRequestTargetSurface(s);
                            if (mapped != s) param.args[0] = mapped;
                        }
                    }
            );

            XposedHelpers.findAndHookMethod(
                    CaptureRequest.Builder.class,
                    "removeTarget",
                    Surface.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            Surface s = (Surface) param.args[0];
                            Surface mapped = engine.mapRequestTargetSurface(s);
                            if (mapped != s) param.args[0] = mapped;
                        }
                    }
            );

            LogUtil.d(TAG, "CaptureRequest hooks installed");
        } catch (Throwable t) {
            LogUtil.e(TAG, "CaptureRequest hooks failed", t);
        }
    }
}
