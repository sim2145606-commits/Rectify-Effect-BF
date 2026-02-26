package com.briefplantrain.virtucam.xposed;

import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.InputConfiguration;
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
    private static final int MAX_REPLACED_SURFACES_PER_SESSION = 1;

    private static final Set<String> INSTALLED = ConcurrentHashMap.newKeySet();
    private static final Set<String> SKIP_ENGINE_PACKAGES = ConcurrentHashMap.newKeySet();
    private static final Object ROUTE_OP_LOCK = new Object();

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
                            if (engine.isVcamCompatibilityModeEnabled()
                                    && applyVcamCompatTakeoverSurfaceList(
                                    engine,
                                    param,
                                    0,
                                    "createCaptureSession(List<Surface>)")) {
                                return;
                            }
                            if (engine.isVcamCompatibilityModeEnabled()) {
                                LogUtil.iRateLimited(
                                        "vcam_takeover_fallback:createCaptureSession(List<Surface>)",
                                        2000L,
                                        TAG,
                                        "createCaptureSession(List<Surface>) vcam_takeover_fallback: takeover returned false, using remap"
                                );
                            }
                            engine.clearVcamCompatibilityAliases();
                            Object arg0 = param.args[0];
                            if (!(arg0 instanceof List)) return;
                            @SuppressWarnings("unchecked")
                            List<Object> in = (List<Object>) arg0;
                            if (in.isEmpty()) return;
                            param.args[0] = mapSurfaceList(engine, in, "createCaptureSession(List<Surface>)");
                        }
                    }
            );

            XposedHelpers.findAndHookMethod(
                    finalCameraDeviceImpl,
                    "createConstrainedHighSpeedCaptureSession",
                    List.class,
                    CameraCaptureSession.StateCallback.class,
                    Handler.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (engine == null) return;
                            if (engine.isVcamCompatibilityModeEnabled()
                                    && applyVcamCompatTakeoverSurfaceList(
                                    engine,
                                    param,
                                    0,
                                    "createConstrainedHighSpeedCaptureSession")) {
                                return;
                            }
                            if (engine.isVcamCompatibilityModeEnabled()) {
                                LogUtil.iRateLimited(
                                        "vcam_takeover_fallback:createConstrainedHighSpeedCaptureSession",
                                        2000L,
                                        TAG,
                                        "createConstrainedHighSpeedCaptureSession vcam_takeover_fallback: takeover returned false, using remap"
                                );
                            }
                            engine.clearVcamCompatibilityAliases();
                            Object arg0 = param.args[0];
                            if (!(arg0 instanceof List)) return;
                            @SuppressWarnings("unchecked")
                            List<Object> in = (List<Object>) arg0;
                            if (in.isEmpty()) return;
                            param.args[0] = mapSurfaceList(engine, in, "createConstrainedHighSpeedCaptureSession");
                        }
                    }
            );

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                XposedHelpers.findAndHookMethod(
                        finalCameraDeviceImpl,
                        "createReprocessableCaptureSession",
                        InputConfiguration.class,
                        List.class,
                        CameraCaptureSession.StateCallback.class,
                        Handler.class,
                        new XC_MethodHook() {
                            @Override
                            protected void beforeHookedMethod(MethodHookParam param) {
                                if (engine == null) return;
                                if (engine.isVcamCompatibilityModeEnabled()
                                        && applyVcamCompatTakeoverSurfaceList(
                                        engine,
                                        param,
                                        1,
                                        "createReprocessableCaptureSession")) {
                                    return;
                                }
                                if (engine.isVcamCompatibilityModeEnabled()) {
                                    LogUtil.iRateLimited(
                                            "vcam_takeover_fallback:createReprocessableCaptureSession",
                                            2000L,
                                            TAG,
                                            "createReprocessableCaptureSession vcam_takeover_fallback: takeover returned false, using remap"
                                    );
                                }
                                engine.clearVcamCompatibilityAliases();
                                Object arg1 = param.args[1];
                                if (!(arg1 instanceof List)) return;
                                @SuppressWarnings("unchecked")
                                List<Object> in = (List<Object>) arg1;
                                if (in.isEmpty()) return;
                                param.args[1] = mapSurfaceList(engine, in, "createReprocessableCaptureSession");
                            }
                        }
                );
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                XposedHelpers.findAndHookMethod(
                        finalCameraDeviceImpl,
                        "createReprocessableCaptureSessionByConfigurations",
                        InputConfiguration.class,
                        List.class,
                        CameraCaptureSession.StateCallback.class,
                        Handler.class,
                        new XC_MethodHook() {
                            @Override
                            protected void beforeHookedMethod(MethodHookParam param) {
                                if (engine == null) return;
                                if (engine.isVcamCompatibilityModeEnabled()
                                        && applyVcamCompatTakeoverOutputConfigList(
                                        engine,
                                        param,
                                        1,
                                        "createReprocessableCaptureSessionByConfigurations")) {
                                    return;
                                }
                                if (engine.isVcamCompatibilityModeEnabled()) {
                                    LogUtil.iRateLimited(
                                            "vcam_takeover_fallback:createReprocessableCaptureSessionByConfigurations",
                                            2000L,
                                            TAG,
                                            "createReprocessableCaptureSessionByConfigurations vcam_takeover_fallback: takeover returned false, using remap"
                                    );
                                }
                                engine.clearVcamCompatibilityAliases();
                                Object arg1 = param.args[1];
                                if (!(arg1 instanceof List)) return;
                                @SuppressWarnings("unchecked")
                                List<Object> in = (List<Object>) arg1;
                                if (in.isEmpty()) return;

                                List<Object> remapped = new ArrayList<>(in.size());
                                int replaced = 0;
                                int preferredIndex = selectPreferredOutputConfigIndex(engine, in);
                                for (Object item : in) {
                                    if (item instanceof OutputConfiguration) {
                                        int index = remapped.size();
                                        if (index != preferredIndex || replaced >= MAX_REPLACED_SURFACES_PER_SESSION) {
                                            remapped.add(item);
                                            continue;
                                        }
                                        Surface candidate = getSurfaceFromOutputConfig((OutputConfiguration) item);
                                        if (!isEligibleForReplacement(engine, candidate)) {
                                            remapped.add(item);
                                            continue;
                                        }
                                        MappedOutputConfigResult mapped = mapOutputConfiguration(
                                                engine,
                                                (OutputConfiguration) item,
                                                "createReprocessableCaptureSessionByConfigurations"
                                        );
                                        remapped.add(mapped.outputConfig);
                                        replaced += mapped.replacedCount;
                                    } else {
                                        remapped.add(item);
                                    }
                                }
                                param.args[1] = remapped;
                                logMappingSummary(engine, "createReprocessableCaptureSessionByConfigurations", replaced);
                            }
                        }
                );
            }

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
                            if (engine.isVcamCompatibilityModeEnabled()
                                    && applyVcamCompatTakeoverOutputConfigList(
                                    engine,
                                    param,
                                    0,
                                    "createCaptureSessionByOutputConfigurations")) {
                                return;
                            }
                            if (engine.isVcamCompatibilityModeEnabled()) {
                                LogUtil.iRateLimited(
                                        "vcam_takeover_fallback:createCaptureSessionByOutputConfigurations",
                                        2000L,
                                        TAG,
                                        "createCaptureSessionByOutputConfigurations vcam_takeover_fallback: takeover returned false, using remap"
                                );
                            }
                            engine.clearVcamCompatibilityAliases();
                            Object arg0 = param.args[0];
                            if (!(arg0 instanceof List)) return;
                            @SuppressWarnings("unchecked")
                            List<Object> in = (List<Object>) arg0;
                            if (in.isEmpty()) return;
                            List<Object> remapped = new ArrayList<>(in.size());
                            int replaced = 0;
                            int preferredIndex = selectPreferredOutputConfigIndex(engine, in);
                            for (Object item : in) {
                                if (item instanceof OutputConfiguration) {
                                    int index = remapped.size();
                                    if (index != preferredIndex || replaced >= MAX_REPLACED_SURFACES_PER_SESSION) {
                                        remapped.add(item);
                                        continue;
                                    }
                                    Surface candidate = getSurfaceFromOutputConfig((OutputConfiguration) item);
                                    if (!isEligibleForReplacement(engine, candidate)) {
                                        remapped.add(item);
                                        continue;
                                    }
                                    MappedOutputConfigResult mapped = mapOutputConfiguration(
                                            engine,
                                            (OutputConfiguration) item,
                                            "createCaptureSessionByOutputConfigurations"
                                    );
                                    remapped.add(mapped.outputConfig);
                                    replaced += mapped.replacedCount;
                                } else {
                                    remapped.add(item);
                                }
                            }
                            param.args[0] = remapped;
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
                                if (engine.isVcamCompatibilityModeEnabled()
                                        && applyVcamCompatTakeoverSessionConfiguration(
                                        engine,
                                        param,
                                        0,
                                        "createCaptureSession(SessionConfiguration)")) {
                                    return;
                                }
                                if (engine.isVcamCompatibilityModeEnabled()) {
                                    LogUtil.iRateLimited(
                                            "vcam_takeover_fallback:createCaptureSession(SessionConfiguration)",
                                            2000L,
                                            TAG,
                                            "createCaptureSession(SessionConfiguration) vcam_takeover_fallback: takeover returned false, using remap"
                                    );
                                }
                                engine.clearVcamCompatibilityAliases();
                                Object arg0 = param.args[0];
                                if (!(arg0 instanceof SessionConfiguration)) return;
                                SessionConfiguration sc = (SessionConfiguration) arg0;
                                List<OutputConfiguration> outputs = sc.getOutputConfigurations();
                                if (outputs == null || outputs.isEmpty()) return;
                                List<OutputConfiguration> remapped = new ArrayList<>(outputs.size());
                                int replaced = 0;
                                int preferredIndex = selectPreferredOutputConfigIndex(engine, outputs);
                                for (OutputConfiguration oc : outputs) {
                                    int index = remapped.size();
                                    if (index != preferredIndex || replaced >= MAX_REPLACED_SURFACES_PER_SESSION) {
                                        remapped.add(oc);
                                        continue;
                                    }
                                    Surface candidate = getSurfaceFromOutputConfig(oc);
                                    if (!isEligibleForReplacement(engine, candidate)) {
                                        remapped.add(oc);
                                        continue;
                                    }
                                    MappedOutputConfigResult mapped = mapOutputConfiguration(
                                            engine,
                                            oc,
                                            "createCaptureSession(SessionConfiguration)"
                                    );
                                    if (mapped.outputConfig instanceof OutputConfiguration) {
                                        remapped.add((OutputConfiguration) mapped.outputConfig);
                                    } else {
                                        remapped.add(oc);
                                    }
                                    replaced += mapped.replacedCount;
                                }
                                if (replaced > 0) {
                                    SessionConfiguration rebuilt = rebuildSessionConfiguration(sc, remapped);
                                    if (rebuilt != null) {
                                        param.args[0] = rebuilt;
                                    }
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


    private static final class MappedOutputConfigResult {
        final Object outputConfig;
        final int replacedCount;

        MappedOutputConfigResult(Object outputConfig, int replacedCount) {
            this.outputConfig = outputConfig;
            this.replacedCount = replacedCount;
        }
    }

    private static MappedOutputConfigResult mapOutputConfiguration(
            VirtualCameraEngine engine, OutputConfiguration oc, String hookName) {
        return mapOutputConfiguration(engine, oc, hookName, true);
    }

    private static MappedOutputConfigResult mapOutputConfiguration(
            VirtualCameraEngine engine,
            OutputConfiguration oc,
            String hookName,
            boolean preserveExtraSurfaces
    ) {
        synchronized (ROUTE_OP_LOCK) {
            if (oc == null) return new MappedOutputConfigResult(oc, 0);
            Surface original = null;
            try {
                original = oc.getSurface();
            } catch (Throwable ignored) {
            }
            if (original == null) return new MappedOutputConfigResult(oc, 0);
            SurfaceInfo info = engine.inferSurfaceInfo(original);
            Surface mapped = engine.mapOutputSurface(original, info);
            if (mapped == original) return new MappedOutputConfigResult(oc, 0);
            try {
                XposedHelpers.callMethod(oc, "setSurface", mapped);
                return new MappedOutputConfigResult(oc, 1);
            } catch (Throwable t) {
                OutputConfiguration rebuilt = buildOutputConfigurationFallback(
                        oc,
                        original,
                        mapped,
                        preserveExtraSurfaces
                );
                if (rebuilt != null) {
                    LogUtil.iRateLimited(
                            "output-config-rebuild:" + hookName,
                            5000L,
                            TAG,
                            hookName + ": setSurface unavailable; using rebuild fallback"
                    );
                    return new MappedOutputConfigResult(rebuilt, 1);
                }
                engine.rollbackOutputSurfaceMapping(original);
                String summary = summarizeThrowable(t);
                LogUtil.iRateLimited(
                        "output-config-rollback:" + hookName + ":" + summary,
                        4000L,
                        TAG,
                        hookName + ": failed to set mapped surface; rolled back (" + summary + ")"
                );
                return new MappedOutputConfigResult(oc, 0);
            }
        }
    }

    private static OutputConfiguration buildOutputConfigurationFallback(
            OutputConfiguration originalConfig,
            Surface originalSurface,
            Surface mappedSurface,
            boolean preserveExtraSurfaces
    ) {
        try {
            Object rebuiltObj = null;
            try {
                rebuiltObj = XposedHelpers.newInstance(originalConfig.getClass(), mappedSurface);
            } catch (Throwable ignored) {
            }
            if (!(rebuiltObj instanceof OutputConfiguration)) {
                try {
                    int surfaceGroupId = -1;
                    try {
                        Object groupId = XposedHelpers.callMethod(originalConfig, "getSurfaceGroupId");
                        if (groupId instanceof Integer) {
                            surfaceGroupId = (Integer) groupId;
                        }
                    } catch (Throwable ignored) {
                    }
                    rebuiltObj = XposedHelpers.newInstance(
                            originalConfig.getClass(),
                            surfaceGroupId,
                            mappedSurface
                    );
                } catch (Throwable ignored) {
                }
            }
            if (!(rebuiltObj instanceof OutputConfiguration)) {
                return null;
            }
            OutputConfiguration rebuilt = (OutputConfiguration) rebuiltObj;

            try {
                Object physicalCameraId = XposedHelpers.callMethod(originalConfig, "getPhysicalCameraId");
                if (physicalCameraId instanceof String && !((String) physicalCameraId).isEmpty()) {
                    XposedHelpers.callMethod(rebuilt, "setPhysicalCameraId", physicalCameraId);
                }
            } catch (Throwable ignored) {
            }

            if (preserveExtraSurfaces) {
                try {
                    @SuppressWarnings("unchecked")
                    List<Surface> surfaces = (List<Surface>) XposedHelpers.callMethod(originalConfig, "getSurfaces");
                    if (surfaces != null && surfaces.size() > 1) {
                        try {
                            XposedHelpers.callMethod(rebuilt, "enableSurfaceSharing");
                        } catch (Throwable ignored) {
                        }
                        for (Surface extra : surfaces) {
                            if (extra == null || extra == originalSurface || extra == mappedSurface) continue;
                            try {
                                XposedHelpers.callMethod(rebuilt, "addSurface", extra);
                            } catch (Throwable ignored) {
                            }
                        }
                    }
                } catch (Throwable ignored) {
                }
            }

            copyOutputConfigurationField(originalConfig, rebuilt, "getStreamUseCase", "setStreamUseCase");
            copyOutputConfigurationField(originalConfig, rebuilt, "getTimestampBase", "setTimestampBase");
            copyOutputConfigurationField(originalConfig, rebuilt, "getMirrorMode", "setMirrorMode");
            copyOutputConfigurationField(originalConfig, rebuilt, "getDynamicRangeProfile", "setDynamicRangeProfile");
            copyOutputConfigurationField(originalConfig, rebuilt, "isReadoutTimestampEnabled", "setReadoutTimestampEnabled");

            return rebuilt;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static String summarizeThrowable(Throwable t) {
        if (t == null) return "unknown";
        String message = t.getMessage();
        if (message == null || message.trim().isEmpty()) {
            return t.getClass().getSimpleName();
        }
        return t.getClass().getSimpleName() + ":" + message.trim();
    }

    private static void copyOutputConfigurationField(
            OutputConfiguration source,
            OutputConfiguration target,
            String getter,
            String setter
    ) {
        try {
            Object value = XposedHelpers.callMethod(source, getter);
            if (value != null) {
                XposedHelpers.callMethod(target, setter, value);
            }
        } catch (Throwable ignored) {
        }
    }

    private static SessionConfiguration rebuildSessionConfiguration(
            SessionConfiguration original,
            List<OutputConfiguration> outputs
    ) {
        try {
            Object sessionType = XposedHelpers.callMethod(original, "getSessionType");
            Object executor = XposedHelpers.callMethod(original, "getExecutor");
            Object callback = XposedHelpers.callMethod(original, "getStateCallback");
            Object rebuiltObj = XposedHelpers.newInstance(
                    original.getClass(),
                    sessionType,
                    outputs,
                    executor,
                    callback
            );
            if (!(rebuiltObj instanceof SessionConfiguration)) {
                return null;
            }

            SessionConfiguration rebuilt = (SessionConfiguration) rebuiltObj;
            try {
                Object sessionParams = XposedHelpers.callMethod(original, "getSessionParameters");
                if (sessionParams != null) {
                    XposedHelpers.callMethod(rebuilt, "setSessionParameters", sessionParams);
                }
            } catch (Throwable ignored) {
            }
            return rebuilt;
        } catch (Throwable t) {
            LogUtil.e(TAG, "createCaptureSession(SessionConfiguration): rebuild failed", t);
            return null;
        }
    }

    private static boolean applyVcamCompatTakeoverSurfaceList(
            VirtualCameraEngine engine,
            XC_MethodHook.MethodHookParam param,
            int argIndex,
            String hookName
    ) {
        Object arg = param.args[argIndex];
        if (!(arg instanceof List)) return false;
        @SuppressWarnings("unchecked")
        List<Object> in = (List<Object>) arg;
        if (in.isEmpty()) return false;
        int preferredIndex = selectPreferredSurfaceIndex(engine, in);
        if (preferredIndex < 0 || preferredIndex >= in.size()) return false;
        Object preferred = in.get(preferredIndex);
        if (!(preferred instanceof Surface)) return false;
        Surface preferredSurface = (Surface) preferred;
        Surface takeoverSurface = engine.mapOutputSurface(
                preferredSurface,
                engine.inferSurfaceInfo(preferredSurface)
        );
        if (takeoverSurface == null || takeoverSurface == preferredSurface) {
            return false;
        }
        List<Object> takeoverOnly = new ArrayList<>(1);
        takeoverOnly.add(takeoverSurface);
        List<Surface> originals = collectSurfacesFromSurfaceList(in);
        if (originals.isEmpty()) {
            return false;
        }
        engine.enableVcamCompatibilityAliases(originals, takeoverSurface);
        param.args[argIndex] = takeoverOnly;
        LogUtil.iRateLimited(
                "vcam_takeover_applied:" + hookName,
                2000L,
                TAG,
                hookName + " vcam_takeover_applied originals=" + originals.size() + " outputs=1"
        );
        LogUtil.iRateLimited(
                "vcam-compat-surface-list:" + hookName,
                2000L,
                TAG,
                hookName + " compat takeover active originals=" + originals.size() + " outputs=1"
        );
        logMappingSummary(engine, hookName, 1);
        return true;
    }

    private static boolean applyVcamCompatTakeoverOutputConfigList(
            VirtualCameraEngine engine,
            XC_MethodHook.MethodHookParam param,
            int argIndex,
            String hookName
    ) {
        Object arg = param.args[argIndex];
        if (!(arg instanceof List)) return false;
        @SuppressWarnings("unchecked")
        List<Object> in = (List<Object>) arg;
        if (in.isEmpty()) return false;
        int preferredIndex = selectPreferredOutputConfigIndex(engine, in);
        if (preferredIndex < 0 || preferredIndex >= in.size()) return false;
        Object preferred = in.get(preferredIndex);
        if (!(preferred instanceof OutputConfiguration)) return false;
        List<Surface> originals = collectSurfacesFromOutputConfigList(in);
        if (originals.isEmpty()) return false;
        Surface preferredSurface = getSurfaceFromOutputConfig((OutputConfiguration) preferred);
        MappedOutputConfigResult mapped = mapOutputConfiguration(
                engine,
                (OutputConfiguration) preferred,
                hookName,
                false
        );
        if (mapped.replacedCount <= 0 || !(mapped.outputConfig instanceof OutputConfiguration)) {
            return false;
        }
        Surface takeoverSurface = getSurfaceFromOutputConfig((OutputConfiguration) mapped.outputConfig);
        if (takeoverSurface == null) {
            if (preferredSurface != null) {
                engine.rollbackOutputSurfaceMapping(preferredSurface);
            }
            return false;
        }
        List<Object> takeoverOnly = new ArrayList<>(1);
        takeoverOnly.add(mapped.outputConfig);
        engine.enableVcamCompatibilityAliases(originals, takeoverSurface);
        param.args[argIndex] = takeoverOnly;
        LogUtil.iRateLimited(
                "vcam_takeover_applied:" + hookName,
                2000L,
                TAG,
                hookName + " vcam_takeover_applied originals=" + originals.size() + " outputs=1"
        );
        LogUtil.iRateLimited(
                "vcam-compat-output-config-list:" + hookName,
                2000L,
                TAG,
                hookName + " compat takeover active originals=" + originals.size() + " outputs=1"
        );
        logMappingSummary(engine, hookName, mapped.replacedCount);
        return true;
    }

    private static boolean applyVcamCompatTakeoverSessionConfiguration(
            VirtualCameraEngine engine,
            XC_MethodHook.MethodHookParam param,
            int argIndex,
            String hookName
    ) {
        Object arg = param.args[argIndex];
        if (!(arg instanceof SessionConfiguration)) return false;
        SessionConfiguration sc = (SessionConfiguration) arg;
        List<OutputConfiguration> outputs = sc.getOutputConfigurations();
        if (outputs == null || outputs.isEmpty()) return false;
        List<Surface> originals = collectSurfacesFromOutputConfigList(outputs);
        if (originals.isEmpty()) return false;
        int preferredIndex = selectPreferredOutputConfigIndex(engine, outputs);
        if (preferredIndex < 0 || preferredIndex >= outputs.size()) return false;
        OutputConfiguration preferred = outputs.get(preferredIndex);
        Surface preferredSurface = getSurfaceFromOutputConfig(preferred);
        MappedOutputConfigResult mapped = mapOutputConfiguration(engine, preferred, hookName, false);
        if (mapped.replacedCount <= 0 || !(mapped.outputConfig instanceof OutputConfiguration)) {
            return false;
        }
        OutputConfiguration takeoverOutputConfig = (OutputConfiguration) mapped.outputConfig;
        Surface takeoverSurface = getSurfaceFromOutputConfig(takeoverOutputConfig);
        if (takeoverSurface == null) {
            if (preferredSurface != null) {
                engine.rollbackOutputSurfaceMapping(preferredSurface);
            }
            return false;
        }
        List<OutputConfiguration> takeoverOnly = new ArrayList<>(1);
        takeoverOnly.add(takeoverOutputConfig);
        SessionConfiguration rebuilt = rebuildSessionConfiguration(sc, takeoverOnly);
        if (rebuilt == null) {
            if (preferredSurface != null) {
                engine.rollbackOutputSurfaceMapping(preferredSurface);
            }
            return false;
        }
        engine.enableVcamCompatibilityAliases(originals, takeoverSurface);
        param.args[argIndex] = rebuilt;
        LogUtil.iRateLimited(
                "vcam_takeover_applied:" + hookName,
                2000L,
                TAG,
                hookName + " vcam_takeover_applied originals=" + originals.size() + " outputs=1"
        );
        LogUtil.iRateLimited(
                "vcam-compat-session-config:" + hookName,
                2000L,
                TAG,
                hookName + " compat takeover active originals=" + originals.size() + " outputs=1"
        );
        logMappingSummary(engine, hookName, mapped.replacedCount);
        return true;
    }

    private static List<Surface> collectSurfacesFromSurfaceList(List<?> entries) {
        List<Surface> surfaces = new ArrayList<>();
        if (entries == null) return surfaces;
        for (Object entry : entries) {
            if (entry instanceof Surface) {
                surfaces.add((Surface) entry);
            }
        }
        return surfaces;
    }

    private static List<Surface> collectSurfacesFromOutputConfigList(List<?> entries) {
        List<Surface> surfaces = new ArrayList<>();
        if (entries == null) return surfaces;
        for (Object entry : entries) {
            if (!(entry instanceof OutputConfiguration)) continue;
            collectSurfacesFromOutputConfig((OutputConfiguration) entry, surfaces);
        }
        return surfaces;
    }

    private static void collectSurfacesFromOutputConfig(OutputConfiguration config, List<Surface> out) {
        if (config == null || out == null) return;
        boolean collected = false;
        try {
            @SuppressWarnings("unchecked")
            List<Surface> surfaces = (List<Surface>) XposedHelpers.callMethod(config, "getSurfaces");
            if (surfaces != null) {
                for (Surface s : surfaces) {
                    if (s == null) continue;
                    out.add(s);
                    collected = true;
                }
            }
        } catch (Throwable ignored) {
        }
        if (!collected) {
            Surface surface = getSurfaceFromOutputConfig(config);
            if (surface != null) {
                out.add(surface);
            }
        }
    }

    private static List<Object> mapSurfaceList(
            VirtualCameraEngine engine,
            List<Object> in,
            String hookName
    ) {
        synchronized (ROUTE_OP_LOCK) {
            List<Object> out = new ArrayList<>(in.size());
            int replaced = 0;
            int preferredIndex = selectPreferredSurfaceIndex(engine, in);
            for (Object o : in) {
                if (o instanceof Surface) {
                    Surface original = (Surface) o;
                    int index = out.size();
                    if (index != preferredIndex ||
                            replaced >= MAX_REPLACED_SURFACES_PER_SESSION ||
                            !isEligibleForReplacement(engine, original)) {
                        out.add(original);
                        continue;
                    }
                    SurfaceInfo info = engine.inferSurfaceInfo(original);
                    Surface mapped = engine.mapOutputSurface(original, info);
                    if (mapped != original) replaced++;
                    out.add(mapped);
                } else {
                    out.add(o);
                }
            }
            logMappingSummary(engine, hookName, replaced);
            return out;
        }
    }

    private static Surface getSurfaceFromOutputConfig(OutputConfiguration oc) {
        if (oc == null) return null;
        try {
            return oc.getSurface();
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static boolean isEligibleForReplacement(VirtualCameraEngine engine, Surface surface) {
        if (engine == null || surface == null) return false;
        SurfaceInfo info = engine.inferSurfaceInfo(surface);
        if (info == null) return false;
        if (info.kind == SurfaceInfo.Kind.SURFACE_TEXTURE) return true;
        if (info.kind != SurfaceInfo.Kind.UNKNOWN) return false;
        return info.width > 0 && info.height > 0;
    }

    private static int selectPreferredSurfaceIndex(VirtualCameraEngine engine, List<?> surfaces) {
        int bestIndex = -1;
        int bestPriority = -1;
        if (surfaces == null) return -1;
        for (int i = 0; i < surfaces.size(); i++) {
            Object item = surfaces.get(i);
            if (!(item instanceof Surface)) continue;
            int priority = replacementPriority(engine, (Surface) item);
            if (priority > bestPriority) {
                bestPriority = priority;
                bestIndex = i;
            }
        }
        return bestIndex;
    }

    private static int selectPreferredOutputConfigIndex(VirtualCameraEngine engine, List<?> outputConfigs) {
        int bestIndex = -1;
        int bestPriority = -1;
        if (outputConfigs == null) return -1;
        for (int i = 0; i < outputConfigs.size(); i++) {
            Object item = outputConfigs.get(i);
            if (!(item instanceof OutputConfiguration)) continue;
            Surface surface = getSurfaceFromOutputConfig((OutputConfiguration) item);
            int priority = replacementPriority(engine, surface);
            if (priority > bestPriority) {
                bestPriority = priority;
                bestIndex = i;
            }
        }
        return bestIndex;
    }

    private static int replacementPriority(VirtualCameraEngine engine, Surface surface) {
        if (!isEligibleForReplacement(engine, surface)) return -1;
        SurfaceInfo info = engine.inferSurfaceInfo(surface);
        if (info == null) return -1;
        if (info.kind == SurfaceInfo.Kind.SURFACE_TEXTURE) return 2;
        if (info.kind == SurfaceInfo.Kind.UNKNOWN) return 1;
        return -1;
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
                            Surface mapped;
                            synchronized (ROUTE_OP_LOCK) {
                                mapped = engine.mapRequestTargetSurface(s);
                            }
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
                            Surface mapped;
                            synchronized (ROUTE_OP_LOCK) {
                                mapped = engine.mapRequestTargetSurface(s);
                            }
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
