package com.briefplantrain.virtucam

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        // Only restart if overlay permission is still granted
        if (!Settings.canDrawOverlays(context)) return

        // Only restart if user had overlay enabled (check prefs)
        val prefs = context.getSharedPreferences("virtucam_config", Context.MODE_PRIVATE)
        val wasEnabled = prefs.getBoolean("overlayEnabled", false)
        if (!wasEnabled) return

        val serviceIntent = Intent(context, FloatingOverlayService::class.java).apply {
            `package` = context.packageName
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }
    }
}
