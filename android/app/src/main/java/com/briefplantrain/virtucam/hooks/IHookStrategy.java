package com.briefplantrain.virtucam.hooks;

import com.briefplantrain.virtucam.engine.VirtualCameraEngine;
import de.robv.android.xposed.callbacks.XC_LoadPackage;
import java.util.List;

public interface IHookStrategy {

    String getStrategyName();

    String[] getTargetPackages();

    boolean canHandle(String packageName);

    void install(XC_LoadPackage.LoadPackageParam lpparam, VirtualCameraEngine engine);

    void applyHooks(XC_LoadPackage.LoadPackageParam lpparam, HookConfig config);

    void cleanup();
}
