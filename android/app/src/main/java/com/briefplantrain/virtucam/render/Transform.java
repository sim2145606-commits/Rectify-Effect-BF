package com.briefplantrain.virtucam.render;

import android.opengl.Matrix;

import com.briefplantrain.virtucam.config.ConfigSnapshot;

/**
 * MVP + texture matrix pair for frame rendering transforms.
 *
 * Builds actual transformation matrices from ConfigSnapshot values:
 * rotation, mirrored, scaleX, scaleY, offsetX, offsetY.
 */
public final class Transform {

    public final float[] mvpMatrix = new float[16];
    public final float[] texMatrix = new float[16];

    public Transform() {
        Matrix.setIdentityM(mvpMatrix, 0);
        Matrix.setIdentityM(texMatrix, 0);
    }

    /** Identity transform — no rotation, scale, mirror, or offset. */
    public static Transform identity() {
        return new Transform();
    }

    /**
     * Build a transform from the current config snapshot.
     *
     * Apply order (MVP): Translate → Rotate → Scale → Mirror
     * Apply order (Tex): Identity (texture coords are pre-set in quad)
     */
    public static Transform fromConfig(ConfigSnapshot cfg) {
        if (cfg == null) return identity();

        Transform t = new Transform();

        // Start with identity MVP
        Matrix.setIdentityM(t.mvpMatrix, 0);

        // 1. Offset (translate) — NDC space: [-1, 1]
        if (cfg.offsetX != 0f || cfg.offsetY != 0f) {
            Matrix.translateM(t.mvpMatrix, 0, cfg.offsetX, cfg.offsetY, 0f);
        }

        // 2. Rotation — degrees around Z axis
        if (cfg.rotation != 0) {
            Matrix.rotateM(t.mvpMatrix, 0, cfg.rotation, 0f, 0f, 1f);
        }

        // 3. Scale
        float sx = cfg.scaleX;
        float sy = cfg.scaleY;
        if (sx != 1f || sy != 1f) {
            Matrix.scaleM(t.mvpMatrix, 0, sx, sy, 1f);
        }

        // 4. Mirror (horizontal flip)
        if (cfg.mirrored) {
            Matrix.scaleM(t.mvpMatrix, 0, -1f, 1f, 1f);
        }

        // Texture matrix stays identity — the source texture is not transformed,
        // only the quad geometry is. This avoids texture coordinate issues with
        // external OES textures from SurfaceTexture.
        Matrix.setIdentityM(t.texMatrix, 0);

        return t;
    }
}
