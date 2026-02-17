package com.briefplantrain.virtucam.hooks;

import de.robv.android.xposed.callbacks.XC_LoadPackage.LoadPackageParam;

/**
 * Interface for per-app hook strategies.
 * Each target app can have a customized hook implementation.
 */
public interface IHookStrategy {

    /**
     * Unique identifier for this strategy
     */
    String getStrategyName();

    /**
     * List of package names this strategy handles
     */
    String[] getTargetPackages();

    /**
     * Whether this strategy can handle the given package
     */
    boolean canHandle(String packageName);

    /**
     * Apply hooks for the specific app
     * @param lpparam The LoadPackageParam from Xposed
     * @param config  The current VirtuCam configuration
     */
    void applyHooks(LoadPackageParam lpparam, HookConfig config);

    /**
     * Clean up resources when hook is disabled
     */
    void cleanup();
}
