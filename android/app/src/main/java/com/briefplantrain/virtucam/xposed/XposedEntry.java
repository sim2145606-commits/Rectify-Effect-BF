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
import com.briefplantrain.virtucam.hooks.HookStrategyRegistry;
import com.briefplantrain.virtucam.hooks.IHookStrategy;
import com.briefplantrain.virtucam.util.LogUtil;
import com.briefplantrain.virtucam.util.VirtuCamIPC;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.IXposedHookZygoteInit;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage;

public final class XposedEntry implements IXposedHookLoadPackage, IXposedHookZygoteInit {

    private static final String TAG = "VirtuCam/XposedEntry";

    private static final Set<String> INSTALLED = ConcurrentHashMap.newKeySet();
    private static final Set<String> SKIP_ENGINE_PACKAGES = ConcurrentHashMap.newKeySet();

    static {
        SKIP_ENGINE_PACKAGES.add("com.briefplantrain.virtucam");
        SKIP_ENGINE_PACKAGES.add("android");
        SKIP_ENGINE_PACKAGES.add("system");
        SKIP_ENGINE_PACKAGES.add("com.android.systemui");
    }

    @Override
    public void initZygote(StartupParam startupParam) {
        LogUtil.setVerboseLogging(isVerboseGateEnabled());
        LogUtil.d(TAG, "initZygote: preparing framework hooks");
        try {
            installZygoteSurfaceHooks();
        } catch (Throwable t) {
            XposedBridge.log(TAG + ": initZygote hook install failed: " + t.getMessage());
        }
    }

    @Override
    public void handleLoadPackage(XC_LoadPackage.LoadPackageParam lpparam) {
        LogUtil.setVerboseLogging(isVerboseGateEnabled());
        if (SKIP_ENGINE_PACKAGES.contains(lpparam.packageName)) {
            if ("android".equals(lpparam.packageName)) {
                try {
                    installCamera2SessionHooksInProcess(lpparam.classLoader, null);
                } catch (Throwable t) {
                    XposedBridge.log(TAG + ": android framework hook failed: " + t.getMessage());
                }
            }
            return;
        }

        final String key = lpparam.processName != null ? lpparam.processName : lpparam.packageName;
        if (!INSTALLED.add(key)) return;

        LogUtil.d(TAG, "handleLoadPackage: pkg=" + lpparam.packageName + " proc=" + lpparam.processName);

        VirtualCameraEngine engine = null;
        try {
            engine = VirtualCameraEngine.getOrCreate(lpparam.packageName, lpparam.processName);
            engine.start();
        } catch (Throwable t) {
            XposedBridge.log(TAG + ": VirtualCameraEngine init failed for " + lpparam.packageName + ": " + t.getMessage());
        }

        final VirtualCameraEngine finalEngine = engine;
        if (finalEngine != null) {
            installPerProcessHooks(lpparam.classLoader, finalEngine);
        }

        try {
            HookStrategyRegistry registry = HookStrategyRegistry.getInstance();
            IHookStrategy strategy = registry.getStrategy(lpparam.packageName);
            if (strategy != null) {
                LogUtil.d(TAG, "Applying specialized strategy: " + strategy.getStrategyName()
                        + " for " + lpparam.packageName);
                strategy.install(lpparam, finalEngine);
            }
        } catch (Throwable t) {
            XposedBridge.log(TAG + ": HookStrategyRegistry failed for " + lpparam.packageName + ": " + t.getMessage());
        }

        LogUtil.always(TAG, "module active in process: " + key);
        // Write module active state to IPC dir (companion-managed, SELinux-safe)
        try {
            VirtuCamIPC.writeModuleActiveMarker();
        } catch (Throwable t) {
            LogUtil.w(TAG, "Failed to write module active marker", t);
        }
    }

    private static void installZygoteSurfaceHooks() {
        // Quiet profile: avoid global per-frame hooks in zygote.
        LogUtil.d(TAG, "Zygote hot-path logging hooks disabled");
    }

    private static void installPerProcessHooks(ClassLoader classLoader, VirtualCameraEngine engine) {
        installSurfaceTrackingHooks(classLoader, engine);
        installCamera2SessionHooksInProcess(classLoader, engine);
        installCaptureRequestHooks(engine);
    }

    private static void installSurfaceTrackingHooks(ClassLoader classLoader, final VirtualCameraEngine engine) {
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

    private static void installCamera2SessionHooksInProcess(ClassLoader classLoader, final VirtualCameraEngine engine) {
        try {
            Class<?> cameraDeviceImpl = XposedHelpers.findClassIfExists(
                    "android.hardware.camera2.impl.CameraDeviceImpl",
                    classLoader
            );
            if (cameraDeviceImpl == null) {
                cameraDeviceImpl = XposedHelpers.findClassIfExists(
                        "android.hardware.camera2.impl.CameraDeviceImpl",
                        null
                );
            }
            if (cameraDeviceImpl == null) {
                LogUtil.d(TAG, "CameraDeviceImpl not found in this process; Camera2 session hook skipped");
                return;
            }

            final Class<?> finalCameraDeviceImpl = cameraDeviceImpl;

            XposedHelpers.findAndHookMethod(
                    finalCameraDeviceImpl,
                    "createCaptureSession",
                    List.class,
                    CameraCaptureSession.StateCallback.class,
                    Handler.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (engine == null) return;
                            Object arg0 = param.args[0];
                            if (!(arg0 instanceof List)) return;
                            @SuppressWarnings("unchecked")
                            List<Object> in = (List<Object>) arg0;
                            if (in.isEmpty()) return;
                            param.args[0] = mapSurfaceList(engine, in);
                        }
                    }
            );

            XposedHelpers.findAndHookMethod(
                    finalCameraDeviceImpl,
                    "createCaptureSessionByOutputConfigurations",
                    List.class,
                    CameraCaptureSession.StateCallback.class,
                    Handler.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (engine == null) return;
                            Object arg0 = param.args[0];
                            if (!(arg0 instanceof List)) return;
                            @SuppressWarnings("unchecked")
                            List<Object> in = (List<Object>) arg0;
                            if (in.isEmpty()) return;
                            int replaced = 0;
                            for (Object item : in) {
                                if (!(item instanceof OutputConfiguration)) continue;
                                if (tryMapOutputConfigurationSurface(engine, (OutputConfiguration) item,
                                        "createCaptureSessionByOutputConfigurations")) replaced++;
                            }
                            logMappingSummary(
                                    engine,
                                    "createCaptureSessionByOutputConfigurations",
                                    replaced
                            );
                        }
                    }
            );

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                XposedHelpers.findAndHookMethod(
                        finalCameraDeviceImpl,
                        "createCaptureSession",
                        SessionConfiguration.class,
                        new XC_MethodHook() {
                            @Override
                            protected void beforeHookedMethod(MethodHookParam param) {
                                if (engine == null) return;
                                Object arg0 = param.args[0];
                                if (!(arg0 instanceof SessionConfiguration)) return;
                                SessionConfiguration sc = (SessionConfiguration) arg0;
                                List<OutputConfiguration> outputs = sc.getOutputConfigurations();
                                if (outputs == null || outputs.isEmpty()) return;
                                int replaced = 0;
                                for (OutputConfiguration oc : outputs) {
                                    if (tryMapOutputConfigurationSurface(engine, oc,
                                            "createCaptureSession(SessionConfiguration)")) replaced++;
                                }
                                logMappingSummary(
                                        engine,
                                        "createCaptureSession(SessionConfiguration)",
                                        replaced
                                );
                            }
                        }
                );
            }

            LogUtil.d(TAG, "Camera2 session hooks installed");
        } catch (Throwable t) {
            LogUtil.e(TAG, "Camera2 session hooks failed", t);
        }
    }


    private static boolean tryMapOutputConfigurationSurface(
            VirtualCameraEngine engine, OutputConfiguration oc, String hookName) {
        if (oc == null) return false;
        Surface original = oc.getSurface();
        if (original == null) return false;
        SurfaceInfo info = engine.inferSurfaceInfo(original);
        Surface mapped = engine.mapOutputSurface(original, info);
        if (mapped == original) return false;
        try {
            XposedHelpers.callMethod(oc, "setSurface", mapped);
            return true;
        } catch (Throwable t) {
            engine.rollbackOutputSurfaceMapping(original);
            LogUtil.e(TAG, hookName + ": failed to set mapped surface; rolled back", t);
            return false;
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
        logMappingSummary(engine, "createCaptureSession(List<Surface>)", replaced);
        return out;
    }

    private static void logMappingSummary(VirtualCameraEngine engine, String hookName, int replaced) {
        if (replaced > 0) {
            LogUtil.iRateLimited(
                    "mapping-positive:" + hookName,
                    1500L,
                    TAG,
                    hookName + " mapped=" + replaced
            );
            return;
        }
        logZeroMapping(engine, hookName);
    }

    private static void logZeroMapping(VirtualCameraEngine engine, String hookName) {
        if (engine == null) return;
        try {
            LogUtil.iRateLimited(
                    "mapping-zero:" + hookName,
                    5000L,
                    TAG,
                    hookName + " mapped=0 reason={" + engine.getRoutingDebugSummary() + "}"
            );
        } catch (Throwable t) {
            LogUtil.iRateLimited(
                    "mapping-zero-unavailable:" + hookName,
                    5000L,
                    TAG,
                    hookName + " mapped=0 reason={summary_unavailable:" + t.getClass().getSimpleName() + "}"
            );
        }
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

    private static boolean isVerboseGateEnabled() {
        try {
            return new File("/data/local/tmp/virtucam_verbose_logging").exists();
        } catch (Throwable ignored) {
            return false;
        }
    }
}
