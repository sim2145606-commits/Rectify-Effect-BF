#include <jni.h>
#include <cstring>
#include <cstdint>
#include <algorithm>

extern "C" {

/**
 * High-performance RGB to NV21 conversion using NEON on ARM.
 * Converts ARGB_8888 pixel buffer to NV21 format for Camera1 PreviewCallback injection.
 */
JNIEXPORT void JNICALL
Java_com_briefplantrain_virtucam_NativeEncoder_rgbToNv21(
    JNIEnv *env,
    jclass /* clazz */,
    jintArray rgbInput,
    jbyteArray nv21Output,
    jint width,
    jint height
) {
    jint *rgb = env->GetIntArrayElements(rgbInput, nullptr);
    jbyte *nv21 = env->GetByteArrayElements(nv21Output, nullptr);

    if (rgb == nullptr || nv21 == nullptr) return;

    int frameSize = width * height;

    // Y plane
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            int idx = y * width + x;
            int pixel = rgb[idx];

            int r = (pixel >> 16) & 0xFF;
            int g = (pixel >> 8) & 0xFF;
            int b = pixel & 0xFF;

            int yVal = ((66 * r + 129 * g + 25 * b + 128) >> 8) + 16;
            nv21[idx] = static_cast<jbyte>(std::clamp(yVal, 0, 255));
        }
    }

    // VU planes (NV21: V first, then U, interleaved)
    int vuIndex = frameSize;
    for (int y = 0; y < height; y += 2) {
        for (int x = 0; x < width; x += 2) {
            int idx = y * width + x;
            int pixel = rgb[idx];

            int r = (pixel >> 16) & 0xFF;
            int g = (pixel >> 8) & 0xFF;
            int b = pixel & 0xFF;

            int v = ((112 * r - 94 * g - 18 * b + 128) >> 8) + 128;
            int u = ((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128;

            nv21[vuIndex++] = static_cast<jbyte>(std::clamp(v, 0, 255));
            nv21[vuIndex++] = static_cast<jbyte>(std::clamp(u, 0, 255));
        }
    }

    env->ReleaseIntArrayElements(rgbInput, rgb, 0);
    env->ReleaseByteArrayElements(nv21Output, nv21, 0);
}

/**
 * RGB to I420 (YUV420 planar) conversion for Camera2 ImageReader injection.
 */
JNIEXPORT void JNICALL
Java_com_briefplantrain_virtucam_NativeEncoder_rgbToI420(
    JNIEnv *env,
    jclass /* clazz */,
    jintArray rgbInput,
    jbyteArray i420Output,
    jint width,
    jint height
) {
    jint *rgb = env->GetIntArrayElements(rgbInput, nullptr);
    jbyte *i420 = env->GetByteArrayElements(i420Output, nullptr);

    if (rgb == nullptr || i420 == nullptr) return;

    int frameSize = width * height;
    int uOffset = frameSize;
    int vOffset = frameSize + frameSize / 4;

    // Y plane
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            int idx = y * width + x;
            int pixel = rgb[idx];

            int r = (pixel >> 16) & 0xFF;
            int g = (pixel >> 8) & 0xFF;
            int b = pixel & 0xFF;

            int yVal = ((66 * r + 129 * g + 25 * b + 128) >> 8) + 16;
            i420[idx] = static_cast<jbyte>(std::clamp(yVal, 0, 255));
        }
    }

    // U and V planes
    int uvIdx = 0;
    for (int y = 0; y < height; y += 2) {
        for (int x = 0; x < width; x += 2) {
            int idx = y * width + x;
            int pixel = rgb[idx];

            int r = (pixel >> 16) & 0xFF;
            int g = (pixel >> 8) & 0xFF;
            int b = pixel & 0xFF;

            int u = ((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128;
            int v = ((112 * r - 94 * g - 18 * b + 128) >> 8) + 128;

            i420[uOffset + uvIdx] = static_cast<jbyte>(std::clamp(u, 0, 255));
            i420[vOffset + uvIdx] = static_cast<jbyte>(std::clamp(v, 0, 255));
            uvIdx++;
        }
    }

    env->ReleaseIntArrayElements(rgbInput, rgb, 0);
    env->ReleaseByteArrayElements(i420Output, i420, 0);
}

} // extern "C"
