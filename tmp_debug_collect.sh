#!/system/bin/sh
RUNTIME_STALE_MS=180000
extract_line_timestamp_key() {
  printf '%s\n' "$1" | sed -n 's/^\[[[:space:]]*\([0-9][0-9-]*T[0-9:.]*\).*/\1/p' | head -n 1
}
get_latest_lspd_line() {
  pattern="$1"
  lines="$(grep -h "$pattern" /data/adb/lspd/log/modules_*.log /data/adb/lspd/log.old/modules_*.log 2>/dev/null)"
  keyed="$(printf '%s\n' "$lines" | sed -n 's/^\[[[:space:]]*\([0-9][0-9-]*T[0-9:.]*\).*$/\1|&/p')"
  printf '%s\n' "$keyed" | sort | tail -n 1 | cut -d'|' -f2-
}
parse_line_epoch_ms() {
  line="$1"
  iso="$(extract_line_timestamp_key "$line")"
  iso_base="$(printf '%s' "$iso" | cut -d'.' -f1)"
  bb="$(command -v busybox 2>/dev/null)"
  sec=""
  if [ -n "$bb" ] && [ -x "$bb" ]; then
    sec="$($bb date -D '%Y-%m-%dT%H:%M:%S' -d "$iso_base" +%s 2>/dev/null)"
    if [ -z "$sec" ]; then
      sec="$($bb date -d "$iso_base" +%s 2>/dev/null)"
    fi
  fi
  if [ -z "$sec" ]; then
    sec="$(date -d "$iso_base" +%s 2>/dev/null)"
  fi
  echo $((sec * 1000))
}
active_line="$(get_latest_lspd_line 'VirtuCam/XposedEntry: module active in process:')"
mapping_line="$(get_latest_lspd_line 'VirtuCam/XposedEntry: createCaptureSession')"
active_key="$(extract_line_timestamp_key "$active_line")"
mapping_key="$(extract_line_timestamp_key "$mapping_line")"
selected_line="$mapping_line"
if [ "$active_key" \> "$mapping_key" ]; then selected_line="$active_line"; fi
epoch_ms="$(parse_line_epoch_ms "$selected_line")"
now_ms="$(date '+%s000')"
age_ms=$((now_ms - epoch_ms))
fresh=false
if [ "$age_ms" -le "$RUNTIME_STALE_MS" ]; then fresh=true; fi
echo "ACTIVE_KEY=$active_key"
echo "MAPPING_KEY=$mapping_key"
echo "SELECTED=$selected_line"
echo "EPOCH=$epoch_ms"
echo "NOW=$now_ms"
echo "AGE=$age_ms"
echo "FRESH=$fresh"
