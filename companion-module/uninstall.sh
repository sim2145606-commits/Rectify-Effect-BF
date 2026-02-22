#!/system/bin/sh
# VirtuCam Companion - uninstall.sh
# Clean up IPC artifacts when module is removed.

IPC_DIR="/dev/virtucam_ipc"

if mountpoint -q "$IPC_DIR" 2>/dev/null; then
    umount -l "$IPC_DIR" 2>/dev/null
fi
rm -rf "$IPC_DIR" 2>/dev/null

# Remove persistent store (optional - uncomment to delete saved config)
# rm -rf /data/adb/virtucam

echo "VirtuCam Companion uninstalled cleanly."
