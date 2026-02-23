package com.briefplantrain.virtucam.config;

import android.os.SystemClock;

import com.briefplantrain.virtucam.util.LogUtil;
import com.briefplantrain.virtucam.util.VirtuCamIPC;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

import de.robv.android.xposed.XSharedPreferences;

public final class ConfigLoader {

    private static final String TAG = "VirtuCam/ConfigLoader";

    public static final String MODULE_PACKAGE = "com.briefplantrain.virtucam";
    public static final String PREFS_FILE = "virtucam_config";
    public static final String FALLBACK_JSON_PATH = VirtuCamIPC.CONFIG_JSON;
    public static final String LEGACY_FALLBACK_JSON_PATH = VirtuCamIPC.LEGACY_TMP_JSON;
    private static final long MAX_CONFIG_SIZE_BYTES = 512 * 1024;

    private final long reloadIntervalMs;
    private volatile long lastLoadMs = 0;

    private final AtomicReference<ConfigSnapshot> cached =
            new AtomicReference<>(new ConfigSnapshot());

    public ConfigLoader(long reloadIntervalMs) {
        this.reloadIntervalMs = Math.max(100, reloadIntervalMs);
    }

    public ConfigSnapshot getSnapshot() {
        long now = SystemClock.uptimeMillis();
        if (now - lastLoadMs > reloadIntervalMs) {
            reload();
        }
        return cached.get();
    }

    public void reload() {
        lastLoadMs = SystemClock.uptimeMillis();
        try {
            ConfigSnapshot snap = loadOnce();
            cached.set(snap);
        } catch (Throwable t) {
            LogUtil.e(TAG, "reload() failed", t);
        }
    }

    private ConfigSnapshot loadOnce() {
        ConfigSnapshot snap = new ConfigSnapshot();

        boolean sourceModeExplicit = false;

        try {
            XSharedPreferences prefs = new XSharedPreferences(MODULE_PACKAGE, PREFS_FILE);
            prefs.reload();

            snap.enabled = prefs.getBoolean("enabled", snap.enabled);

            String sm = prefs.getString("sourceMode", null);
            if (sm != null) {
                snap.sourceMode = parseSourceMode(sm, snap.sourceMode);
                sourceModeExplicit = true;
            }

            String path = prefs.getString("mediaSourcePath", null);
            if (path != null && path.trim().isEmpty()) path = null;
            snap.mediaSourcePath = path != null ? path : snap.mediaSourcePath;

            snap.cameraTarget = prefs.getString("cameraTarget", snap.cameraTarget);
            snap.mirrored = prefs.getBoolean("mirrored", snap.mirrored);
            snap.rotation = prefs.getInt("rotation", snap.rotation);
            snap.scaleX = prefs.getFloat("scaleX", snap.scaleX);
            snap.scaleY = prefs.getFloat("scaleY", snap.scaleY);
            snap.offsetX = prefs.getFloat("offsetX", snap.offsetX);
            snap.offsetY = prefs.getFloat("offsetY", snap.offsetY);
            snap.scaleMode = prefs.getString("scaleMode", snap.scaleMode);

            String tm = prefs.getString("targetMode", null);
            if (tm != null) snap.targetMode = parseTargetMode(tm, snap.targetMode);

            String csv = prefs.getString("targetPackages", "");
            Set<String> set = ConfigSnapshot.copyCsvToSet(csv);
            snap.targetPackages = set;

            snap.debug = prefs.getBoolean("debug", snap.debug);
            snap.aggressiveSurfaceReplace = prefs.getBoolean("aggressiveSurfaceReplace", snap.aggressiveSurfaceReplace);
            snap.fps = prefs.getInt("fps", snap.fps);

        } catch (Throwable t) {
            LogUtil.e(TAG, "XSharedPreferences load failed; will try JSON fallback", t);
        }

        try {
            final boolean ipcReady = VirtuCamIPC.INSTANCE.isIpcReady();
            String[] candidates = ipcReady
                    ? new String[] { FALLBACK_JSON_PATH }
                    : new String[] { FALLBACK_JSON_PATH, LEGACY_FALLBACK_JSON_PATH };

            for (String candidate : candidates) {
                File f = new File(candidate).getCanonicalFile();
                String canonicalPath = f.getPath();
                boolean validPath = VirtuCamIPC.CONFIG_JSON.equals(canonicalPath)
                        || VirtuCamIPC.LEGACY_TMP_JSON.equals(canonicalPath);
                if (!validPath) {
                    throw new SecurityException("Invalid fallback config path");
                }
                if (!f.exists() || !f.canRead()) {
                    continue;
                }
                if (f.length() > MAX_CONFIG_SIZE_BYTES) {
                    throw new IllegalStateException("Fallback config file too large");
                }

                String text = slurpFile(f);
                JSONObject j = new JSONObject(text);

                if (j.has("enabled")) snap.enabled = j.optBoolean("enabled", snap.enabled);

                if (j.has("sourceMode")) {
                    snap.sourceMode = parseSourceMode(j.optString("sourceMode", ""), snap.sourceMode);
                    sourceModeExplicit = true;
                }

                if (j.has("mediaSourcePath")) {
                    String p = j.optString("mediaSourcePath", null);
                    if (p != null && p.trim().isEmpty()) p = null;
                    snap.mediaSourcePath = p != null ? p : snap.mediaSourcePath;
                }

                if (j.has("cameraTarget")) snap.cameraTarget = j.optString("cameraTarget", snap.cameraTarget);
                if (j.has("mirrored")) snap.mirrored = j.optBoolean("mirrored", snap.mirrored);
                if (j.has("rotation")) snap.rotation = j.optInt("rotation", snap.rotation);

                if (j.has("scaleX")) snap.scaleX = (float) j.optDouble("scaleX", snap.scaleX);
                if (j.has("scaleY")) snap.scaleY = (float) j.optDouble("scaleY", snap.scaleY);
                if (j.has("offsetX")) snap.offsetX = (float) j.optDouble("offsetX", snap.offsetX);
                if (j.has("offsetY")) snap.offsetY = (float) j.optDouble("offsetY", snap.offsetY);

                if (j.has("scaleMode")) snap.scaleMode = j.optString("scaleMode", snap.scaleMode);
                if (j.has("targetMode")) snap.targetMode = parseTargetMode(j.optString("targetMode", ""), snap.targetMode);

                if (j.has("targetPackages")) {
                    snap.targetPackages = ConfigSnapshot.copyCsvToSet(j.optString("targetPackages", ""));
                }

                if (j.has("debug")) snap.debug = j.optBoolean("debug", snap.debug);
                if (j.has("aggressiveSurfaceReplace")) {
                    snap.aggressiveSurfaceReplace =
                            j.optBoolean("aggressiveSurfaceReplace", snap.aggressiveSurfaceReplace);
                }
                if (j.has("fps")) snap.fps = j.optInt("fps", snap.fps);

                LogUtil.d(TAG, "Loaded JSON fallback from: " + canonicalPath);
                break;
            }
        } catch (Throwable t) {
            LogUtil.e(TAG, "JSON fallback load failed", t);
        }

        if (!sourceModeExplicit) {
            snap.sourceMode = (snap.mediaSourcePath == null)
                    ? ConfigSnapshot.SourceMode.BLACK
                    : ConfigSnapshot.SourceMode.FILE;
        }

        if (snap.fps < 5) snap.fps = 5;
        if (snap.fps > 60) snap.fps = 60;

        return snap;
    }

    private static ConfigSnapshot.TargetMode parseTargetMode(String s, ConfigSnapshot.TargetMode def) {
        if (s == null) return def;
        String v = s.trim().toLowerCase(Locale.ROOT);
        switch (v) {
            case "all":
                return ConfigSnapshot.TargetMode.ALL;
            case "blacklist":
                return ConfigSnapshot.TargetMode.BLACKLIST;
            case "whitelist":
            default:
                return ConfigSnapshot.TargetMode.WHITELIST;
        }
    }

    private static ConfigSnapshot.SourceMode parseSourceMode(String s, ConfigSnapshot.SourceMode def) {
        if (s == null) return def;
        String v = s.trim().toLowerCase(Locale.ROOT);
        switch (v) {
            case "file":
                return ConfigSnapshot.SourceMode.FILE;
            case "stream":
                return ConfigSnapshot.SourceMode.STREAM;
            case "test":
            case "test_pattern":
            case "testpattern":
                return ConfigSnapshot.SourceMode.TEST_PATTERN;
            case "black":
            default:
                return ConfigSnapshot.SourceMode.BLACK;
        }
    }

    private static String slurpFile(File f) throws Exception {
        StringBuilder sb = new StringBuilder((int) Math.min(f.length(), 64 * 1024));
        try (BufferedReader br = new BufferedReader(new FileReader(f))) {
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
        }
        return sb.toString();
    }
}
