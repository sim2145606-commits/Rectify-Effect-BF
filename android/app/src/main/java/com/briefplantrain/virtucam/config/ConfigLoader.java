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
    public static final String PRIMARY_FALLBACK_JSON_PATH = VirtuCamIPC.PERSISTENT_JSON;
    public static final String PRIMARY_FALLBACK_JSON_PATH_LEGACY = VirtuCamIPC.PERSISTENT_JSON_LEGACY;
    public static final String IPC_FALLBACK_JSON_PATH = VirtuCamIPC.CONFIG_JSON;
    public static final String LEGACY_FALLBACK_JSON_PATH = VirtuCamIPC.LEGACY_TMP_JSON;
    private static final long MAX_CONFIG_SIZE_BYTES = 512 * 1024;
    private static final long LOG_RATE_LIMIT_MS = 30_000L;
    private static final long XSP_FAILURE_COOLDOWN_MS = 30_000L;
    private static final int FIRST_APPLICATION_UID = 10000;

    private final long reloadIntervalMs;
    private final boolean appUidProcess;
    private volatile long lastLoadMs = 0;
    private volatile long xspRetryAfterMs = 0L;

    private final AtomicReference<ConfigSnapshot> cached =
            new AtomicReference<>(new ConfigSnapshot());

    private volatile String lastJsonSourcePath = "";
    private volatile long lastJsonModified = -1L;
    private volatile long lastJsonSize = -1L;
    private volatile JsonOverlay lastJsonOverlay = null;

    public ConfigLoader(long reloadIntervalMs) {
        this.reloadIntervalMs = Math.max(250, reloadIntervalMs);
        this.appUidProcess = android.os.Process.myUid() >= FIRST_APPLICATION_UID;
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
        ConfigSnapshot previous = cached.get();
        try {
            ConfigSnapshot snap = loadOnce(previous);
            cached.set(snap);
        } catch (Throwable t) {
            cached.set(previous != null ? previous : new ConfigSnapshot());
            logRateLimitedError("reload_failed", t);
        }
    }

    private ConfigSnapshot loadOnce(ConfigSnapshot previous) {
        ConfigSnapshot snap = ConfigSnapshot.copyOf(previous);
        boolean sourceModeExplicit = false;
        JsonOverlay overlay = loadJsonOverlayWithPriority();
        if (overlay != null) {
            applyOverlay(snap, overlay);
            sourceModeExplicit = sourceModeExplicit || overlay.sourceModeExplicit;
        } else {
            sourceModeExplicit = loadFromSharedPrefs(snap);
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

    private boolean loadFromSharedPrefs(ConfigSnapshot snap) {
        boolean sourceModeExplicit = false;
        long now = SystemClock.uptimeMillis();
        if (now < xspRetryAfterMs) {
            return false;
        }
        try {
            XSharedPreferences prefs = new XSharedPreferences(MODULE_PACKAGE, PREFS_FILE);
            prefs.reload();

            snap.enabled = prefs.getBoolean("enabled", snap.enabled);

            String sourceMode = prefs.getString("sourceMode", null);
            if (sourceMode != null) {
                snap.sourceMode = parseSourceMode(sourceMode, snap.sourceMode);
                sourceModeExplicit = true;
            }

            String mediaPath = prefs.getString("mediaSourcePath", null);
            if (mediaPath != null && mediaPath.trim().isEmpty()) mediaPath = null;
            snap.mediaSourcePath = mediaPath != null ? mediaPath : snap.mediaSourcePath;

            snap.cameraTarget = prefs.getString("cameraTarget", snap.cameraTarget);
            snap.mirrored = prefs.getBoolean("mirrored", snap.mirrored);
            snap.rotation = prefs.getInt("rotation", snap.rotation);
            snap.scaleX = prefs.getFloat("scaleX", snap.scaleX);
            snap.scaleY = prefs.getFloat("scaleY", snap.scaleY);
            snap.offsetX = prefs.getFloat("offsetX", snap.offsetX);
            snap.offsetY = prefs.getFloat("offsetY", snap.offsetY);
            snap.scaleMode = prefs.getString("scaleMode", snap.scaleMode);

            String targetMode = prefs.getString("targetMode", null);
            if (targetMode != null) {
                snap.targetMode = parseTargetMode(targetMode, snap.targetMode);
            }

            String csv = prefs.getString("targetPackages", "");
            Set<String> set = ConfigSnapshot.copyCsvToSet(csv);
            snap.targetPackages = set;

            snap.debug = prefs.getBoolean("debug", snap.debug);
            snap.aggressiveSurfaceReplace =
                    prefs.getBoolean("aggressiveSurfaceReplace", snap.aggressiveSurfaceReplace);
            if (prefs.contains("vcamCompatibilityMode")) {
                snap.vcamCompatibilityMode =
                        prefs.getBoolean("vcamCompatibilityMode", snap.vcamCompatibilityMode);
            } else {
                String compatibilityMode = prefs.getString("compatibilityMode", null);
                if (compatibilityMode != null) {
                    snap.vcamCompatibilityMode =
                            parseCompatibilityMode(compatibilityMode, snap.vcamCompatibilityMode);
                }
            }
            snap.fps = prefs.getInt("fps", snap.fps);
            xspRetryAfterMs = 0L;
        } catch (Throwable t) {
            xspRetryAfterMs = now + XSP_FAILURE_COOLDOWN_MS;
            logRateLimitedError("xsharedprefs_load_failed", t);
        }
        return sourceModeExplicit;
    }

    private JsonOverlay loadJsonOverlayWithPriority() {
        final String[] candidates = buildJsonCandidates();

        for (String candidate : candidates) {
            try {
                File file = new File(candidate).getCanonicalFile();
                String canonicalPath = file.getPath();
                if (!isAllowedFallbackPath(canonicalPath)) {
                    throw new SecurityException("invalid_path");
                }
                if (!file.exists() || !file.canRead()) {
                    continue;
                }

                long size = file.length();
                long modified = file.lastModified();
                if (size > MAX_CONFIG_SIZE_BYTES) {
                    throw new IllegalStateException("file_too_large");
                }

                JsonOverlay cachedOverlay = lastJsonOverlay;
                if (cachedOverlay != null
                        && canonicalPath.equals(lastJsonSourcePath)
                        && modified == lastJsonModified
                        && size == lastJsonSize) {
                    return cachedOverlay;
                }

                String text = slurpFile(file);
                JsonOverlay parsed = parseJsonOverlay(new JSONObject(text));

                lastJsonSourcePath = canonicalPath;
                lastJsonModified = modified;
                lastJsonSize = size;
                lastJsonOverlay = parsed;

                LogUtil.d(TAG, "Loaded JSON fallback from: " + canonicalPath);
                return parsed;
            } catch (Throwable t) {
                String code = "json_load_failed:" + sanitizeErrorClass(t);
                logRateLimitedError(code, t);
            }
        }
        return null;
    }

    private String[] buildJsonCandidates() {
        if (appUidProcess) {
            // App UIDs should avoid /data/adb probing to prevent repeated SELinux denials.
            return new String[]{
                    IPC_FALLBACK_JSON_PATH,
                    LEGACY_FALLBACK_JSON_PATH
            };
        }
        return new String[]{
                IPC_FALLBACK_JSON_PATH,
                LEGACY_FALLBACK_JSON_PATH,
                PRIMARY_FALLBACK_JSON_PATH,
                PRIMARY_FALLBACK_JSON_PATH_LEGACY
        };
    }

    private static boolean isAllowedFallbackPath(String canonicalPath) {
        return VirtuCamIPC.PERSISTENT_JSON.equals(canonicalPath)
                || VirtuCamIPC.PERSISTENT_JSON_LEGACY.equals(canonicalPath)
                || VirtuCamIPC.CONFIG_JSON.equals(canonicalPath)
                || VirtuCamIPC.LEGACY_TMP_JSON.equals(canonicalPath);
    }

    private static JsonOverlay parseJsonOverlay(JSONObject j) {
        JsonOverlay out = new JsonOverlay();
        out.enabled = j.has("enabled") ? j.optBoolean("enabled") : null;

        if (j.has("sourceMode")) {
            out.sourceModeExplicit = true;
            out.sourceModeRaw = j.optString("sourceMode", "");
        }

        if (j.has("mediaSourcePath")) {
            out.hasMediaSourcePath = true;
            String path = j.optString("mediaSourcePath", null);
            if (path != null && path.trim().isEmpty()) path = null;
            out.mediaSourcePath = path;
        }

        out.cameraTarget = j.has("cameraTarget") ? j.optString("cameraTarget", null) : null;
        out.mirrored = j.has("mirrored") ? j.optBoolean("mirrored") : null;
        out.rotation = j.has("rotation") ? j.optInt("rotation") : null;

        out.scaleX = j.has("scaleX") ? (float) j.optDouble("scaleX") : null;
        out.scaleY = j.has("scaleY") ? (float) j.optDouble("scaleY") : null;
        out.offsetX = j.has("offsetX") ? (float) j.optDouble("offsetX") : null;
        out.offsetY = j.has("offsetY") ? (float) j.optDouble("offsetY") : null;

        out.scaleMode = j.has("scaleMode") ? j.optString("scaleMode", null) : null;
        out.targetModeRaw = j.has("targetMode") ? j.optString("targetMode", "") : null;
        out.targetPackagesCsv = j.has("targetPackages") ? j.optString("targetPackages", "") : null;

        out.debug = j.has("debug") ? j.optBoolean("debug") : null;
        out.aggressiveSurfaceReplace = j.has("aggressiveSurfaceReplace")
                ? j.optBoolean("aggressiveSurfaceReplace")
                : null;
        if (j.has("vcamCompatibilityMode")) {
            out.vcamCompatibilityMode = j.optBoolean("vcamCompatibilityMode");
        } else if (j.has("compatibilityMode")) {
            out.vcamCompatibilityMode =
                    parseCompatibilityMode(j.optString("compatibilityMode", ""), false);
        }
        out.fps = j.has("fps") ? j.optInt("fps") : null;
        return out;
    }

    private static void applyOverlay(ConfigSnapshot snap, JsonOverlay overlay) {
        if (overlay == null) return;
        if (overlay.enabled != null) snap.enabled = overlay.enabled;
        if (overlay.sourceModeRaw != null) {
            snap.sourceMode = parseSourceMode(overlay.sourceModeRaw, snap.sourceMode);
        }
        if (overlay.hasMediaSourcePath) {
            snap.mediaSourcePath = overlay.mediaSourcePath;
        }
        if (overlay.cameraTarget != null) snap.cameraTarget = overlay.cameraTarget;
        if (overlay.mirrored != null) snap.mirrored = overlay.mirrored;
        if (overlay.rotation != null) snap.rotation = overlay.rotation;
        if (overlay.scaleX != null) snap.scaleX = overlay.scaleX;
        if (overlay.scaleY != null) snap.scaleY = overlay.scaleY;
        if (overlay.offsetX != null) snap.offsetX = overlay.offsetX;
        if (overlay.offsetY != null) snap.offsetY = overlay.offsetY;
        if (overlay.scaleMode != null) snap.scaleMode = overlay.scaleMode;
        if (overlay.targetModeRaw != null) {
            snap.targetMode = parseTargetMode(overlay.targetModeRaw, snap.targetMode);
        }
        if (overlay.targetPackagesCsv != null) {
            snap.targetPackages = ConfigSnapshot.copyCsvToSet(overlay.targetPackagesCsv);
        }
        if (overlay.debug != null) snap.debug = overlay.debug;
        if (overlay.aggressiveSurfaceReplace != null) {
            snap.aggressiveSurfaceReplace = overlay.aggressiveSurfaceReplace;
        }
        if (overlay.vcamCompatibilityMode != null) {
            snap.vcamCompatibilityMode = overlay.vcamCompatibilityMode;
        }
        if (overlay.fps != null) snap.fps = overlay.fps;
    }

    private static void logRateLimitedError(String code, Throwable t) {
        String summary = sanitizeErrorClass(t) + ":" + sanitizeErrorMessage(t);
        LogUtil.iRateLimited("cfgloader-error:" + code + ":" + summary, LOG_RATE_LIMIT_MS, TAG,
                "Config load issue [" + code + "] " + summary);
    }

    private static String sanitizeErrorClass(Throwable t) {
        if (t == null) return "unknown";
        return t.getClass().getSimpleName();
    }

    private static String sanitizeErrorMessage(Throwable t) {
        if (t == null || t.getMessage() == null) return "no_message";
        return t.getMessage().replace('\n', ' ').replace('\r', ' ').trim();
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

    private static boolean parseCompatibilityMode(String s, boolean def) {
        if (s == null) return def;
        String v = s.trim().toLowerCase(Locale.ROOT);
        switch (v) {
            case "vcam":
            case "strict":
            case "true":
            case "on":
            case "enabled":
                return true;
            case "off":
            case "false":
            case "disabled":
            case "auto":
            default:
                return false;
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

    private static final class JsonOverlay {
        Boolean enabled;
        String sourceModeRaw;
        boolean sourceModeExplicit;
        boolean hasMediaSourcePath;
        String mediaSourcePath;

        String cameraTarget;
        Boolean mirrored;
        Integer rotation;
        Float scaleX;
        Float scaleY;
        Float offsetX;
        Float offsetY;
        String scaleMode;

        String targetModeRaw;
        String targetPackagesCsv;

        Boolean debug;
        Boolean aggressiveSurfaceReplace;
        Boolean vcamCompatibilityMode;
        Integer fps;
    }
}
