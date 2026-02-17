package com.briefplantrain.virtucam.hooks;

import org.junit.Test;
import static org.junit.Assert.*;

public class HookStrategyRegistryTest {

    @Test
    public void testWhatsAppStrategyRegistered() {
        WhatsAppHookStrategy strategy = new WhatsAppHookStrategy();
        assertTrue(strategy.canHandle("com.whatsapp"));
        assertTrue(strategy.canHandle("com.whatsapp.w4b"));
        assertFalse(strategy.canHandle("com.instagram.android"));
    }

    @Test
    public void testDouYinStrategyRegistered() {
        DouYinHookStrategy strategy = new DouYinHookStrategy();
        assertTrue(strategy.canHandle("com.ss.android.ugc.aweme"));
        assertTrue(strategy.canHandle("com.zhiliaoapp.musically"));
        assertFalse(strategy.canHandle("com.whatsapp"));
    }

    @Test
    public void testHookConfigDefaults() {
        HookConfig config = new HookConfig();
        assertFalse(config.enabled);
        assertNull(config.mediaSourcePath);
        assertEquals("front", config.cameraTarget);
        assertFalse(config.isStreamingMode);
    }

    @Test
    public void testHookConfigCameraTarget() {
        HookConfig config = new HookConfig();

        config.cameraTarget = "front";
        assertTrue(config.shouldHookCamera(1));   // front
        assertFalse(config.shouldHookCamera(0));  // back

        config.cameraTarget = "back";
        assertFalse(config.shouldHookCamera(1));
        assertTrue(config.shouldHookCamera(0));

        config.cameraTarget = "both";
        assertTrue(config.shouldHookCamera(1));
        assertTrue(config.shouldHookCamera(0));
    }
}
