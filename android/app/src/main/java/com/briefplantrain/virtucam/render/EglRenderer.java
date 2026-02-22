package com.briefplantrain.virtucam.render;

import android.graphics.Bitmap;
import android.opengl.EGL14;
import android.opengl.EGLConfig;
import android.opengl.EGLContext;
import android.opengl.EGLDisplay;
import android.opengl.EGLSurface;
import android.opengl.GLES20;
import android.opengl.GLUtils;
import android.view.Surface;

import com.briefplantrain.virtucam.util.LogUtil;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.HashMap;
import java.util.Map;

public final class EglRenderer {

    private static final String TAG = "VirtuCam/EglRenderer";

    private EGLDisplay eglDisplay = EGL14.EGL_NO_DISPLAY;
    private EGLContext eglContext = EGL14.EGL_NO_CONTEXT;
    private EGLConfig eglConfig = null;

    private final Map<Surface, EGLSurface> surfaceMap = new HashMap<>();

    private boolean glReady = false;
    private int program = 0;
    private int aPosLoc = -1;
    private int aTexLoc = -1;
    private int uMvpLoc = -1;
    private int uTexLoc = -1;
    private int uSamplerLoc = -1;

    private int textureId = 0;

    private FloatBuffer vertexBuf;
    private FloatBuffer texBuf;

    private static final float[] VERTICES = new float[] {
            -1f, -1f,
            1f, -1f,
            -1f,  1f,
            1f,  1f
    };

    private static final float[] TEXCOORDS = new float[] {
            0f, 1f,
            1f, 1f,
            0f, 0f,
            1f, 0f
    };

    public void releaseSurface(Surface surface) {
        if (surface == null) return;
        EGLSurface eglSurface = surfaceMap.remove(surface);
        if (eglSurface != null && eglSurface != EGL14.EGL_NO_SURFACE && eglDisplay != EGL14.EGL_NO_DISPLAY) {
            try {
                EGL14.eglDestroySurface(eglDisplay, eglSurface);
            } catch (Throwable t) {
                LogUtil.e(TAG, "releaseSurface failed", t);
            }
        }
    }

    public void releaseAll() {
        try {
            for (Surface s : surfaceMap.keySet()) {
                releaseSurface(s);
            }
            surfaceMap.clear();

            if (eglDisplay != EGL14.EGL_NO_DISPLAY) {
                EGL14.eglMakeCurrent(eglDisplay,
                        EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE,
                        EGL14.EGL_NO_CONTEXT);

                if (eglContext != EGL14.EGL_NO_CONTEXT) {
                    EGL14.eglDestroyContext(eglDisplay, eglContext);
                }
                EGL14.eglTerminate(eglDisplay);
            }
        } catch (Throwable t) {
            LogUtil.e(TAG, "releaseAll failed", t);
        } finally {
            eglDisplay = EGL14.EGL_NO_DISPLAY;
            eglContext = EGL14.EGL_NO_CONTEXT;
            eglConfig = null;
            glReady = false;
            program = 0;
            textureId = 0;
        }
    }

    public void renderBitmap(Surface surface, Bitmap bitmap, Transform transform) {
        if (surface == null || bitmap == null) return;
        if (!surface.isValid()) return;

        try {
            ensureEgl();

            EGLSurface eglSurface = getOrCreateWindowSurface(surface);
            if (eglSurface == null || eglSurface == EGL14.EGL_NO_SURFACE) return;

            boolean ok = EGL14.eglMakeCurrent(eglDisplay, eglSurface, eglSurface, eglContext);
            if (!ok) {
                LogUtil.e(TAG, "eglMakeCurrent failed; dropping surface");
                releaseSurface(surface);
                return;
            }

            ensureGlObjects();

            int w = querySurface(eglSurface, EGL14.EGL_WIDTH);
            int h = querySurface(eglSurface, EGL14.EGL_HEIGHT);
            if (w <= 0 || h <= 0) {
                w = Math.max(1, bitmap.getWidth());
                h = Math.max(1, bitmap.getHeight());
            }

            GLES20.glViewport(0, 0, w, h);
            GLES20.glClearColor(0f, 0f, 0f, 1f);
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);

            GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, textureId);
            GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bitmap, 0);

            GLES20.glUseProgram(program);

            vertexBuf.position(0);
            GLES20.glEnableVertexAttribArray(aPosLoc);
            GLES20.glVertexAttribPointer(aPosLoc, 2, GLES20.GL_FLOAT, false, 0, vertexBuf);

            texBuf.position(0);
            GLES20.glEnableVertexAttribArray(aTexLoc);
            GLES20.glVertexAttribPointer(aTexLoc, 2, GLES20.GL_FLOAT, false, 0, texBuf);

            float[] mvp = (transform != null) ? transform.mvpMatrix : Transform.identity().mvpMatrix;
            float[] tex = (transform != null) ? transform.texMatrix : Transform.identity().texMatrix;

            GLES20.glUniformMatrix4fv(uMvpLoc, 1, false, mvp, 0);
            GLES20.glUniformMatrix4fv(uTexLoc, 1, false, tex, 0);
            GLES20.glUniform1i(uSamplerLoc, 0);

            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);

            GLES20.glDisableVertexAttribArray(aPosLoc);
            GLES20.glDisableVertexAttribArray(aTexLoc);

            EGL14.eglSwapBuffers(eglDisplay, eglSurface);

        } catch (Throwable t) {
            LogUtil.e(TAG, "renderBitmap failed", t);
            releaseSurface(surface);
        }
    }

    private void ensureEgl() {
        if (eglDisplay != EGL14.EGL_NO_DISPLAY) return;

        eglDisplay = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);
        if (eglDisplay == EGL14.EGL_NO_DISPLAY) throw new RuntimeException("eglGetDisplay failed");

        int[] version = new int[2];
        if (!EGL14.eglInitialize(eglDisplay, version, 0, version, 1)) {
            throw new RuntimeException("eglInitialize failed");
        }

        int[] attribs = new int[] {
                EGL14.EGL_RED_SIZE, 8,
                EGL14.EGL_GREEN_SIZE, 8,
                EGL14.EGL_BLUE_SIZE, 8,
                EGL14.EGL_ALPHA_SIZE, 8,
                EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
                EGL14.EGL_SURFACE_TYPE, EGL14.EGL_WINDOW_BIT,
                EGL14.EGL_NONE
        };

        EGLConfig[] configs = new EGLConfig[1];
        int[] num = new int[1];
        if (!EGL14.eglChooseConfig(eglDisplay, attribs, 0, configs, 0, configs.length, num, 0)) {
            throw new RuntimeException("eglChooseConfig failed");
        }
        eglConfig = configs[0];

        int[] ctxAttribs = new int[] {
                EGL14.EGL_CONTEXT_CLIENT_VERSION, 2,
                EGL14.EGL_NONE
        };
        eglContext = EGL14.eglCreateContext(eglDisplay, eglConfig, EGL14.EGL_NO_CONTEXT, ctxAttribs, 0);
        if (eglContext == null || eglContext == EGL14.EGL_NO_CONTEXT) {
            throw new RuntimeException("eglCreateContext failed");
        }

        LogUtil.d(TAG, "EGL initialized");
    }

    private EGLSurface getOrCreateWindowSurface(Surface surface) {
        EGLSurface existing = surfaceMap.get(surface);
        if (existing != null) return existing;

        int[] attribs = new int[] { EGL14.EGL_NONE };
        EGLSurface eglSurface = EGL14.eglCreateWindowSurface(eglDisplay, eglConfig, surface, attribs, 0);
        if (eglSurface == null || eglSurface == EGL14.EGL_NO_SURFACE) {
            LogUtil.e(TAG, "eglCreateWindowSurface failed for: " + surface);
            return EGL14.EGL_NO_SURFACE;
        }
        surfaceMap.put(surface, eglSurface);
        return eglSurface;
    }

    private int querySurface(EGLSurface surface, int what) {
        int[] v = new int[1];
        boolean ok = EGL14.eglQuerySurface(eglDisplay, surface, what, v, 0);
        return ok ? v[0] : 0;
    }

    private void ensureGlObjects() {
        if (glReady) return;

        vertexBuf = allocFloatBuffer(VERTICES);
        texBuf = allocFloatBuffer(TEXCOORDS);

        program = createProgram(VS, FS);
        aPosLoc = GLES20.glGetAttribLocation(program, "aPosition");
        aTexLoc = GLES20.glGetAttribLocation(program, "aTexCoord");
        uMvpLoc = GLES20.glGetUniformLocation(program, "uMvpMatrix");
        uTexLoc = GLES20.glGetUniformLocation(program, "uTexMatrix");
        uSamplerLoc = GLES20.glGetUniformLocation(program, "uTexture");

        int[] tex = new int[1];
        GLES20.glGenTextures(1, tex, 0);
        textureId = tex[0];

        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, textureId);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);

        glReady = true;
        LogUtil.d(TAG, "GL objects ready");
    }

    private static FloatBuffer allocFloatBuffer(float[] data) {
        ByteBuffer bb = ByteBuffer.allocateDirect(data.length * 4);
        bb.order(ByteOrder.nativeOrder());
        FloatBuffer fb = bb.asFloatBuffer();
        fb.put(data);
        fb.position(0);
        return fb;
    }

    private static int createProgram(String vs, String fs) {
        int v = compileShader(GLES20.GL_VERTEX_SHADER, vs);
        int f = compileShader(GLES20.GL_FRAGMENT_SHADER, fs);
        int p = GLES20.glCreateProgram();
        GLES20.glAttachShader(p, v);
        GLES20.glAttachShader(p, f);
        GLES20.glLinkProgram(p);

        int[] link = new int[1];
        GLES20.glGetProgramiv(p, GLES20.GL_LINK_STATUS, link, 0);
        if (link[0] != GLES20.GL_TRUE) {
            String log = GLES20.glGetProgramInfoLog(p);
            GLES20.glDeleteProgram(p);
            throw new RuntimeException("Program link failed: " + log);
        }
        return p;
    }

    private static int compileShader(int type, String src) {
        int s = GLES20.glCreateShader(type);
        GLES20.glShaderSource(s, src);
        GLES20.glCompileShader(s);

        int[] ok = new int[1];
        GLES20.glGetShaderiv(s, GLES20.GL_COMPILE_STATUS, ok, 0);
        if (ok[0] == 0) {
            String log = GLES20.glGetShaderInfoLog(s);
            GLES20.glDeleteShader(s);
            throw new RuntimeException("Shader compile failed: " + log);
        }
        return s;
    }

    private static final String VS =
            "attribute vec4 aPosition;\n" +
            "attribute vec2 aTexCoord;\n" +
            "varying vec2 vTexCoord;\n" +
            "uniform mat4 uMvpMatrix;\n" +
            "uniform mat4 uTexMatrix;\n" +
            "void main() {\n" +
            "  gl_Position = uMvpMatrix * aPosition;\n" +
            "  vec4 tc = uTexMatrix * vec4(aTexCoord, 0.0, 1.0);\n" +
            "  vTexCoord = tc.xy;\n" +
            "}\n";

    private static final String FS =
            "precision mediump float;\n" +
            "varying vec2 vTexCoord;\n" +
            "uniform sampler2D uTexture;\n" +
            "void main() {\n" +
            "  gl_FragColor = texture2D(uTexture, vTexCoord);\n" +
            "}\n";
}
