package com.briefplantrain.virtucam.render;

import android.opengl.Matrix;

public final class Transform {
    public final float[] mvpMatrix = new float[16];
    public final float[] texMatrix = new float[16];

    public Transform() {
        Matrix.setIdentityM(mvpMatrix, 0);
        Matrix.setIdentityM(texMatrix, 0);
    }

    public static Transform identity() {
        return new Transform();
    }
}
