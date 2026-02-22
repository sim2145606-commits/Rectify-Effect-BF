#!/usr/bin/env bash
# Build VirtuCam Companion module ZIP
# Usage: ./build.sh [--clean]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../out"
ZIP_NAME="virtucam-companion.zip"

[ "${1:-}" = "--clean" ] && rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

cd "$SCRIPT_DIR"

echo "Building $ZIP_NAME..."

zip -r "$OUT_DIR/$ZIP_NAME" \
    module.prop \
    customize.sh \
    post-fs-data.sh \
    service.sh \
    action.sh \
    uninstall.sh \
    sepolicy.rule \
    update.json \
    META-INF/ \
    webroot/ \
    -x "*.DS_Store" -x "*.git*"

echo "Output: $OUT_DIR/$ZIP_NAME"
if command -v sha256sum >/dev/null 2>&1; then
    echo "SHA256: $(sha256sum "$OUT_DIR/$ZIP_NAME" | cut -d' ' -f1)"
elif command -v shasum >/dev/null 2>&1; then
    echo "SHA256: $(shasum -a 256 "$OUT_DIR/$ZIP_NAME" | cut -d' ' -f1)"
fi
