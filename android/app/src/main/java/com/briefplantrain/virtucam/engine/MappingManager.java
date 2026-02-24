package com.briefplantrain.virtucam.engine;

import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.view.Surface;

import com.briefplantrain.virtucam.util.LogUtil;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class MappingManager {

    private static final String TAG = "VirtuCam/MappingManager";

    private final Map<Surface, SurfaceMapping> byOriginal = new ConcurrentHashMap<>();
    private final Object drainLock = new Object();
    private HandlerThread drainThread;
    private Handler drainHandler;

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

        ImageReader reader = null;
        Surface drain = null;

        try {
            int width = info != null && info.width > 0 ? info.width : 1;
            int height = info != null && info.height > 0 ? info.height : 1;
            reader = ImageReader.newInstance(width, height, android.graphics.ImageFormat.PRIVATE, 4);
            reader.setOnImageAvailableListener(this::drainImageReader, getOrCreateDrainHandler());
            drain = reader.getSurface();

            SurfaceMapping mapping = new SurfaceMapping(original, drain, reader, info);
            SurfaceMapping raced = byOriginal.putIfAbsent(original, mapping);
            if (raced != null) {
                try { drain.release(); } catch (Throwable t) { LogUtil.w(TAG, "drain release failed", t); }
                try { reader.close(); } catch (Throwable t) { LogUtil.w(TAG, "reader close failed", t); }
                return raced.drainSurface;
            }

            LogUtil.d(TAG, "Mapped surface: original=" + original + " -> drain=" + drain +
                    " kind=" + (info != null ? info.kind : SurfaceInfo.Kind.UNKNOWN) +
                    " size=" + (info != null ? (info.width + "x" + info.height) : "0x0"));

            return drain;
        } catch (Throwable t) {
            LogUtil.e(TAG, "Failed to create drain surface; leaving original", t);
            try { if (drain != null) drain.release(); } catch (Throwable ignored) {}
            try { if (reader != null) reader.close(); } catch (Throwable ignored) {}
            return original;
        }
    }

    private Handler getOrCreateDrainHandler() {
        synchronized (drainLock) {
            if (drainThread == null) {
                drainThread = new HandlerThread("VirtuCam-DrainReader");
                drainThread.start();
                drainHandler = new Handler(drainThread.getLooper());
            }
            return drainHandler;
        }
    }

    private void drainImageReader(ImageReader reader) {
        if (reader == null) return;
        Image image = null;
        try {
            image = reader.acquireLatestImage();
        } catch (RuntimeException e) {
            LogUtil.w(TAG, "acquireLatestImage failed", e);
        } finally {
            if (image != null) {
                try { image.close(); } catch (Throwable ignored) {}
            }
        }
    }

    public List<Surface> listOriginalSurfaces() {
        return new ArrayList<>(byOriginal.keySet());
    }

    public boolean hasMappings() {
        return !byOriginal.isEmpty();
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

        synchronized (drainLock) {
            if (drainThread != null) {
                try { drainThread.quitSafely(); } catch (Throwable ignored) {}
                drainThread = null;
                drainHandler = null;
            }
        }
    }

    private static final class SurfaceMapping {
        final Surface originalSurface;
        final Surface drainSurface;
        final ImageReader drainImageReader;
        final SurfaceInfo info;

        SurfaceMapping(Surface originalSurface,
                       Surface drainSurface,
                       ImageReader drainImageReader,
                       SurfaceInfo info) {
            this.originalSurface = originalSurface;
            this.drainSurface = drainSurface;
            this.drainImageReader = drainImageReader;
            this.info = info;
        }

        void releaseDrain() {
            try { if (drainSurface != null) drainSurface.release(); } catch (Throwable ignored) {}
            try { if (drainImageReader != null) drainImageReader.close(); } catch (Throwable ignored) {}
        }
    }
}
