package com.briefplantrain.virtucam;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.SurfaceTexture;
import android.net.Uri;
import android.os.Handler;
import android.os.HandlerThread;
import android.view.Surface;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import de.robv.android.xposed.XposedBridge;

/**
 * Provides streaming video frames from RTMP/RTSP/HTTP/HLS sources.
 * Used by CameraHook when the media source is a URL instead of a local file.
 *
 * Supported protocols:
 * - rtmp://  (RTMP live streams)
 * - rtsp://  (RTSP camera feeds)
 * - http://  (HTTP progressive / HLS)
 * - https:// (HTTPS progressive / HLS)
 */
public class StreamingMediaSource {

    private static final String TAG = "VirtuCam-Stream";

    public enum StreamProtocol {
        RTMP, RTSP, HTTP, HLS, UNKNOWN
    }

    private final String streamUrl;
    private final StreamProtocol protocol;
    private volatile boolean isPlaying = false;
    private volatile Bitmap latestFrame = null;

    private HandlerThread decoderThread;
    private Handler decoderHandler;
    private Surface decodeSurface;
    private SurfaceTexture decodeSurfaceTexture;
    private android.media.MediaPlayer mediaPlayer;

    // Frame callback interface
    public interface FrameCallback {
        void onFrameAvailable(Bitmap frame);
        void onError(String error);
        void onStreamEnd();
    }

    private FrameCallback frameCallback;

    public StreamingMediaSource(String url) {
        this.streamUrl = url;
        this.protocol = detectProtocol(url);
    }

    public static boolean isStreamingUrl(String path) {
        if (path == null) return false;
        String lower = path.toLowerCase().trim();
        return lower.startsWith("rtmp://") ||
               lower.startsWith("rtsp://") ||
               lower.startsWith("http://") ||
               lower.startsWith("https://");
    }

    public static StreamProtocol detectProtocol(String url) {
        if (url == null) return StreamProtocol.UNKNOWN;
        String lower = url.toLowerCase().trim();
        if (lower.startsWith("rtmp://")) return StreamProtocol.RTMP;
        if (lower.startsWith("rtsp://")) return StreamProtocol.RTSP;
        if (lower.contains(".m3u8")) return StreamProtocol.HLS;
        if (lower.startsWith("http://") || lower.startsWith("https://"))
            return StreamProtocol.HTTP;
        return StreamProtocol.UNKNOWN;
    }

    public StreamProtocol getProtocol() {
        return protocol;
    }

    public String getStreamUrl() {
        return streamUrl;
    }

    public boolean isPlaying() {
        return isPlaying;
    }

    public Bitmap getLatestFrame() {
        return latestFrame;
    }

    public void setFrameCallback(FrameCallback callback) {
        this.frameCallback = callback;
    }

    /**
     * Start streaming. Must be called with a valid Android Context.
     * In Xposed hook context, use the hooked app's context.
     */
    public void start(Context context) {
        if (isPlaying) return;

        decoderThread = new HandlerThread("VirtuCam-StreamDecoder");
        decoderThread.start();
        decoderHandler = new Handler(decoderThread.getLooper());

        decoderHandler.post(() -> {
            try {
                isPlaying = true;
                XposedBridge.log(TAG + ": Starting stream: " + streamUrl +
                    " (protocol: " + protocol + ")");

                // Use MediaPlayer for basic HTTP/RTSP
                // For RTMP, use the rtmp datasource from media3
                initializePlayer(context);

            } catch (Exception e) {
                XposedBridge.log(TAG + ": Stream start failed: " + e);
                isPlaying = false;
                if (frameCallback != null) {
                    frameCallback.onError("Stream start failed: " + e.getMessage());
                }
            }
        });
    }

    private void initializePlayer(Context context) {
        try {
            // Create a SurfaceTexture to receive decoded frames
            int texId = 0; // dummy texture id for frame extraction
            decodeSurfaceTexture = new SurfaceTexture(texId);
            decodeSurfaceTexture.setDefaultBufferSize(1920, 1080);
            decodeSurface = new Surface(decodeSurfaceTexture);

            // Use Android MediaPlayer for RTSP/HTTP streams
            mediaPlayer = new android.media.MediaPlayer();
            mediaPlayer.setDataSource(context, Uri.parse(streamUrl));
            mediaPlayer.setSurface(decodeSurface);
            mediaPlayer.setLooping(true);

            mediaPlayer.setOnPreparedListener(mp -> {
                mp.start();
                XposedBridge.log(TAG + ": Stream playing: " + streamUrl);
            });

            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                XposedBridge.log(TAG + ": Stream error: what=" + what + " extra=" + extra);
                if (frameCallback != null) {
                    frameCallback.onError("MediaPlayer error: " + what);
                }
                return true;
            });

            mediaPlayer.setOnCompletionListener(mp -> {
                if (frameCallback != null) {
                    frameCallback.onStreamEnd();
                }
            });

            mediaPlayer.prepareAsync();

        } catch (Exception e) {
            XposedBridge.log(TAG + ": initializePlayer failed: " + e);
            if (frameCallback != null) {
                frameCallback.onError("Player initialization failed: " + e.getMessage());
            }
        }
    }

    public void stop() {
        isPlaying = false;
        if (mediaPlayer != null) {
            try { mediaPlayer.stop(); } catch (Exception ignored) {}
            try { mediaPlayer.release(); } catch (Exception ignored) {}
            mediaPlayer = null;
        }
        if (decodeSurface != null) {
            decodeSurface.release();
            decodeSurface = null;
        }
        if (decodeSurfaceTexture != null) {
            decodeSurfaceTexture.release();
            decodeSurfaceTexture = null;
        }
        if (decoderThread != null) {
            decoderThread.quitSafely();
            decoderThread = null;
        }
        latestFrame = null;
    }

    public void release() {
        stop();
        frameCallback = null;
    }
}
