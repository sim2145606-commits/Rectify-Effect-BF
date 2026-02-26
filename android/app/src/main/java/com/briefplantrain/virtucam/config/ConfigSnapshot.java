package com.briefplantrain.virtucam.config;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

public final class ConfigSnapshot {

    public enum TargetMode { ALL, WHITELIST, BLACKLIST }
    public enum SourceMode { BLACK, FILE, STREAM, TEST_PATTERN }

    public boolean enabled = false;
    public SourceMode sourceMode = SourceMode.BLACK;
    public String mediaSourcePath = null;

    public String cameraTarget = "front";
    public boolean mirrored = false;
    public int rotation = 0;
    public float scaleX = 1f;
    public float scaleY = 1f;
    public float offsetX = 0f;
    public float offsetY = 0f;
    public String scaleMode = "fit";

    public TargetMode targetMode = TargetMode.ALL;
    public Set<String> targetPackages = Collections.emptySet();

    public boolean debug = false;
    public boolean aggressiveSurfaceReplace = false;
    public boolean vcamCompatibilityMode = false;
    public int fps = 30;

    public static ConfigSnapshot copyOf(ConfigSnapshot other) {
        ConfigSnapshot out = new ConfigSnapshot();
        if (other == null) return out;

        out.enabled = other.enabled;
        out.sourceMode = other.sourceMode;
        out.mediaSourcePath = other.mediaSourcePath;

        out.cameraTarget = other.cameraTarget;
        out.mirrored = other.mirrored;
        out.rotation = other.rotation;
        out.scaleX = other.scaleX;
        out.scaleY = other.scaleY;
        out.offsetX = other.offsetX;
        out.offsetY = other.offsetY;
        out.scaleMode = other.scaleMode;

        out.targetMode = other.targetMode;
        out.targetPackages = other.targetPackages == null
                ? Collections.emptySet()
                : new HashSet<>(other.targetPackages);

        out.debug = other.debug;
        out.aggressiveSurfaceReplace = other.aggressiveSurfaceReplace;
        out.vcamCompatibilityMode = other.vcamCompatibilityMode;
        out.fps = other.fps;
        return out;
    }

    public boolean isTargeted(String packageName) {
        if (packageName == null) return false;
        switch (targetMode) {
            case ALL:
                return true;
            case BLACKLIST:
                return !targetPackages.contains(packageName);
            case WHITELIST:
            default:
                return targetPackages.contains(packageName);
        }
    }

    public static Set<String> copyCsvToSet(String csv) {
        if (csv == null) return Collections.emptySet();
        String s = csv.trim();
        if (s.isEmpty()) return Collections.emptySet();

        String[] parts = s.split(",");
        Set<String> out = new HashSet<>();
        for (String p : parts) {
            String v = p != null ? p.trim() : "";
            if (!v.isEmpty()) out.add(v);
        }
        return out;
    }
}
