package com.briefplantrain.virtucam.hooks;

import com.briefplantrain.virtucam.engine.VirtualCameraEngine;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.callbacks.XC_LoadPackage.LoadPackageParam;

/**
 * Custom hook strategy for Douyin / TikTok.
 * These apps use custom camera pipelines with MediaCodec encoding
 * that need frame injection at the encoder level.
 */
public class DouYinHookStrategy implements IHookStrategy {

    private static final String TAG = "VirtuCam-DouYin";
    private VirtualCameraEngine mEngine;

    @Override
    public String getStrategyName() {
        return "DouYin/TikTok";
    }

    @Override
    public String[] getTargetPackages() {
        return new String[]{
            "com.ss.android.ugc.aweme",       // Douyin (Chinese TikTok)
            "com.zhiliaoapp.musically",        // TikTok International
            "com.ss.android.ugc.aweme.lite"    // Douyin Lite
        };
    }

    @Override
    public boolean canHandle(String packageName) {
        for (String pkg : getTargetPackages()) {
            if (pkg.equals(packageName)) return true;
        }
        return false;
    }

    @Override
    public void install(LoadPackageParam lpparam, VirtualCameraEngine engine) {
        this.mEngine = engine;
        XposedBridge.log(TAG + ": Installing hooks for " + lpparam.packageName);
        applyHooks(lpparam, new HookConfig());
    }

    @Override
    public void applyHooks(LoadPackageParam lpparam, HookConfig config) {
        XposedBridge.log(TAG + ": Applying DouYin/TikTok-specific hooks");

        // DouYin/TikTok specific handling:
        // 1. Hook MediaCodec.createInputSurface() for video recording injection
        // 2. Hook the custom CameraXManager used by ByteDance
        // 3. Intercept the GL rendering pipeline for real-time preview

        // TODO: Implement DouYin-specific MediaCodec surface injection
    }

    @Override
    public void cleanup() {
        XposedBridge.log(TAG + ": Cleanup");
        mEngine = null;
    }
}
