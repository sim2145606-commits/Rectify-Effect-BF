package com.briefplantrain.virtucam.hooks;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import de.robv.android.xposed.XposedBridge;

/**
 * Registry that maps package names to their specialized hook strategies.
 * Falls back to the generic CameraHook for unregistered packages.
 */
public class HookStrategyRegistry {

    private static final String TAG = "VirtuCam-Registry";
    private static HookStrategyRegistry instance;

    private final List<IHookStrategy> strategies = new ArrayList<>();
    private final Map<String, IHookStrategy> packageMap = new HashMap<>();

    private HookStrategyRegistry() {
        // Register all app-specific strategies
        register(new WhatsAppHookStrategy());
        register(new DouYinHookStrategy());
        // Register more strategies here as needed:
        // register(new InstagramHookStrategy());
        // register(new SnapchatHookStrategy());
        // register(new TelegramHookStrategy());
    }

    public static synchronized HookStrategyRegistry getInstance() {
        if (instance == null) {
            instance = new HookStrategyRegistry();
        }
        return instance;
    }

    private void register(IHookStrategy strategy) {
        strategies.add(strategy);
        for (String pkg : strategy.getTargetPackages()) {
            packageMap.put(pkg, strategy);
            XposedBridge.log(TAG + ": Registered " + strategy.getStrategyName() +
                " for " + pkg);
        }
    }

    /**
     * Get the specialized strategy for a package, or null for generic handling.
     */
    public IHookStrategy getStrategy(String packageName) {
        return packageMap.get(packageName);
    }

    /**
     * Check if a package has a specialized strategy.
     */
    public boolean hasSpecializedStrategy(String packageName) {
        return packageMap.containsKey(packageName);
    }

    /**
     * Get all registered strategies.
     */
    public List<IHookStrategy> getAllStrategies() {
        return new ArrayList<>(strategies);
    }

    /**
     * Cleanup all strategies.
     */
    public void cleanupAll() {
        for (IHookStrategy strategy : strategies) {
            try {
                strategy.cleanup();
            } catch (Exception e) {
                XposedBridge.log(TAG + ": Cleanup failed for " + strategy.getStrategyName());
            }
        }
    }
}
