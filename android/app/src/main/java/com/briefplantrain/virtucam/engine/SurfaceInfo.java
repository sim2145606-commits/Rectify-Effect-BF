package com.briefplantrain.virtucam.engine;

public final class SurfaceInfo {

    public enum Kind {
        SURFACE_TEXTURE,
        IMAGE_READER,
        SURFACE_VIEW,
        UNKNOWN
    }

    public final Kind kind;
    public final int width;
    public final int height;
    public final int format;
    public final String note;

    public SurfaceInfo(Kind kind, int width, int height, int format, String note) {
        this.kind = kind != null ? kind : Kind.UNKNOWN;
        this.width = width;
        this.height = height;
        this.format = format;
        this.note = note != null ? note : "";
    }

    public static SurfaceInfo unknown() {
        return new SurfaceInfo(Kind.UNKNOWN, 0, 0, 0, "");
    }

    public SurfaceInfo withSize(int w, int h) {
        return new SurfaceInfo(this.kind, w, h, this.format, this.note);
    }
}
