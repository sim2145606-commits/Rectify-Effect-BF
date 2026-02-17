package com.briefplantrain.virtucam.hooks;

import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.callbacks.XC_LoadPackage.LoadPackageParam;

/**
 * Custom hook strategy for WhatsApp.
 * WhatsApp uses Camera2 API with specific session configurations
 * that need special handling.
 */
public class WhatsAppHookStrategy implements IHookStrategy {

    private static final String TAG = "VirtuCam-WhatsApp";

    @Override
    public String getStrategyName() {
        return "WhatsApp";
    }

    @Override
    public String[] getTargetPackages() {
        return new String[]{
            "com.whatsapp",
            "com.whatsapp.w4b"  // WhatsApp Business
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
    public void applyHooks(LoadPackageParam lpparam, HookConfig config) {
        XposedBridge.log(TAG + ": Applying WhatsApp-specific hooks for " + lpparam.packageName);

        // WhatsApp uses Camera2 with custom session handling
        // Apply the standard Camera2 hooks — the generic hook handles this well
        // but we add WhatsApp-specific fixes here:
        //
        // 1. WhatsApp re-creates camera sessions frequently on video calls
        // 2. WhatsApp uses TextureView internally which needs Surface replacement
        // 3. Status camera uses a different code path than chat camera

        // TODO: Implement WhatsApp-specific Camera2 session interception
        // This will call back into CameraHook's static helper methods
    }

    @Override
    public void cleanup() {
        XposedBridge.log(TAG + ": Cleanup");
    }
}
