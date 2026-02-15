package com.briefplantrain.virtucam;

import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.callbacks.XC_LoadPackage;

public class CameraHook implements IXposedHookLoadPackage {
    public void handleLoadPackage(final XC_LoadPackage.LoadPackageParam lpparam) throws Throwable {
        XposedBridge.log("VirtuCam: Loaded app: " + lpparam.packageName);

        // TODO: Add camera hooking logic here
    }
}
