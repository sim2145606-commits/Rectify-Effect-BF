#!/system/bin/sh
active_line=$(grep -h 'VirtuCam/XposedEntry: module active in process:' /data/adb/lspd/log/modules_*.log /data/adb/lspd/log.old/modules_*.log 2>/dev/null | tail -n 1)
mapping_line=$(grep -h 'VirtuCam/XposedEntry: createCaptureSession' /data/adb/lspd/log/modules_*.log /data/adb/lspd/log.old/modules_*.log 2>/dev/null | tail -n 1)
extract_ts() {
  echo "$1" | sed -n 's/^\[[[:space:]]*\([0-9][0-9-]*T[0-9:.]*\).*/\1/p' | head -n1
}
iso=$(extract_ts "$mapping_line")
iso_base=$(echo "$iso" | cut -d'.' -f1)
bb=$(command -v busybox)
echo "ACTIVE=$active_line"
echo "MAPPING=$mapping_line"
echo "ISO=$iso"
echo "ISO_BASE=$iso_base"
echo "BB=$bb"
if [ -n "$bb" ] && [ -x "$bb" ]; then
  sec=$($bb date -D '%Y-%m-%dT%H:%M:%S' -d "$iso_base" +%s 2>/dev/null)
  echo "SEC_BB=$sec"
fi
sec2=$(date -d "$iso_base" +%s 2>/dev/null)
echo "SEC_DATE=$sec2"
