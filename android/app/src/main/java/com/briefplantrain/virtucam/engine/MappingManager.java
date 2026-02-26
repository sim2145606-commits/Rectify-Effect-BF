package com.briefplantrain.virtucam.engine;

import android.view.Surface;

import com.briefplantrain.virtucam.util.LogUtil;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Surface mapping tracker — simplified VCAM-style.
 *
 * Tracks which surfaces belong to which category without creating
 * any ImageReader drains or EGL contexts. The actual frame delivery
 * is handled by VirtualCameraEngine.
 */
public final class MappingManager {

    private static final String TAG = "VirtuCam/Mapping";

    // Surface classification
    public enum SurfaceType {
        PREVIEW,         // SurfaceTexture-backed (camera preview)
        IMAGE_READER,    // ImageReader-backed (photo capture / analysis)
        SURFACE_HOLDER,  // SurfaceView/SurfaceHolder (Camera1)
        UNKNOWN
    }

    // surfaceId -> type mapping
    private final ConcurrentHashMap<Integer, SurfaceType> surfaceTypes = new ConcurrentHashMap<>();
    // surfaceId -> Surface reference (weak tracking)
    private final ConcurrentHashMap<Integer, Surface> surfaceRefs = new ConcurrentHashMap<>();

    // Throwaway surface tracking
    private volatile Surface throwawaySurface;

    public MappingManager() { }

    /** Register a surface with its classified type. */
    public void registerSurface(Surface surface, SurfaceType type) {
        if (surface == null) return;
        int id = System.identityHashCode(surface);
        surfaceTypes.put(id, type);
        surfaceRefs.put(id, surface);
        LogUtil.d(TAG, "Registered surface id=" + id + " type=" + type);
    }

    /** Unregister a surface being tracked. */
    public void unregisterSurface(Surface surface) {
        if (surface == null) return;
        int id = System.identityHashCode(surface);
        surfaceTypes.remove(id);
        surfaceRefs.remove(id);
    }

    /** Get the type of a tracked surface. */
    public SurfaceType getType(Surface surface) {
        if (surface == null) return SurfaceType.UNKNOWN;
        int id = System.identityHashCode(surface);
        SurfaceType type = surfaceTypes.get(id);
        return type != null ? type : SurfaceType.UNKNOWN;
    }

    /** Get all tracked surfaces of a specific type. */
    public List<Surface> getSurfacesByType(SurfaceType type) {
        List<Surface> result = new ArrayList<>();
        for (Map.Entry<Integer, SurfaceType> entry : surfaceTypes.entrySet()) {
            if (entry.getValue() == type) {
                Surface s = surfaceRefs.get(entry.getKey());
                if (s != null && s.isValid()) {
                    result.add(s);
                }
            }
        }
        return result;
    }

    /** Classify a surface based on its toString() output. */
    public static SurfaceType classifySurface(Surface surface) {
        if (surface == null) return SurfaceType.UNKNOWN;
        String str = surface.toString();
        if (str.contains("Surface(name=null)")) {
            return SurfaceType.IMAGE_READER;
        }
        return SurfaceType.PREVIEW;
    }

    /** Set the throwaway surface (camera writes here, frames discarded). */
    public void setThrowawaySurface(Surface surface) {
        throwawaySurface = surface;
    }

    /** Check if a surface is our throwaway. */
    public boolean isThrowawaySurface(Surface surface) {
        return surface != null && surface == throwawaySurface;
    }

    /** Clear all surface mappings (on new camera session). */
    public void clear() {
        surfaceTypes.clear();
        surfaceRefs.clear();
        LogUtil.d(TAG, "All surface mappings cleared");
    }

    /** Prune invalid (released) surfaces from tracking. */
    public void pruneInvalid() {
        List<Integer> toRemove = new ArrayList<>();
        for (Map.Entry<Integer, Surface> entry : surfaceRefs.entrySet()) {
            if (!entry.getValue().isValid()) {
                toRemove.add(entry.getKey());
            }
        }
        for (int id : toRemove) {
            surfaceTypes.remove(id);
            surfaceRefs.remove(id);
        }
        if (!toRemove.isEmpty()) {
            LogUtil.d(TAG, "Pruned " + toRemove.size() + " invalid surfaces");
        }
    }

    /** Get a debug summary string. */
    public String debugSummary() {
        int preview = 0, reader = 0, holder = 0, unknown = 0;
        for (SurfaceType t : surfaceTypes.values()) {
            switch (t) {
                case PREVIEW: preview++; break;
                case IMAGE_READER: reader++; break;
                case SURFACE_HOLDER: holder++; break;
                default: unknown++; break;
            }
        }
        return "preview=" + preview + ",reader=" + reader +
                ",holder=" + holder + ",unknown=" + unknown +
                ",throwaway=" + (throwawaySurface != null);
    }
}
