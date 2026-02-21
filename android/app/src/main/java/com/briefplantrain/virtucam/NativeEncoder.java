package com.briefplantrain.virtucam;

/**
 * JNI bridge for high-performance native YUV encoding.
 * Falls back to Java implementation if native library is unavailable.
 */
public class NativeEncoder {

    private static boolean nativeAvailable = false;

    static {
        try {
            // Library name is hardcoded - not user-controllable (CWE-114 mitigation)
            System.loadLibrary("virtucam-native");
            nativeAvailable = true;
        } catch (UnsatisfiedLinkError e) {
            // Native library not available, will use Java fallback
            nativeAvailable = false;
        }
    }

    public static boolean isNativeAvailable() {
        return nativeAvailable;
    }

    /**
     * Convert ARGB_8888 int array to NV21 byte array (native).
     * @param rgb    Input pixel array from Bitmap.getPixels()
     * @param nv21   Output NV21 byte array (size: width * height * 3 / 2)
     * @param width  Frame width
     * @param height Frame height
     */
    public static native void rgbToNv21(int[] rgb, byte[] nv21, int width, int height);

    /**
     * Convert ARGB_8888 int array to I420 byte array (native).
     * @param rgb    Input pixel array from Bitmap.getPixels()
     * @param i420   Output I420 byte array (size: width * height * 3 / 2)
     * @param width  Frame width
     * @param height Frame height
     */
    public static native void rgbToI420(int[] rgb, byte[] i420, int width, int height);
}
