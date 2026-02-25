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
    private static final long IDLE_DELAY_INACTIVE_MS = 2000L;
    private static final long IDLE_DELAY_NO_MAPPINGS_MS = 900L;

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

    private final ConfigLoader configLoader = new ConfigLoader(2000);
    private final MappingManager mappingManager = new MappingManager();
    private final EglRenderer eglRenderer = new EglRenderer();
    private final Object routeLock = new Object();
    private final Map<Surface, Surface> compatibilityAliases = new ConcurrentHashMap<>();
    private Surface compatibilityTakeoverSurface;

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
    private long lastMediaAttemptMs;
    private String lastMediaAttemptPath;
    private long lastTestPatternMs;
    private volatile ConfigSnapshot.SourceMode lastEffectiveSourceMode = ConfigSnapshot.SourceMode.BLACK;

    private VirtualCameraEngine(String packageName, String processName) {
        this.packageName = packageName;
        this.processName = processName != null ? processName : packageName;
    }

    public void start() {
        ensureStarted();
    }

    public void ensureStarted() {
        if (started) return;
        synchronized (this) {
            if (started) return;
            if (handler == null) {
                if (engineThread.getState() == Thread.State.NEW) {
                    engineThread.start();
                } else if (!engineThread.isAlive()) {
                    LogUtil.w(TAG, "Engine thread unavailable; skip start");
                    return;
                }
                handler = new Handler(engineThread.getLooper());
            }
            started = true;
            handler.post(() -> LogUtil.d(TAG, "Engine started for pkg=" + packageName + " proc=" + processName));
            handler.post(renderLoop);
        }
    }

    public void stop() {
        started = false;
        try {
            if (handler != null) handler.removeCallbacksAndMessages(null);
        } catch (Throwable ignored) {}
        handler = null;
        try {
            synchronized (routeLock) {
                clearVcamCompatibilityAliasesLocked();
                mappingManager.releaseAll();
            }
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
        if (!cfg.enabled || !cfg.isTargeted(packageName)) {
            synchronized (routeLock) {
                clearVcamCompatibilityAliasesLocked();
            }
            return original;
        }
        ensureStarted();

        synchronized (routeLock) {
            SurfaceInfo i = (info != null) ? info : inferSurfaceInfo(original);
            boolean hasKnownSize = i.width > 0 && i.height > 0;

            final boolean replace;
            if (i.kind == SurfaceInfo.Kind.SURFACE_TEXTURE) {
                replace = true;
            } else if (i.kind == SurfaceInfo.Kind.UNKNOWN) {
                boolean unknownSizeLooksCameraLike =
                        hasKnownSize &&
                        i.width >= 320 && i.height >= 240 &&
                        i.width <= 4096 && i.height <= 4096;
                replace = cfg.aggressiveSurfaceReplace || unknownSizeLooksCameraLike;
                LogUtil.dRateLimited(
                        "unknown-surface-decision",
                        5000L,
                        TAG,
                        "Unknown surface decision: replace=" + replace +
                                " size=" + i.width + "x" + i.height +
                                " aggressive=" + cfg.aggressiveSurfaceReplace +
                                " note=" + i.note
                );
            } else {
                replace = false;
            }

            if (!replace) {
                LogUtil.dRateLimited(
                        "skip-non-target-surface",
                        5000L,
                        TAG,
                        "Skipping non-target surface kind=" + i.kind + " size=" + i.width + "x" + i.height
                );
                return original;
            }

            if (!hasKnownSize) {
                i = new SurfaceInfo(
                        i.kind,
                        1280,
                        720,
                        i.format,
                        (i.note == null ? "" : i.note) + "|fallback_size");
            }

            Surface mapped = mappingManager.getOrCreateDrainSurface(original, i);
            if (mapped == original) {
                LogUtil.dRateLimited(
                        "mapping-returned-original",
                        5000L,
                        TAG,
                        "Surface mapping returned original surface; kind=" + i.kind + " size=" + i.width + "x" + i.height
                );
            }
            return mapped;
        }
    }

    public Surface mapRequestTargetSurface(Surface surface) {
        ConfigSnapshot cfg = configLoader.getSnapshot();
        if (!cfg.enabled || !cfg.isTargeted(packageName)) {
            synchronized (routeLock) {
                clearVcamCompatibilityAliasesLocked();
            }
            return surface;
        }
        ensureStarted();

        synchronized (routeLock) {
            if (compatibilityTakeoverSurface != null) {
                Surface aliased = compatibilityAliases.get(surface);
                if (aliased != null) {
                    return aliased;
                }
                return compatibilityTakeoverSurface;
            }
            return mappingManager.mapRequestTargetSurface(surface);
        }
    }

    public void rollbackOutputSurfaceMapping(Surface original) {
        synchronized (routeLock) {
            if (original != null) {
                compatibilityAliases.remove(original);
            }
            if (compatibilityAliases.isEmpty()) {
                compatibilityTakeoverSurface = null;
            }
            mappingManager.removeMapping(original);
        }
    }

    public boolean isVcamCompatibilityModeEnabled() {
        ConfigSnapshot cfg = configLoader.getSnapshot();
        return cfg.enabled && cfg.vcamCompatibilityMode && cfg.isTargeted(packageName);
    }

    public void enableVcamCompatibilityAliases(List<Surface> originals, Surface takeoverSurface) {
        synchronized (routeLock) {
            clearVcamCompatibilityAliasesLocked();
            if (takeoverSurface == null) return;
            compatibilityTakeoverSurface = takeoverSurface;
            if (originals == null) return;
            for (Surface s : originals) {
                if (s != null) {
                    compatibilityAliases.put(s, takeoverSurface);
                }
            }
        }
    }

    public void clearVcamCompatibilityAliases() {
        synchronized (routeLock) {
            clearVcamCompatibilityAliasesLocked();
        }
    }

    private void clearVcamCompatibilityAliasesLocked() {
        compatibilityAliases.clear();
        compatibilityTakeoverSurface = null;
    }

    public String getRoutingDebugSummary() {
        ConfigSnapshot cfg = configLoader.getSnapshot();
        int targetCount = cfg.targetPackages != null ? cfg.targetPackages.size() : 0;
        return "enabled=" + cfg.enabled +
                ",targeted=" + cfg.isTargeted(packageName) +
                ",targetMode=" + cfg.targetMode +
                ",targetPackages=" + targetCount +
                ",sourceModeDesired=" + cfg.sourceMode +
                ",sourceModeEffective=" + lastEffectiveSourceMode +
                ",vcamCompat=" + cfg.vcamCompatibilityMode +
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
            boolean activeRoute = cfg.enabled && cfg.isTargeted(packageName);
            boolean hasMappings;
            synchronized (routeLock) {
                hasMappings = mappingManager.hasMappings();
            }
            long delayMs;
            if (!activeRoute) {
                delayMs = IDLE_DELAY_INACTIVE_MS;
            } else if (!hasMappings) {
                delayMs = IDLE_DELAY_NO_MAPPINGS_MS;
            } else {
                delayMs = Math.max(5, 1000 / fps);
            }

            if (started && handler != null) {
                handler.postDelayed(this, delayMs);
            }
        }
    };

    private void renderOnce() {
        ConfigSnapshot cfg = configLoader.getSnapshot();
        if (!cfg.enabled) return;
        if (!cfg.isTargeted(packageName)) return;

        List<Surface> originals;
        synchronized (routeLock) {
            originals = mappingManager.listOriginalSurfaces();
        }
        if (originals.isEmpty()) return;

        Bitmap frame = getFrameBitmap(cfg);
        if (frame == null) return;

        Transform t = Transform.identity();

        for (Surface s : originals) {
            if (s == null) continue;
            if (!s.isValid()) {
                synchronized (routeLock) {
                    mappingManager.removeMapping(s);
                }
                eglRenderer.releaseSurface(s);
                continue;
            }
            eglRenderer.renderBitmap(s, frame, t);
        }
    }

    private Bitmap getFrameBitmap(ConfigSnapshot cfg) {
        switch (cfg.sourceMode) {
            case TEST_PATTERN:
                lastEffectiveSourceMode = ConfigSnapshot.SourceMode.TEST_PATTERN;
                return getOrUpdateTestPattern();
            case FILE:
                if (cfg.mediaSourcePath != null) {
                    Bitmap media = getOrLoadMediaBitmap(cfg.mediaSourcePath);
                    if (media != null) {
                        lastEffectiveSourceMode = ConfigSnapshot.SourceMode.FILE;
                        return media;
                    }
                }
                lastEffectiveSourceMode = ConfigSnapshot.SourceMode.BLACK;
                return getBlackFrame();
            case STREAM:
                if (cfg.mediaSourcePath != null) {
                    Bitmap stream = getOrLoadMediaBitmap(cfg.mediaSourcePath);
                    if (stream != null) {
                        lastEffectiveSourceMode = ConfigSnapshot.SourceMode.STREAM;
                        return stream;
                    }
                }
                LogUtil.iRateLimited(
                        "stream-without-media",
                        10000L,
                        TAG,
                        "STREAM mode selected without mediaSourcePath; using black frame"
                );
                lastEffectiveSourceMode = ConfigSnapshot.SourceMode.BLACK;
                return getBlackFrame();
            case BLACK:
            default:
                lastEffectiveSourceMode = ConfigSnapshot.SourceMode.BLACK;
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
        if (path == null) return null;
        if (path.equals(lastMediaPath) && lastMediaBitmap != null) return lastMediaBitmap;

        long now = SystemClock.uptimeMillis();
        if (path.equals(lastMediaAttemptPath) && lastMediaBitmap == null && (now - lastMediaAttemptMs) < 1500L) {
            return null;
        }

        lastMediaAttemptPath = path;
        lastMediaAttemptMs = now;
        lastMediaPath = path;
        lastMediaBitmap = null;

        try {
            File f = new File(path).getCanonicalFile();
            if (!f.exists() || !f.canRead() || f.getPath().contains("..")) {
                LogUtil.dRateLimited(
                        "media-unreadable:" + path,
                        3000L,
                        TAG,
                        "Media not readable; forcing BLACK frame path=" + path
                );
                return null;
            }

            String lower = path.toLowerCase(Locale.ROOT);
            if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp")) {
                Bitmap b = BitmapFactory.decodeFile(path);
                lastMediaBitmap = b;
                if (b == null) {
                    LogUtil.iRateLimited(
                            "media-decode-null:image",
                            3000L,
                            TAG,
                            "Image decode returned null; forcing BLACK frame"
                    );
                }
                return b;
            }

            MediaMetadataRetriever mmr = new MediaMetadataRetriever();
            Bitmap b;
            try {
                mmr.setDataSource(f.getPath());
                b = mmr.getFrameAtTime(0);
            } finally {
                mmr.release();
            }

            lastMediaBitmap = b;
            if (b == null) {
                LogUtil.iRateLimited(
                        "media-decode-null:video",
                        3000L,
                        TAG,
                        "Video warm-up returned null frame; forcing BLACK frame"
                );
            }
            return b;

        } catch (Throwable t) {
            LogUtil.iRateLimited(
                    "media-load-failed:" + t.getClass().getSimpleName(),
                    3000L,
                    TAG,
                    "Failed to load media bitmap; forcing BLACK frame (" + t.getClass().getSimpleName() + ")"
            );
            return null;
        }
    }
}
