package com.briefplantrain.virtucam.hooks;

/**
 * Shared configuration data passed to all hook strategies.
 */
public class HookConfig {
    public volatile boolean enabled = false;
    public volatile String mediaSourcePath = null;
    public volatile String cameraTarget = "front";
    public volatile boolean mirrored = false;
    public volatile int rotation = 0;
    public volatile float scaleX = 1.0f;
    public volatile float scaleY = 1.0f;
    public volatile float offsetX = 0.0f;
    public volatile float offsetY = 0.0f;
    public volatile String scaleMode = "fit";
    public volatile boolean isStreamingMode = false;

    public boolean shouldHookCamera(int facing) {
        // Camera2 CameraCharacteristics.LENS_FACING: 0 = FRONT, 1 = BACK
        if ("both".equals(cameraTarget)) return true;
        if ("front".equals(cameraTarget) && facing == 0) return true;
        if ("back".equals(cameraTarget) && facing == 1) return true;
        return false;
    }
}
