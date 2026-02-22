#!/system/bin/sh
# VirtuCam Companion - Installation Script
# Runs during module flash in Magisk/KSU/APatch Manager

VIRTUCAM_PKG="com.briefplantrain.virtucam"

ui_print() {
    echo "- $1"
}

abort() {
    ui_print "ERROR: $1"
    rm -rf "$MODPATH"
    exit 1
}

ui_print "======================================"
ui_print "   VirtuCam Companion Module v1.0.0  "
ui_print "======================================"
ui_print " "

# Check Android version (minimum API 26 / Android 8.0)
API="$(getprop ro.build.version.sdk)"
if [ "$API" -lt 26 ]; then
    abort "Android 8.0 (API 26) or higher is required. Detected: API $API"
fi
ui_print "Android API: $API"

# Check if VirtuCam is installed
if pm path "$VIRTUCAM_PKG" >/dev/null 2>&1; then
    ui_print "VirtuCam app: Installed"
else
    ui_print "WARNING: VirtuCam ($VIRTUCAM_PKG) is not installed."
    ui_print "         Install the app before using this module."
fi

# Detect LSPosed installation
LSPD_FOUND=false
for dir in /data/adb/lspd /data/adb/modules/zygisk_lsposed \
           /data/adb/modules/riru_lsposed /data/adb/modules/lsposed \
           /data/adb/modules/zygisk-lsposed; do
    if [ -d "$dir" ]; then
        LSPD_FOUND=true
        ui_print "LSPosed detected at: $dir"
        break
    fi
done

if [ "$LSPD_FOUND" = "false" ]; then
    ui_print "WARNING: LSPosed not detected. Install LSPosed for full functionality."
fi

# Detect root solution
if [ -f /data/adb/ksud ]; then
    ui_print "Root solution: KernelSU"
    ROOT_SOLUTION="ksu"
elif [ -f /data/adb/apd ]; then
    ui_print "Root solution: APatch"
    ROOT_SOLUTION="apatch"
else
    ui_print "Root solution: Magisk"
    ROOT_SOLUTION="magisk"
fi

# Create module log directory
mkdir -p "$MODPATH/logs"

# Write install info
cat > "$MODPATH/install_info.txt" <<EOF
install_date=$(date '+%Y-%m-%d %H:%M:%S')
android_api=$API
root_solution=$ROOT_SOLUTION
lspd_found=$LSPD_FOUND
virtucam_pkg=$VIRTUCAM_PKG
EOF

ui_print " "
ui_print "Installation complete."
ui_print "Reboot to activate the companion module."
ui_print "======================================"
