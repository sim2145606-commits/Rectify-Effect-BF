package com.briefplantrain.virtucam.engine;

import android.graphics.SurfaceTexture;
import android.view.Surface;

import com.briefplantrain.virtucam.util.LogUtil;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class MappingManager {

    private static final String TAG = "VirtuCam/MappingManager";

    private final Map<Surface, SurfaceMapping> byOriginal = new ConcurrentHashMap<>();

    public Surface getDrainForOriginalOrNull(Surface original) {
        SurfaceMapping m = byOriginal.get(original);
        return m != null ? m.drainSurface : null;
    }

    public Surface mapRequestTargetSurface(Surface surface) {
        SurfaceMapping m = byOriginal.get(surface);
        return m != null ? m.drainSurface : surface;
    }

    public Surface getOrCreateDrainSurface(Surface original, SurfaceInfo info) {
        if (original == null) return null;

        SurfaceMapping existing = byOriginal.get(original);
        if (existing != null) return existing.drainSurface;

        SurfaceTexture st = null;
        Surface drain = null;

        try {
            st = new SurfaceTexture(0);
            if (info != null && info.width > 0 && info.height > 0) {
                st.setDefaultBufferSize(info.width, info.height);
            }
            drain = new Surface(st);

            SurfaceMapping mapping = new SurfaceMapping(original, drain, st, info);
            byOriginal.put(original, mapping);

            LogUtil.d(TAG, "Mapped surface: original=" + original + " -> drain=" + drain +
                    " kind=" + (info != null ? info.kind : SurfaceInfo.Kind.UNKNOWN) +
                    " size=" + (info != null ? (info.width + "x" + info.height) : "0x0"));

            return drain;
        } catch (Throwable t) {
            LogUtil.e(TAG, "Failed to create drain surface; leaving original", t);
            try { if (drain != null) drain.release(); } catch (Throwable ignored) {}
            try { if (st != null) st.release(); } catch (Throwable ignored) {}
            return original;
        }
    }

    public List<Surface> listOriginalSurfaces() {
        return new ArrayList<>(byOriginal.keySet());
    }

    public void removeMapping(Surface original) {
        SurfaceMapping m = byOriginal.remove(original);
        if (m == null) return;
        try { m.releaseDrain(); } catch (Throwable ignored) {}
    }

    public void releaseAll() {
        for (Surface s : listOriginalSurfaces()) {
            removeMapping(s);
        }
        byOriginal.clear();
    }

    private static final class SurfaceMapping {
        final Surface originalSurface;
        final Surface drainSurface;
        final SurfaceTexture drainSurfaceTexture;
        final SurfaceInfo info;

        SurfaceMapping(Surface originalSurface,
                       Surface drainSurface,
                       SurfaceTexture drainSurfaceTexture,
                       SurfaceInfo info) {
            this.originalSurface = originalSurface;
            this.drainSurface = drainSurface;
            this.drainSurfaceTexture = drainSurfaceTexture;
            this.info = info;
        }

        void releaseDrain() {
            try { if (drainSurface != null) drainSurface.release(); } catch (Throwable ignored) {}
            try { if (drainSurfaceTexture != null) drainSurfaceTexture.release(); } catch (Throwable ignored) {}
        }
    }
}
