package com.briefplantrain.virtucam.util;

import android.util.Log;

public final class LogUtil {

    private LogUtil() {}

    public static void d(String tag, String msg) {
        try {
            de.robv.android.xposed.XposedBridge.log(tag + ": " + msg);
        } catch (Throwable t) {
            Log.d(tag, msg);
        }
    }


    public static void w(String tag, String msg) {
        w(tag, msg, null);
    }

    public static void w(String tag, String msg, Throwable tr) {
        try {
            String out = tag + ": " + msg;
            if (tr != null) out += "\n" + Log.getStackTraceString(tr);
            de.robv.android.xposed.XposedBridge.log(out);
        } catch (Throwable t) {
            Log.w(tag, msg, tr);
        }
    }

    public static void e(String tag, String msg) {
        e(tag, msg, null);
    }

    public static void e(String tag, String msg, Throwable tr) {
        try {
            String out = tag + ": " + msg;
            if (tr != null) out += "\n" + Log.getStackTraceString(tr);
            de.robv.android.xposed.XposedBridge.log(out);
        } catch (Throwable t) {
            Log.e(tag, msg, tr);
        }
    }
}
