package com.briefplantrain.virtucam;

import org.junit.Test;
import static org.junit.Assert.*;

public class StreamingMediaSourceTest {

    @Test
    public void testIsStreamingUrl() {
        assertTrue(StreamingMediaSource.isStreamingUrl("rtmp://live.example.com/stream"));
        assertTrue(StreamingMediaSource.isStreamingUrl("rtsp://192.168.1.100:554/cam1"));
        assertTrue(StreamingMediaSource.isStreamingUrl("http://example.com/video.mp4"));
        assertTrue(StreamingMediaSource.isStreamingUrl("https://example.com/live.m3u8"));

        assertFalse(StreamingMediaSource.isStreamingUrl("/sdcard/DCIM/video.mp4"));
        assertFalse(StreamingMediaSource.isStreamingUrl(null));
        assertFalse(StreamingMediaSource.isStreamingUrl(""));
    }

    @Test
    public void testDetectProtocol() {
        assertEquals(StreamingMediaSource.StreamProtocol.RTMP,
            StreamingMediaSource.detectProtocol("rtmp://live.example.com/stream"));
        assertEquals(StreamingMediaSource.StreamProtocol.RTSP,
            StreamingMediaSource.detectProtocol("rtsp://192.168.1.100:554/cam1"));
        assertEquals(StreamingMediaSource.StreamProtocol.HLS,
            StreamingMediaSource.detectProtocol("https://example.com/live.m3u8"));
        assertEquals(StreamingMediaSource.StreamProtocol.HTTP,
            StreamingMediaSource.detectProtocol("http://example.com/video.mp4"));
        assertEquals(StreamingMediaSource.StreamProtocol.UNKNOWN,
            StreamingMediaSource.detectProtocol(null));
    }
}
