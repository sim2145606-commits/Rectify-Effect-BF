package com.briefplantrain.virtucam.engine;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.SurfaceTexture;
import android.media.MediaMetadataRetriever;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import android.view.Surface;

import com.briefplantrain.virtucam.config.ConfigLoader;
import com.briefplantrain.virtucam.config.ConfigSnapshot;
import com.briefplantrain.virtucam.render.EglRenderer;
import com.briefplantrain.virtucam.render.Transform;
import com.briefplantrain.virtucam.util.LogUtil;

import java.io.File;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

public final class VirtualCameraEngine {

    private static final String TAG = "VirtuCam/Engine";

    private static volatile VirtualCameraEngine INSTANCE;

    public static VirtualCameraEngine getOrCreate(String packageName, String processName) {
        if (INSTANCE != null) return INSTANCE;
        synchronized (VirtualCameraEngine.class) {
            if (INSTANCE == null) {
                INSTANCE = new VirtualCameraEngine(packageName, processName);
            }
            return INSTANCE;
        }
    }

    private final String packageName;
    private final String processName;

    private final ConfigLoader configLoader = new ConfigLoader(500);
    private final MappingManager mappingManager = new MappingManager();
    private final EglRenderer eglRenderer = new EglRenderer();

    private final HandlerThread engineThread = new HandlerThread("VirtuCamEngine");
    private Handler handler;
    private volatile boolean started = false;

    private final Map<Surface, SurfaceInfo> surfaceInfoBySurface = new ConcurrentHashMap<>();
    private final Map<SurfaceTexture, int[]> sizeBySurfaceTexture = new ConcurrentHashMap<>();
    private final Map<SurfaceTexture, CopyOnWriteArrayList<Surface>> surfacesBySurfaceTexture = new ConcurrentHashMap<>();

    private Bitmap blackFrame;
    private Bitmap testPattern;
    private String lastMediaPath;
    private Bitmap lastMediaBitmap;
    private long lastTestPatternMs;

    private VirtualCameraEngine(String packageName, String processName) {
        this.packageName = packageName;
        this.processName = processName != null ? processName : packageName;
    }

    public void start() {
        if (started) return;
        started = true;

        engineThread.start();
        handler = new Handler(engineThread.getLooper());

        handler.post(() -> LogUtil.d(TAG, "Engine started for pkg=" + packageName + " proc=" + processName));
        handler.post(renderLoop);
    }

    public void stop() {
        started = false;
        try {
            if (handler != null) handler.removeCallbacksAndMessages(null);
        } catch (Throwable ignored) {}
        try {
            mappingManager.releaseAll();
        } catch (Throwable ignored) {}
        try {
            eglRenderer.releaseAll();
        } catch (Throwable ignored) {}
        try {
            engineThread.quitSafely();
        } catch (Throwable ignored) {}
    }

    public SurfaceInfo inferSurfaceInfo(Surface surface) {
        SurfaceInfo info = surfaceInfoBySurface.get(surface);
        return info != null ? info : SurfaceInfo.unknown();
    }

    public void onSurfaceCreatedFromSurfaceTexture(Surface surface, SurfaceTexture st) {
        if (surface == null || st == null) return;

        int[] wh = sizeBySurfaceTexture.get(st);
        int w = wh != null ? wh[0] : 0;
        int h = wh != null ? wh[1] : 0;

        SurfaceInfo info = new SurfaceInfo(SurfaceInfo.Kind.SURFACE_TEXTURE, w, h, 0, "Surface(SurfaceTexture)");
        surfaceInfoBySurface.put(surface, info);

        surfacesBySurfaceTexture
                .computeIfAbsent(st, k -> new CopyOnWriteArrayList<>())
                .add(surface);
    }

    public void onSurfaceTextureBufferSize(SurfaceTexture st, int w, int h) {
        if (st == null) return;
        sizeBySurfaceTexture.put(st, new int[] { w, h });

        CopyOnWriteArrayList<Surface> list = surfacesBySurfaceTexture.get(st);
        if (list != null) {
            for (Surface s : list) {
                SurfaceInfo old = surfaceInfoBySurface.get(s);
                if (old != null) {
                    surfaceInfoBySurface.put(s, old.withSize(w, h));
                }
            }
        }
    }

    public Surface mapOutputSurface(Surface original, SurfaceInfo info) {
        ConfigSnapshot cfg = configLoader.getSnapshot();
        if (!cfg.enabled) return original;
        if (!cfg.isTargeted(packageName)) return original;

        SurfaceInfo i = (info != null) ? info : inferSurfaceInfo(original);
        if (i.kind == SurfaceInfo.Kind.UNKNOWN && (i.width <= 0 || i.height <= 0)) {
            i = new SurfaceInfo(
                    SurfaceInfo.Kind.UNKNOWN,
                    1280,
                    720,
                    i.format,
                    (i.note == null ? "" : i.note) + "|fallback_size");
        }

        final boolean replace;
        if (i.kind == SurfaceInfo.Kind.SURFACE_TEXTURE) {
            replace = true;
        } else if (i.kind == SurfaceInfo.Kind.UNKNOWN) {
            boolean unknownSizeLooksCameraLike =
                    i.width >= 320 && i.height >= 240 &&
                    i.width <= 4096 && i.height <= 4096;
            replace = cfg.aggressiveSurfaceReplace || unknownSizeLooksCameraLike;
            LogUtil.d(TAG, "Unknown surface decision: replace=" + replace +
                    " size=" + i.width + "x" + i.height +
                    " aggressive=" + cfg.aggressiveSurfaceReplace +
                    " note=" + i.note);
        } else {
            replace = false;
        }

        if (!replace) {
            LogUtil.d(TAG, "Skipping non-target surface kind=" + i.kind + " size=" + i.width + "x" + i.height);
            return original;
        }

        Surface mapped = mappingManager.getOrCreateDrainSurface(original, i);
        if (mapped == original) {
            LogUtil.d(TAG, "Surface mapping returned original surface; kind=" + i.kind + " size=" + i.width + "x" + i.height);
        }
        return mapped;
    }

    public Surface mapRequestTargetSurface(Surface surface) {
        return mappingManager.mapRequestTargetSurface(surface);
    }

    public void rollbackOutputSurfaceMapping(Surface original) {
        mappingManager.removeMapping(original);
    }

    public String getRoutingDebugSummary() {
        ConfigSnapshot cfg = configLoader.getSnapshot();
        int targetCount = cfg.targetPackages != null ? cfg.targetPackages.size() : 0;
        return "enabled=" + cfg.enabled +
                ",targeted=" + cfg.isTargeted(packageName) +
                ",targetMode=" + cfg.targetMode +
                ",targetPackages=" + targetCount +
                ",sourceMode=" + cfg.sourceMode +
                ",hasMedia=" + (cfg.mediaSourcePath != null && !cfg.mediaSourcePath.trim().isEmpty());
    }

    private final Runnable renderLoop = new Runnable() {
        @Override
        public void run() {
            try {
                renderOnce();
            } catch (Throwable t) {
                LogUtil.e(TAG, "renderOnce failed", t);
            }

            ConfigSnapshot cfg = configLoader.getSnapshot();
            int fps = cfg.fps > 0 ? cfg.fps : 30;
            long delayMs = Math.max(5, 1000 / fps);

            if (started && handler != null) {
                handler.postDelayed(this, delayMs);
            }
        }
    };

    private void renderOnce() {
        ConfigSnapshot cfg = configLoader.getSnapshot();
        if (!cfg.enabled) return;
        if (!cfg.isTargeted(packageName)) return;

        Bitmap frame = getFrameBitmap(cfg);
        if (frame == null) return;

        List<Surface> originals = mappingManager.listOriginalSurfaces();
        if (originals.isEmpty()) return;

        Transform t = Transform.identity();

        for (Surface s : originals) {
            if (s == null) continue;
            if (!s.isValid()) {
                mappingManager.removeMapping(s);
                eglRenderer.releaseSurface(s);
                continue;
            }
            eglRenderer.renderBitmap(s, frame, t);
        }
    }

    private Bitmap getFrameBitmap(ConfigSnapshot cfg) {
        switch (cfg.sourceMode) {
            case TEST_PATTERN:
                return getOrUpdateTestPattern();
            case FILE:
                if (cfg.mediaSourcePath != null) return getOrLoadMediaBitmap(cfg.mediaSourcePath);
                return getBlackFrame();
            case STREAM:
                if (cfg.mediaSourcePath != null) {
                    return getOrLoadMediaBitmap(cfg.mediaSourcePath);
                }
                LogUtil.d(TAG, "STREAM mode selected without mediaSourcePath; using black frame");
                return getBlackFrame();
            case BLACK:
            default:
                return getBlackFrame();
        }
    }

    private Bitmap getBlackFrame() {
        if (blackFrame != null) return blackFrame;
        Bitmap b = Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888);
        b.eraseColor(Color.BLACK);
        blackFrame = b;
        return b;
    }

    private Bitmap getOrUpdateTestPattern() {
        long now = SystemClock.uptimeMillis();
        if (testPattern != null && (now - lastTestPatternMs) < 500) return testPattern;

        Bitmap b = Bitmap.createBitmap(512, 256, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        c.drawColor(Color.DKGRAY);

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.WHITE);
        p.setTextSize(28f);

        c.drawText("VirtuCam TEST", 20, 50, p);
        c.drawText("pkg: " + packageName, 20, 95, p);
        c.drawText("t: " + now, 20, 140, p);

        testPattern = b;
        lastTestPatternMs = now;
        return b;
    }

    private Bitmap getOrLoadMediaBitmap(String path) {
        if (path == null) return getBlackFrame();
        if (path.equals(lastMediaPath) && lastMediaBitmap != null) return lastMediaBitmap;

        lastMediaPath = path;
        lastMediaBitmap = null;

        try {
            File f = new File(path).getCanonicalFile();
            if (!f.exists() || !f.canRead() || f.getPath().contains("..")) {
                LogUtil.d(TAG, "Media not readable: " + path + " -> using black");
                return getBlackFrame();
            }

            String lower = path.toLowerCase(Locale.ROOT);
            if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp")) {
                Bitmap b = BitmapFactory.decodeFile(path);
                lastMediaBitmap = (b != null) ? b : getBlackFrame();
                return lastMediaBitmap;
            }

            MediaMetadataRetriever mmr = new MediaMetadataRetriever();
            Bitmap b;
            try {
                mmr.setDataSource(f.getPath());
                b = mmr.getFrameAtTime(0);
            } finally {
                mmr.release();
            }

            lastMediaBitmap = (b != null) ? b : getBlackFrame();
            return lastMediaBitmap;

        } catch (Throwable t) {
            LogUtil.e(TAG, "Failed to load media bitmap; using black", t);
            return getBlackFrame();
        }
    }
}
