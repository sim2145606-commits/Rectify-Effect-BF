package com.briefplantrain.virtucam.util;

import android.util.Log;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class LogUtil {

    private static volatile boolean verboseLogging = false;
    private static final Map<String, Long> rateLimitedKeys = new ConcurrentHashMap<>();
    private static final int MAX_RATE_LIMITED_KEYS = 256;

    private LogUtil() {}

    public static void setVerboseLogging(boolean enabled) {
        verboseLogging = enabled;
    }

    public static boolean isVerboseLogging() {
        return verboseLogging;
    }

    public static void d(String tag, String msg) {
        if (!verboseLogging) return;
        emitXposedOrAndroid(tag, msg, null, Log.DEBUG);
    }

    public static void dRateLimited(String key, long minIntervalMs, String tag, String msg) {
        if (!verboseLogging) return;
        long now = System.currentTimeMillis();
        Long last = rateLimitedKeys.get(key);
        if (last != null && (now - last) < Math.max(0L, minIntervalMs)) {
            return;
        }
        evictIfNeeded();
        rateLimitedKeys.put(key, now);
        emitXposedOrAndroid(tag, msg, null, Log.DEBUG);
    }

    public static void i(String tag, String msg) {
        emitXposedOrAndroid(tag, msg, null, Log.INFO);
    }

    public static void iRateLimited(String key, long minIntervalMs, String tag, String msg) {
        long now = System.currentTimeMillis();
        Long last = rateLimitedKeys.get(key);
        if (last != null && (now - last) < Math.max(0L, minIntervalMs)) {
            return;
        }
        evictIfNeeded();
        rateLimitedKeys.put(key, now);
        emitXposedOrAndroid(tag, msg, null, Log.INFO);
    }

    public static void always(String tag, String msg) {
        emitXposedOrAndroid(tag, msg, null, Log.INFO);
    }

    private static void emitXposedOrAndroid(String tag, String msg, Throwable tr, int level) {
        try {
            String out = tag + ": " + msg;
            if (tr != null) out += "\n" + Log.getStackTraceString(tr);
            de.robv.android.xposed.XposedBridge.log(out);
        } catch (Throwable t) {
            switch (level) {
                case Log.WARN:
                    Log.w(tag, msg, tr);
                    return;
                case Log.ERROR:
                    Log.e(tag, msg, tr);
                    return;
                case Log.INFO:
                    Log.i(tag, msg, tr);
                    return;
                case Log.DEBUG:
                default:
                    Log.d(tag, msg, tr);
            }
        }
    }

    public static void w(String tag, String msg) {
        w(tag, msg, null);
    }

    public static void w(String tag, String msg, Throwable tr) {
        emitXposedOrAndroid(tag, msg, tr, Log.WARN);
    }

    public static void e(String tag, String msg) {
        e(tag, msg, null);
    }

    public static void e(String tag, String msg, Throwable tr) {
        emitXposedOrAndroid(tag, msg, tr, Log.ERROR);
    }

    /** Evict oldest entries when the rate-limit map grows too large. */
    private static void evictIfNeeded() {
        if (rateLimitedKeys.size() <= MAX_RATE_LIMITED_KEYS) return;
        // Remove the oldest half of entries
        long now = System.currentTimeMillis();
        long cutoff = now - 60_000L; // entries older than 60s
        rateLimitedKeys.entrySet().removeIf(e -> e.getValue() < cutoff);
        // If still too large, just clear
        if (rateLimitedKeys.size() > MAX_RATE_LIMITED_KEYS) {
            rateLimitedKeys.clear();
        }
    }
}
