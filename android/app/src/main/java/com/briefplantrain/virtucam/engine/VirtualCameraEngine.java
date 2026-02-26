package com.briefplantrain.virtucam.engine;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ImageFormat;
import android.graphics.Paint;
import android.graphics.SurfaceTexture;
import android.media.Image;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMetadataRetriever;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import android.view.Surface;
import android.view.SurfaceHolder;

import com.briefplantrain.virtucam.config.ConfigLoader;
import com.briefplantrain.virtucam.config.ConfigSnapshot;
import com.briefplantrain.virtucam.render.EglRenderer;
import com.briefplantrain.virtucam.render.Transform;
import com.briefplantrain.virtucam.util.LogUtil;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Virtual camera engine — VCAM-style frame delivery model.
 *
 * Architecture:
 *   - Camera2 preview surfaces: fed via MediaPlayer (video) or EglRenderer (static image)
 *   - Camera2 ImageReader surfaces: fed via MediaCodec (proper YUV/JPEG output)
 *   - Camera1 SurfaceTexture/SurfaceHolder: fed via MediaPlayer
 *   - Camera1 onPreviewFrame byte[]: fed via MediaCodec -> NV21 extraction
 *
 * The throwaway surface is a SurfaceTexture(15) that receives real camera data
 * and discards it. The app's original surfaces receive our virtual content.
 */
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
    private final ConfigLoader configLoader = new ConfigLoader(2000);

    // Throwaway surface — camera writes here (frames discarded)
    private volatile Surface throwawaySurface;
    private volatile SurfaceTexture throwawaySurfaceTexture;

    // Camera2: tracked original surfaces classified by type
    private final CopyOnWriteArrayList<Surface> previewSurfaces = new CopyOnWriteArrayList<>();
    private final CopyOnWriteArrayList<Surface> readerSurfaces = new CopyOnWriteArrayList<>();

    // Camera1: stored originals
    private volatile SurfaceTexture camera1OriginalTexture;
    private volatile SurfaceHolder camera1OriginalHolder;

    // ImageReader metadata (from ImageReader.newInstance hook)
    private volatile int imageReaderWidth = 1920;
    private volatile int imageReaderHeight = 1080;
    private volatile int imageReaderFormat = ImageFormat.YUV_420_888;

    // MediaPlayer instances for preview surface playback
    private final Object playerLock = new Object();
    private MediaPlayer previewPlayer;
    private MediaPlayer previewPlayer2; // for second preview surface
    private MediaPlayer camera1Player;

    // MediaCodec decoder for ImageReader surface + Camera1 byte buffer
    private final Object decoderLock = new Object();
    private MediaCodec readerDecoder;
    private MediaExtractor readerExtractor;
    private volatile boolean readerDecoderRunning = false;

    // Camera1 byte-buffer decoder
    private volatile MediaCodec camera1Decoder;
    private volatile MediaExtractor camera1Extractor;
    private volatile boolean camera1DecoderRunning = false;
    private volatile byte[] camera1DataBuffer; // NV21 frame for onPreviewFrame injection
    private int camera1Width = 640;
    private int camera1Height = 480;

    // EglRenderer for static image delivery to surfaces
    private final EglRenderer eglRenderer = new EglRenderer();

    // State
    private volatile boolean playbackStarted = false;
    private volatile String lastMediaPath;
    private volatile Bitmap lastMediaBitmap;

    // Static image / fallback rendering thread
    private HandlerThread renderThread;
    private Handler renderHandler;

    private VirtualCameraEngine(String packageName, String processName) {
        this.packageName = packageName;
        this.processName = processName != null ? processName : packageName;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Public API called by XposedEntry
    // ──────────────────────────────────────────────────────────────────────

    /** Check if the hook is active for this package. */
    public boolean isActive() {
        ConfigSnapshot cfg = configLoader.getSnapshot();
        return cfg.enabled && cfg.isTargeted(packageName);
    }

    /** Get or create the throwaway surface (camera writes here, frames discarded). */
    public Surface getOrCreateThrowawaySurface() {
        if (throwawaySurface != null && throwawaySurface.isValid()) return throwawaySurface;
        synchronized (this) {
            if (throwawaySurface != null && throwawaySurface.isValid()) return throwawaySurface;
            throwawaySurfaceTexture = new SurfaceTexture(15);
            throwawaySurfaceTexture.setDefaultBufferSize(1, 1);
            throwawaySurface = new Surface(throwawaySurfaceTexture);
            LogUtil.d(TAG, "Created throwaway surface");
            return throwawaySurface;
        }
    }

    /** Called when CameraManager.openCamera succeeds — reset state for new session. */
    public void onCameraOpened() {
        LogUtil.d(TAG, "Camera opened — resetting session state");
        stopAllPlayback();
        previewSurfaces.clear();
        readerSurfaces.clear();
        playbackStarted = false;
    }

    /** Called when ImageReader.newInstance is hooked — capture format/size. */
    public void onImageReaderCreated(int width, int height, int format) {
        imageReaderWidth = width;
        imageReaderHeight = height;
        imageReaderFormat = format;
    }

    /**
     * Track original surfaces for later frame delivery.
     * Called during createCaptureSession before surfaces are replaced.
     */
    public void trackOriginalSurfaces(List<Surface> surfaces) {
        if (surfaces == null) return;
        for (Surface s : surfaces) {
            if (s == null || !s.isValid()) continue;

            // Classify: "Surface(name=null)" = ImageReader surface
            String str = s.toString();
            boolean isImageReader = str.contains("Surface(name=null)");

            if (isImageReader) {
                if (!readerSurfaces.contains(s)) {
                    readerSurfaces.addIfAbsent(s);
                    LogUtil.d(TAG, "Tracked ImageReader surface: " + str);
                }
            } else {
                if (!previewSurfaces.contains(s)) {
                    previewSurfaces.addIfAbsent(s);
                    LogUtil.d(TAG, "Tracked preview surface: " + str);
                }
            }
        }
    }

    /** Classify and store a surface from addTarget. */
    public void classifyAndStoreSurface(Surface surface, boolean isImageReader) {
        if (surface == null) return;
        if (isImageReader) {
            readerSurfaces.addIfAbsent(surface);
        } else {
            previewSurfaces.addIfAbsent(surface);
        }
    }

    /** Remove a surface from tracking when removeTarget is called. */
    public void onSurfaceRemoved(Surface surface) {
        if (surface == null) return;
        previewSurfaces.remove(surface);
        readerSurfaces.remove(surface);
    }

    /**
     * Called when CaptureRequest.Builder.build() fires.
     * This is the trigger to start delivering frames to the app's original surfaces.
     */
    public void onCaptureRequestBuild() {
        if (playbackStarted) return;
        playbackStarted = true;

        LogUtil.i(TAG, "CaptureRequest.build() — starting frame delivery. " +
                "previewSurfaces=" + previewSurfaces.size() +
                " readerSurfaces=" + readerSurfaces.size());

        startFrameDelivery();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Camera1 API
    // ──────────────────────────────────────────────────────────────────────

    public void storeCamera1OriginalTexture(SurfaceTexture original) {
        camera1OriginalTexture = original;
    }

    public void storeCamera1OriginalHolder(SurfaceHolder holder) {
        camera1OriginalHolder = holder;
    }

    /** Start playback on Camera1 original surface via MediaPlayer. */
    public void startCamera1Playback() {
        ConfigSnapshot cfg = configLoader.getSnapshot();
        String mediaPath = cfg.mediaSourcePath;
        if (mediaPath == null || mediaPath.trim().isEmpty()) {
            LogUtil.d(TAG, "Camera1: no media path configured");
            return;
        }

        ensureRenderThread();
        renderHandler.post(() -> {
            try {
                // Build surface from Camera1 originals
                Surface targetSurface = null;
                if (camera1OriginalTexture != null) {
                    targetSurface = new Surface(camera1OriginalTexture);
                } else if (camera1OriginalHolder != null) {
                    targetSurface = camera1OriginalHolder.getSurface();
                }
                if (targetSurface == null || !targetSurface.isValid()) {
                    LogUtil.w(TAG, "Camera1: no valid original surface for playback");
                    return;
                }

                String lower = mediaPath.toLowerCase(Locale.ROOT);
                boolean isVideo = lower.endsWith(".mp4") || lower.endsWith(".mkv") ||
                        lower.endsWith(".webm") || lower.endsWith(".avi") ||
                        lower.endsWith(".3gp");
                boolean isStream = lower.startsWith("http://") || lower.startsWith("https://") ||
                        lower.startsWith("rtsp://");

                if (isVideo || isStream) {
                    startMediaPlayerOnSurface(targetSurface, mediaPath, true);
                } else {
                    // Static image — render via EGL
                    renderStaticImageToSurface(targetSurface, mediaPath);
                }
                LogUtil.i(TAG, "Camera1 playback started: " + mediaPath);
            } catch (Throwable t) {
                LogUtil.e(TAG, "Camera1 playback failed", t);
            }
        });
    }

    /** Ensure Camera1 MediaCodec decoder is running for byte-buffer NV21 extraction. */
    public void ensureCamera1Decoder(int width, int height) {
        if (camera1DecoderRunning && camera1Width == width && camera1Height == height) return;
        camera1Width = width;
        camera1Height = height;

        ConfigSnapshot cfg = configLoader.getSnapshot();
        String mediaPath = cfg.mediaSourcePath;
        if (mediaPath == null || mediaPath.trim().isEmpty()) return;

        String lower = mediaPath.toLowerCase(Locale.ROOT);
        boolean isVideo = lower.endsWith(".mp4") || lower.endsWith(".mkv") ||
                lower.endsWith(".webm") || lower.endsWith(".3gp");
        if (!isVideo) {
            // Static image — generate one NV21 frame
            generateStaticNv21Frame(mediaPath, width, height);
            return;
        }

        // Start MediaCodec decoder in byte-buffer mode (no surface) for NV21 extraction
        startCamera1ByteBufferDecoder(mediaPath, width, height);
    }

    /** Get the latest NV21 frame for Camera1 onPreviewFrame injection. */
    public byte[] getCamera1Frame() {
        return camera1DataBuffer;
    }

    /** Get replacement photo data for Camera1 takePicture. */
    public byte[] getCamera1PictureData(boolean isJpeg) {
        ConfigSnapshot cfg = configLoader.getSnapshot();
        String mediaPath = cfg.mediaSourcePath;
        if (mediaPath == null) return null;

        try {
            Bitmap bmp = loadBitmap(mediaPath);
            if (bmp == null) return null;

            if (isJpeg) {
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                bmp.compress(Bitmap.CompressFormat.JPEG, 95, baos);
                return baos.toByteArray();
            } else {
                // NV21
                return bitmapToNv21(bmp);
            }
        } catch (Throwable t) {
            LogUtil.e(TAG, "getCamera1PictureData failed", t);
            return null;
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Frame delivery — VCAM-style dual-path
    // ──────────────────────────────────────────────────────────────────────

    private void startFrameDelivery() {
        ConfigSnapshot cfg = configLoader.getSnapshot();
        String mediaPath = cfg.mediaSourcePath;

        if (mediaPath == null || mediaPath.trim().isEmpty()) {
            LogUtil.d(TAG, "No media path — delivering test pattern");
            deliverTestPatternToAllSurfaces();
            return;
        }

        String lower = mediaPath.toLowerCase(Locale.ROOT);
        boolean isVideo = lower.endsWith(".mp4") || lower.endsWith(".mkv") ||
                lower.endsWith(".webm") || lower.endsWith(".avi") ||
                lower.endsWith(".3gp");
        boolean isStream = lower.startsWith("http://") || lower.startsWith("https://") ||
                lower.startsWith("rtsp://");

        if (isVideo || isStream) {
            deliverVideoToSurfaces(mediaPath);
        } else {
            deliverStaticImageToSurfaces(mediaPath);
        }
    }

    /**
     * Video delivery — MediaPlayer for preview surfaces, MediaCodec for ImageReader surfaces.
     * This is the core VCAM pattern.
     */
    private void deliverVideoToSurfaces(String mediaPath) {
        ensureRenderThread();
        renderHandler.post(() -> {
            try {
                // Preview surfaces: MediaPlayer plays video directly to them
                int playerIndex = 0;
                for (Surface s : previewSurfaces) {
                    if (s != null && s.isValid()) {
                        startMediaPlayerOnSurface(s, mediaPath, playerIndex == 0);
                        playerIndex++;
                        if (playerIndex >= 2) break; // max 2 preview players
                    }
                }

                // ImageReader surfaces: MediaCodec decodes video directly to them
                for (Surface s : readerSurfaces) {
                    if (s != null && s.isValid()) {
                        startMediaCodecOnSurface(s, mediaPath);
                        break; // one decoder is sufficient
                    }
                }

                LogUtil.i(TAG, "Video delivery started: " + playerIndex +
                        " preview players, reader decoder=" + (readerDecoderRunning ? "yes" : "no"));
            } catch (Throwable t) {
                LogUtil.e(TAG, "Video delivery failed", t);
            }
        });
    }

    /**
     * Static image delivery — use EglRenderer for preview surfaces,
     * render periodically to keep the surface alive.
     */
    private void deliverStaticImageToSurfaces(String mediaPath) {
        ensureRenderThread();
        renderHandler.post(() -> {
            try {
                Bitmap bmp = loadBitmap(mediaPath);
                if (bmp == null) {
                    LogUtil.w(TAG, "Failed to load static image: " + mediaPath);
                    deliverTestPatternToAllSurfaces();
                    return;
                }

                Transform transform = Transform.fromConfig(configLoader.getSnapshot());

                // Preview surfaces via EGL
                for (Surface s : previewSurfaces) {
                    if (s != null && s.isValid()) {
                        eglRenderer.renderBitmap(s, bmp, transform);
                    }
                }

                // ImageReader surfaces — render via Canvas (proper format negotiation)
                for (Surface s : readerSurfaces) {
                    if (s != null && s.isValid()) {
                        renderBitmapToImageReaderSurface(s, bmp);
                    }
                }

                // Schedule periodic re-render to keep surfaces alive
                schedulePeriodicRender(mediaPath);

                LogUtil.i(TAG, "Static image delivered to " +
                        previewSurfaces.size() + " preview + " +
                        readerSurfaces.size() + " reader surfaces");
            } catch (Throwable t) {
                LogUtil.e(TAG, "Static image delivery failed", t);
            }
        });
    }

    private void deliverTestPatternToAllSurfaces() {
        ensureRenderThread();
        renderHandler.post(() -> {
            Bitmap tp = createTestPattern();
            Transform identity = Transform.identity();

            for (Surface s : previewSurfaces) {
                if (s != null && s.isValid()) {
                    eglRenderer.renderBitmap(s, tp, identity);
                }
            }
            for (Surface s : readerSurfaces) {
                if (s != null && s.isValid()) {
                    renderBitmapToImageReaderSurface(s, tp);
                }
            }

            // Re-deliver periodically
            if (renderHandler != null) {
                renderHandler.postDelayed(() -> {
                    if (playbackStarted) deliverTestPatternToAllSurfaces();
                }, 500);
            }
        });
    }

    // ──────────────────────────────────────────────────────────────────────
    // MediaPlayer — for preview/SurfaceTexture surfaces
    // ──────────────────────────────────────────────────────────────────────

    private void startMediaPlayerOnSurface(Surface surface, String mediaPath, boolean isPrimary) {
        synchronized (playerLock) {
            try {
                MediaPlayer mp = new MediaPlayer();
                mp.setDataSource(mediaPath);
                mp.setSurface(surface);
                mp.setLooping(true);
                mp.setVolume(0f, 0f); // silent

                mp.setOnPreparedListener(player -> {
                    player.start();
                    LogUtil.i(TAG, "MediaPlayer started on " +
                            (isPrimary ? "primary" : "secondary") + " surface");
                });

                mp.setOnErrorListener((player, what, extra) -> {
                    LogUtil.e(TAG, "MediaPlayer error: what=" + what + " extra=" + extra);
                    return true;
                });

                mp.prepareAsync();

                if (isPrimary) {
                    stopPlayer(previewPlayer);
                    previewPlayer = mp;
                } else {
                    stopPlayer(previewPlayer2);
                    previewPlayer2 = mp;
                }
            } catch (Throwable t) {
                LogUtil.e(TAG, "startMediaPlayerOnSurface failed", t);
            }
        }
    }

    private void stopPlayer(MediaPlayer mp) {
        if (mp == null) return;
        try { mp.stop(); } catch (Throwable ignored) {}
        try { mp.release(); } catch (Throwable ignored) {}
    }

    // ──────────────────────────────────────────────────────────────────────
    // MediaCodec — for ImageReader surfaces (proper YUV/JPEG output)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Start MediaCodec decoder that outputs directly to an ImageReader surface.
     * The surface handles format negotiation automatically.
     */
    private void startMediaCodecOnSurface(Surface surface, String mediaPath) {
        synchronized (decoderLock) {
            stopReaderDecoder();

            try {
                readerExtractor = new MediaExtractor();
                readerExtractor.setDataSource(mediaPath);

                int videoTrack = selectVideoTrack(readerExtractor);
                if (videoTrack < 0) {
                    LogUtil.w(TAG, "No video track found in: " + mediaPath);
                    return;
                }

                readerExtractor.selectTrack(videoTrack);
                MediaFormat format = readerExtractor.getTrackFormat(videoTrack);
                String mime = format.getString(MediaFormat.KEY_MIME);

                readerDecoder = MediaCodec.createDecoderByType(mime);
                // Configure WITH surface — frames decode directly to ImageReader
                readerDecoder.configure(format, surface, null, 0);
                readerDecoder.start();
                readerDecoderRunning = true;

                // Run decode loop on render thread
                ensureRenderThread();
                renderHandler.post(() -> runDecoderLoop(readerDecoder, readerExtractor, true));

                LogUtil.i(TAG, "MediaCodec decoder started on ImageReader surface");
            } catch (Throwable t) {
                LogUtil.e(TAG, "MediaCodec decoder start failed", t);
                stopReaderDecoder();
            }
        }
    }

    /**
     * Start Camera1 byte-buffer decoder — no surface, extracts NV21 frames.
     */
    private void startCamera1ByteBufferDecoder(String mediaPath, int width, int height) {
        synchronized (decoderLock) {
            stopCamera1Decoder();

            try {
                camera1Extractor = new MediaExtractor();
                camera1Extractor.setDataSource(mediaPath);

                int videoTrack = selectVideoTrack(camera1Extractor);
                if (videoTrack < 0) return;

                camera1Extractor.selectTrack(videoTrack);
                MediaFormat format = camera1Extractor.getTrackFormat(videoTrack);
                String mime = format.getString(MediaFormat.KEY_MIME);

                // Request flexible YUV output
                format.setInteger(MediaFormat.KEY_COLOR_FORMAT,
                        android.media.MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible);

                camera1Decoder = MediaCodec.createDecoderByType(mime);
                // Configure WITHOUT surface — we extract bytes manually
                camera1Decoder.configure(format, null, null, 0);
                camera1Decoder.start();
                camera1DecoderRunning = true;

                ensureRenderThread();
                renderHandler.post(() -> runByteBufferDecoderLoop(camera1Decoder, camera1Extractor, width, height));

                LogUtil.i(TAG, "Camera1 byte-buffer decoder started: " + width + "x" + height);
            } catch (Throwable t) {
                LogUtil.e(TAG, "Camera1 decoder start failed", t);
                stopCamera1Decoder();
            }
        }
    }

    /**
     * Decoder loop — feeds frames to surface or extracts bytes.
     * Loops video when reaching end of stream.
     */
    private void runDecoderLoop(MediaCodec decoder, MediaExtractor extractor, boolean renderToSurface) {
        if (decoder == null || extractor == null) return;

        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        boolean eos = false;
        long startTimeMs = SystemClock.uptimeMillis();

        while (readerDecoderRunning && decoder == readerDecoder) {
            try {
                // Feed input
                if (!eos) {
                    int inputIndex = decoder.dequeueInputBuffer(10000);
                    if (inputIndex >= 0) {
                        ByteBuffer inputBuffer = decoder.getInputBuffer(inputIndex);
                        int sampleSize = extractor.readSampleData(inputBuffer, 0);
                        if (sampleSize < 0) {
                            decoder.queueInputBuffer(inputIndex, 0, 0, 0,
                                    MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            eos = true;
                        } else {
                            long pts = extractor.getSampleTime();
                            decoder.queueInputBuffer(inputIndex, 0, sampleSize, pts, 0);
                            extractor.advance();
                        }
                    }
                }

                // Drain output
                int outputIndex = decoder.dequeueOutputBuffer(info, 10000);
                if (outputIndex >= 0) {
                    // Frame pacing
                    long presentationMs = info.presentationTimeUs / 1000;
                    long elapsed = SystemClock.uptimeMillis() - startTimeMs;
                    long sleepMs = presentationMs - elapsed;
                    if (sleepMs > 2 && sleepMs < 500) {
                        try { Thread.sleep(sleepMs); } catch (InterruptedException ignored) {}
                    }

                    // render=true sends frame to surface automatically
                    decoder.releaseOutputBuffer(outputIndex, renderToSurface);

                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        // Loop: seek back to start
                        extractor.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC);
                        decoder.flush();
                        eos = false;
                        startTimeMs = SystemClock.uptimeMillis();
                    }
                }
            } catch (IllegalStateException e) {
                LogUtil.w(TAG, "Decoder loop IllegalState — stopping");
                break;
            } catch (Throwable t) {
                LogUtil.e(TAG, "Decoder loop error", t);
                break;
            }
        }
    }

    /**
     * Byte-buffer decoder loop for Camera1 — extracts NV21 frames into camera1DataBuffer.
     */
    private void runByteBufferDecoderLoop(MediaCodec decoder, MediaExtractor extractor,
                                          int targetWidth, int targetHeight) {
        if (decoder == null || extractor == null) return;

        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        boolean eos = false;
        long startTimeMs = SystemClock.uptimeMillis();

        while (camera1DecoderRunning && decoder == camera1Decoder) {
            try {
                // Feed input
                if (!eos) {
                    int inputIndex = decoder.dequeueInputBuffer(10000);
                    if (inputIndex >= 0) {
                        ByteBuffer inputBuffer = decoder.getInputBuffer(inputIndex);
                        int sampleSize = extractor.readSampleData(inputBuffer, 0);
                        if (sampleSize < 0) {
                            decoder.queueInputBuffer(inputIndex, 0, 0, 0,
                                    MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            eos = true;
                        } else {
                            long pts = extractor.getSampleTime();
                            decoder.queueInputBuffer(inputIndex, 0, sampleSize, pts, 0);
                            extractor.advance();
                        }
                    }
                }

                // Drain output — extract NV21 bytes
                int outputIndex = decoder.dequeueOutputBuffer(info, 10000);
                if (outputIndex >= 0) {
                    // Frame pacing
                    long presentationMs = info.presentationTimeUs / 1000;
                    long elapsed = SystemClock.uptimeMillis() - startTimeMs;
                    long sleepMs = presentationMs - elapsed;
                    if (sleepMs > 2 && sleepMs < 500) {
                        try { Thread.sleep(sleepMs); } catch (InterruptedException ignored) {}
                    }

                    // Extract NV21 from the decoded frame
                    try {
                        Image image = decoder.getOutputImage(outputIndex);
                        if (image != null) {
                            byte[] nv21 = imageToNv21(image);
                            if (nv21 != null) {
                                camera1DataBuffer = nv21;
                            }
                            image.close();
                        }
                    } catch (Throwable t) {
                        LogUtil.w(TAG, "NV21 extraction failed", t);
                    }

                    decoder.releaseOutputBuffer(outputIndex, false); // don't render

                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        extractor.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC);
                        decoder.flush();
                        eos = false;
                        startTimeMs = SystemClock.uptimeMillis();
                    }
                }
            } catch (IllegalStateException e) {
                LogUtil.w(TAG, "Camera1 decoder loop IllegalState — stopping");
                break;
            } catch (Throwable t) {
                LogUtil.e(TAG, "Camera1 decoder loop error", t);
                break;
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Static image rendering helpers
    // ──────────────────────────────────────────────────────────────────────

    private void renderStaticImageToSurface(Surface surface, String mediaPath) {
        Bitmap bmp = loadBitmap(mediaPath);
        if (bmp == null) return;
        Transform transform = Transform.fromConfig(configLoader.getSnapshot());
        eglRenderer.renderBitmap(surface, bmp, transform);
    }

    /**
     * Render bitmap to an ImageReader-backed surface using Canvas.
     * Canvas handles format negotiation properly (unlike EGL which outputs RGBA only).
     */
    private void renderBitmapToImageReaderSurface(Surface surface, Bitmap bmp) {
        try {
            Canvas canvas = surface.lockCanvas(null);
            if (canvas != null) {
                canvas.drawColor(Color.BLACK);
                // Scale to fit
                float scaleX = (float) canvas.getWidth() / bmp.getWidth();
                float scaleY = (float) canvas.getHeight() / bmp.getHeight();
                float scale = Math.min(scaleX, scaleY);
                float dx = (canvas.getWidth() - bmp.getWidth() * scale) / 2f;
                float dy = (canvas.getHeight() - bmp.getHeight() * scale) / 2f;
                canvas.translate(dx, dy);
                canvas.scale(scale, scale);
                canvas.drawBitmap(bmp, 0, 0, null);
                surface.unlockCanvasAndPost(canvas);
            }
        } catch (Throwable t) {
            LogUtil.dRateLimited("canvas-render-fail", 5000, TAG,
                    "Canvas render to ImageReader surface failed: " + t.getMessage());
        }
    }

    private void schedulePeriodicRender(String mediaPath) {
        if (renderHandler == null) return;
        renderHandler.postDelayed(() -> {
            if (!playbackStarted) return;
            ConfigSnapshot cfg = configLoader.getSnapshot();
            if (!cfg.enabled || !cfg.isTargeted(packageName)) return;

            Bitmap bmp = loadBitmap(mediaPath);
            if (bmp == null) return;
            Transform transform = Transform.fromConfig(cfg);

            for (Surface s : previewSurfaces) {
                if (s != null && s.isValid()) {
                    eglRenderer.renderBitmap(s, bmp, transform);
                }
            }
            for (Surface s : readerSurfaces) {
                if (s != null && s.isValid()) {
                    renderBitmapToImageReaderSurface(s, bmp);
                }
            }

            schedulePeriodicRender(mediaPath);
        }, 200); // 5fps for static images
    }

    /** Generate a static NV21 frame from an image file for Camera1 byte-buffer mode. */
    private void generateStaticNv21Frame(String mediaPath, int width, int height) {
        try {
            Bitmap bmp = loadBitmap(mediaPath);
            if (bmp == null) return;

            // Scale bitmap to expected size
            Bitmap scaled = Bitmap.createScaledBitmap(bmp, width, height, true);
            camera1DataBuffer = bitmapToNv21(scaled);
            if (scaled != bmp) scaled.recycle();
            camera1DecoderRunning = true; // mark as ready
        } catch (Throwable t) {
            LogUtil.e(TAG, "generateStaticNv21Frame failed", t);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Format conversion utilities
    // ──────────────────────────────────────────────────────────────────────

    /** Convert YUV_420_888 Image to NV21 byte array (VCAM-style). */
    private static byte[] imageToNv21(Image image) {
        if (image == null) return null;
        int width = image.getWidth();
        int height = image.getHeight();
        Image.Plane[] planes = image.getPlanes();
        if (planes.length < 3) return null;

        int ySize = width * height;
        int uvSize = width * height / 2;
        byte[] nv21 = new byte[ySize + uvSize];

        // Y plane
        ByteBuffer yBuffer = planes[0].getBuffer();
        int yRowStride = planes[0].getRowStride();
        int yPixelStride = planes[0].getPixelStride();

        int pos = 0;
        for (int row = 0; row < height; row++) {
            for (int col = 0; col < width; col++) {
                nv21[pos++] = yBuffer.get(row * yRowStride + col * yPixelStride);
            }
        }

        // V and U planes interleaved for NV21 (VUVU...)
        ByteBuffer uBuffer = planes[1].getBuffer();
        ByteBuffer vBuffer = planes[2].getBuffer();
        int uvRowStride = planes[1].getRowStride();
        int uvPixelStride = planes[1].getPixelStride();

        for (int row = 0; row < height / 2; row++) {
            for (int col = 0; col < width / 2; col++) {
                nv21[pos++] = vBuffer.get(row * uvRowStride + col * uvPixelStride); // V
                nv21[pos++] = uBuffer.get(row * uvRowStride + col * uvPixelStride); // U
            }
        }

        return nv21;
    }

    /** Convert ARGB Bitmap to NV21 byte array. */
    private static byte[] bitmapToNv21(Bitmap bmp) {
        if (bmp == null) return null;
        int width = bmp.getWidth();
        int height = bmp.getHeight();
        int[] argb = new int[width * height];
        bmp.getPixels(argb, 0, width, 0, 0, width, height);

        byte[] nv21 = new byte[width * height + width * height / 2];
        int yIndex = 0;
        int uvIndex = width * height;

        for (int j = 0; j < height; j++) {
            for (int i = 0; i < width; i++) {
                int pixel = argb[j * width + i];
                int r = (pixel >> 16) & 0xFF;
                int g = (pixel >> 8) & 0xFF;
                int b = pixel & 0xFF;

                // RGB to YUV (BT.601)
                int y = ((66 * r + 129 * g + 25 * b + 128) >> 8) + 16;
                nv21[yIndex++] = (byte) Math.max(0, Math.min(255, y));

                if (j % 2 == 0 && i % 2 == 0) {
                    int u = ((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128;
                    int v = ((112 * r - 94 * g - 18 * b + 128) >> 8) + 128;
                    nv21[uvIndex++] = (byte) Math.max(0, Math.min(255, v)); // V first (NV21)
                    nv21[uvIndex++] = (byte) Math.max(0, Math.min(255, u)); // then U
                }
            }
        }
        return nv21;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Media loading
    // ──────────────────────────────────────────────────────────────────────

    private Bitmap loadBitmap(String path) {
        if (path == null) return null;
        if (path.equals(lastMediaPath) && lastMediaBitmap != null) return lastMediaBitmap;

        try {
            File f = new File(path).getCanonicalFile();
            if (!f.exists() || !f.canRead()) {
                LogUtil.dRateLimited("media-unreadable", 3000, TAG,
                        "Media not readable: " + path);
                return null;
            }

            String lower = path.toLowerCase(Locale.ROOT);
            Bitmap bmp;

            if (lower.endsWith(".png") || lower.endsWith(".jpg") ||
                    lower.endsWith(".jpeg") || lower.endsWith(".webp") ||
                    lower.endsWith(".bmp")) {
                bmp = BitmapFactory.decodeFile(path);
            } else {
                // Video — extract first frame
                MediaMetadataRetriever mmr = new MediaMetadataRetriever();
                try {
                    mmr.setDataSource(f.getPath());
                    bmp = mmr.getFrameAtTime(0);
                } finally {
                    mmr.release();
                }
            }

            lastMediaPath = path;
            lastMediaBitmap = bmp;
            return bmp;
        } catch (Throwable t) {
            LogUtil.iRateLimited("media-load-fail", 3000, TAG,
                    "Failed to load media: " + t.getClass().getSimpleName());
            return null;
        }
    }

    private Bitmap createTestPattern() {
        Bitmap b = Bitmap.createBitmap(512, 256, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        c.drawColor(Color.DKGRAY);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.WHITE);
        p.setTextSize(28f);
        c.drawText("VirtuCam TEST", 20, 50, p);
        c.drawText("pkg: " + packageName, 20, 95, p);
        c.drawText("t: " + SystemClock.uptimeMillis(), 20, 140, p);
        return b;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Track selection
    // ──────────────────────────────────────────────────────────────────────

    private static int selectVideoTrack(MediaExtractor extractor) {
        for (int i = 0; i < extractor.getTrackCount(); i++) {
            MediaFormat format = extractor.getTrackFormat(i);
            String mime = format.getString(MediaFormat.KEY_MIME);
            if (mime != null && mime.startsWith("video/")) return i;
        }
        return -1;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ──────────────────────────────────────────────────────────────────────

    private void ensureRenderThread() {
        if (renderThread != null && renderThread.isAlive()) return;
        renderThread = new HandlerThread("VirtuCam-Render");
        renderThread.start();
        renderHandler = new Handler(renderThread.getLooper());
    }

    private void stopAllPlayback() {
        playbackStarted = false;

        synchronized (playerLock) {
            stopPlayer(previewPlayer);
            previewPlayer = null;
            stopPlayer(previewPlayer2);
            previewPlayer2 = null;
            stopPlayer(camera1Player);
            camera1Player = null;
        }

        stopReaderDecoder();
        stopCamera1Decoder();
    }

    private void stopReaderDecoder() {
        synchronized (decoderLock) {
            readerDecoderRunning = false;
            if (readerDecoder != null) {
                try { readerDecoder.stop(); } catch (Throwable ignored) {}
                try { readerDecoder.release(); } catch (Throwable ignored) {}
                readerDecoder = null;
            }
            if (readerExtractor != null) {
                try { readerExtractor.release(); } catch (Throwable ignored) {}
                readerExtractor = null;
            }
        }
    }

    private void stopCamera1Decoder() {
        camera1DecoderRunning = false;
        if (camera1Decoder != null) {
            try { camera1Decoder.stop(); } catch (Throwable ignored) {}
            try { camera1Decoder.release(); } catch (Throwable ignored) {}
            camera1Decoder = null;
        }
        if (camera1Extractor != null) {
            try { camera1Extractor.release(); } catch (Throwable ignored) {}
            camera1Extractor = null;
        }
    }

    /** Debug summary for diagnostics. */
    public String getRoutingDebugSummary() {
        ConfigSnapshot cfg = configLoader.getSnapshot();
        return "enabled=" + cfg.enabled +
                ",targeted=" + cfg.isTargeted(packageName) +
                ",previewSurfaces=" + previewSurfaces.size() +
                ",readerSurfaces=" + readerSurfaces.size() +
                ",playbackStarted=" + playbackStarted +
                ",hasMedia=" + (cfg.mediaSourcePath != null && !cfg.mediaSourcePath.trim().isEmpty());
    }
}
