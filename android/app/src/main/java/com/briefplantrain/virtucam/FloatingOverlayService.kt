package com.briefplantrain.virtucam

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageButton
import android.widget.TextView
import android.widget.ToggleButton
import androidx.core.app.NotificationCompat
import kotlin.math.abs
import kotlin.math.roundToInt

class FloatingOverlayService : Service() {

    private var windowManager: WindowManager? = null
    private var floatingView: View? = null
    private var bubbleIcon: View? = null
    private var panelView: View? = null
    private var isExpanded = false

    private lateinit var prefs: SharedPreferences

    private var btnFit: Button? = null
    private var btnFill: Button? = null
    private var btnStretch: Button? = null
    private var toggleMirrorH: ToggleButton? = null
    private var toggleFlipV: ToggleButton? = null
    private var btnNudgeUp: ImageButton? = null
    private var btnNudgeDown: ImageButton? = null
    private var btnNudgeLeft: ImageButton? = null
    private var btnNudgeRight: ImageButton? = null
    private var btnCenter: Button? = null
    private var btnClose: ImageButton? = null
    private var btnMinimize: ImageButton? = null
    private var txtOffsetX: TextView? = null
    private var txtOffsetY: TextView? = null

    private var currentScaleMode = "fit"
    private var currentMirrored = false
    private var currentFlipV = false
    private var currentOffsetX = 0f
    private var currentOffsetY = 0f

    companion object {
        private const val NOTIFICATION_ID = 9001
        private const val CHANNEL_ID = "virtucam_overlay"
        private const val NUDGE_STEP = 10f
        private const val PREF_PANEL_X = "overlayPanelX"
        private const val PREF_PANEL_Y = "overlayPanelY"

        @Volatile
        private var isRunning = false

        fun isServiceRunning(): Boolean = isRunning
    }

    override fun onCreate() {
        super.onCreate()
        isRunning = true

        prefs = getSharedPreferences("virtucam_config", Context.MODE_PRIVATE)
        loadCurrentState()

        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())

        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createFloatingBubble()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action != null && intent.action != Intent.ACTION_MAIN) {
            android.util.Log.w("FloatingOverlay", "Rejected unexpected action: ${intent.action}")
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        isRunning = false
        removeFloatingView()
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "VirtuCam Floating Overlay",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Floating controls for VirtuCam"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            ?: Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }

        val pendingIntent = try {
            PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
        } catch (e: RuntimeException) {
            android.util.Log.e("FloatingOverlay", "Failed to create pending intent", e)
            null
        }

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("VirtuCam Overlay Active")
            .setContentText("Tap to return to app")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)

        if (pendingIntent != null) {
            builder.setContentIntent(pendingIntent)
        }

        return builder.build()
    }

    private fun loadCurrentState() {
        currentScaleMode = prefs.getString("scaleMode", "fit") ?: "fit"
        currentMirrored = prefs.getBoolean("mirrored", false)
        currentFlipV = prefs.getBoolean("flippedVertical", false)
        currentOffsetX = prefs.getFloat("offsetX", 0f)
        currentOffsetY = prefs.getFloat("offsetY", 0f)
    }

    private fun createFloatingBubble() {
        if (!android.provider.Settings.canDrawOverlays(this)) {
            android.util.Log.w("FloatingOverlay", "Missing overlay permission")
            stopSelf()
            return
        }

        try {
            val layoutInflater = LayoutInflater.from(this).cloneInContext(this)
            bubbleIcon = layoutInflater.inflate(R.layout.floating_bubble_icon, null, false)

            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                overlayWindowType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                x = 100
                y = 100
            }

            windowManager?.addView(bubbleIcon, params)
            floatingView = bubbleIcon
            setupBubbleDrag(params)
            setupBubbleClick()
        } catch (e: Exception) {
            android.util.Log.e("FloatingOverlay", "Failed to create bubble: ${e.message}", e)
            stopSelf()
        }
    }

    private fun setupBubbleDrag(params: WindowManager.LayoutParams) {
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f
        var hasMoved = false

        bubbleIcon?.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    hasMoved = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val deltaX = (event.rawX - initialTouchX).toInt()
                    val deltaY = (event.rawY - initialTouchY).toInt()

                    if (abs(deltaX) > 10 || abs(deltaY) > 10) {
                        hasMoved = true
                    }

                    params.x = initialX + deltaX
                    params.y = initialY + deltaY
                    windowManager?.updateViewLayout(bubbleIcon, params)
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!hasMoved) {
                        expandToPanel()
                    }
                    true
                }
                else -> false
            }
        }
    }

    private fun setupBubbleClick() {
        bubbleIcon?.setOnClickListener { expandToPanel() }
    }

    private fun expandToPanel() {
        if (isExpanded) return
        if (!android.provider.Settings.canDrawOverlays(this)) return

        try {
            removeFloatingView()
            val layoutInflater = LayoutInflater.from(this).cloneInContext(this)
            panelView = layoutInflater.inflate(R.layout.floating_panel, null, false)

            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                overlayWindowType(),
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                x = prefs.getInt(PREF_PANEL_X, 80)
                y = prefs.getInt(PREF_PANEL_Y, 200)
            }

            windowManager?.addView(panelView, params)
            floatingView = panelView
            isExpanded = true

            setupPanelControls()
            setupPanelDrag(params)
        } catch (e: Exception) {
            android.util.Log.e("FloatingOverlay", "Failed to expand panel: ${e.message}", e)
        }
    }

    private fun setupPanelDrag(params: WindowManager.LayoutParams) {
        val header = panelView?.findViewById<View>(R.id.panelHeader) ?: return
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f

        header.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    params.x = initialX + (event.rawX - initialTouchX).toInt()
                    params.y = initialY + (event.rawY - initialTouchY).toInt()
                    windowManager?.updateViewLayout(panelView, params)
                    true
                }
                MotionEvent.ACTION_UP -> {
                    writeToPrefs(PREF_PANEL_X, params.x)
                    writeToPrefs(PREF_PANEL_Y, params.y)
                    true
                }
                else -> false
            }
        }
    }

    private fun setupPanelControls() {
        panelView?.let { panel ->
            btnFit = panel.findViewById(R.id.btnFit)
            btnFill = panel.findViewById(R.id.btnFill)
            btnStretch = panel.findViewById(R.id.btnStretch)
            toggleMirrorH = panel.findViewById(R.id.toggleMirrorH)
            toggleFlipV = panel.findViewById(R.id.toggleFlipV)
            btnNudgeUp = panel.findViewById(R.id.btnNudgeUp)
            btnNudgeDown = panel.findViewById(R.id.btnNudgeDown)
            btnNudgeLeft = panel.findViewById(R.id.btnNudgeLeft)
            btnNudgeRight = panel.findViewById(R.id.btnNudgeRight)
            btnCenter = panel.findViewById(R.id.btnCenter)
            btnClose = panel.findViewById(R.id.btnClose)
            btnMinimize = panel.findViewById(R.id.btnMinimize)
            txtOffsetX = panel.findViewById(R.id.txtOffsetX)
            txtOffsetY = panel.findViewById(R.id.txtOffsetY)

            updateScaleModeButtons()
            toggleMirrorH?.isChecked = currentMirrored
            toggleFlipV?.isChecked = currentFlipV
            updateOffsetDisplay()

            btnFit?.setOnClickListener { setScaleMode("fit") }
            btnFill?.setOnClickListener { setScaleMode("fill") }
            btnStretch?.setOnClickListener { setScaleMode("stretch") }
            toggleMirrorH?.setOnCheckedChangeListener { _, isChecked ->
                currentMirrored = isChecked
                writeToPrefs("mirrored", isChecked)
            }
            toggleFlipV?.setOnCheckedChangeListener { _, isChecked ->
                currentFlipV = isChecked
                writeToPrefs("flippedVertical", isChecked)
            }
            btnNudgeUp?.setOnClickListener { nudgeOffset(0f, -NUDGE_STEP) }
            btnNudgeDown?.setOnClickListener { nudgeOffset(0f, NUDGE_STEP) }
            btnNudgeLeft?.setOnClickListener { nudgeOffset(-NUDGE_STEP, 0f) }
            btnNudgeRight?.setOnClickListener { nudgeOffset(NUDGE_STEP, 0f) }
            btnCenter?.setOnClickListener { centerOffset() }

            btnMinimize?.setOnClickListener { collapseToIcon() }
            btnClose?.setOnClickListener {
                writeToPrefs("overlayEnabled", false)
                stopSelf()
            }
        }
    }

    private fun setScaleMode(mode: String) {
        currentScaleMode = mode
        updateScaleModeButtons()

        val (scaleX, scaleY) = when (mode) {
            "fit" -> Pair(1.0f, 1.0f)
            "fill" -> Pair(1.5f, 1.5f)
            "stretch" -> Pair(1.0f, 1.5f)
            else -> Pair(1.0f, 1.0f)
        }

        writeToPrefs("scaleMode", mode)
        writeToPrefs("scaleX", scaleX)
        writeToPrefs("scaleY", scaleY)
    }

    private fun updateScaleModeButtons() {
        val activeColor = android.graphics.Color.parseColor("#2979FF")
        val inactiveColor = android.graphics.Color.parseColor("#3A3A48")

        btnFit?.setBackgroundColor(if (currentScaleMode == "fit") activeColor else inactiveColor)
        btnFill?.setBackgroundColor(if (currentScaleMode == "fill") activeColor else inactiveColor)
        btnStretch?.setBackgroundColor(if (currentScaleMode == "stretch") activeColor else inactiveColor)
    }

    private fun nudgeOffset(deltaX: Float, deltaY: Float) {
        currentOffsetX = (currentOffsetX + deltaX).coerceIn(-500f, 500f)
        currentOffsetY = (currentOffsetY + deltaY).coerceIn(-500f, 500f)
        updateOffsetDisplay()
        writeToPrefs("offsetX", currentOffsetX)
        writeToPrefs("offsetY", currentOffsetY)
    }

    private fun centerOffset() {
        currentOffsetX = 0f
        currentOffsetY = 0f
        updateOffsetDisplay()
        writeToPrefs("offsetX", currentOffsetX)
        writeToPrefs("offsetY", currentOffsetY)
    }

    private fun updateOffsetDisplay() {
        txtOffsetX?.text = "X: ${currentOffsetX.roundToInt()}"
        txtOffsetY?.text = "Y: ${currentOffsetY.roundToInt()}"
    }

    private fun writeToPrefs(key: String, value: Any) {
        val editor = prefs.edit()
        when (value) {
            is Boolean -> editor.putBoolean(key, value)
            is Float -> editor.putFloat(key, value)
            is String -> editor.putString(key, value)
            is Int -> editor.putInt(key, value)
            else -> return
        }
        editor.apply()

        // Also write to IPC JSON so the Xposed hook picks up changes immediately
        flushToIpcJson()
    }

    /**
     * Serialize current overlay settings to IPC JSON so the hook process
     * can read them without relying on XSharedPreferences.
     */
    private fun flushToIpcJson() {
        try {
            val configDir = java.io.File(com.briefplantrain.virtucam.util.VirtuCamIPC.PERSISTENT_CONFIG_DIR)
            if (!configDir.exists()) configDir.mkdirs()
            if (!configDir.exists() || !configDir.canWrite()) return

            // Read existing config JSON if present, overlay our values
            val configFile = java.io.File(com.briefplantrain.virtucam.util.VirtuCamIPC.PERSISTENT_JSON)
            val json = if (configFile.exists() && configFile.canRead()) {
                try { org.json.JSONObject(configFile.readText()) } catch (_: Throwable) { org.json.JSONObject() }
            } else {
                org.json.JSONObject()
            }

            json.put("mirrored", currentMirrored)
            json.put("scaleMode", currentScaleMode)
            json.put("offsetX", currentOffsetX.toDouble())
            json.put("offsetY", currentOffsetY.toDouble())

            // Derive scaleX/scaleY from scaleMode — must match setScaleMode() values
            when (currentScaleMode) {
                "fit" -> { json.put("scaleX", 1.0); json.put("scaleY", 1.0) }
                "fill" -> { json.put("scaleX", 1.5); json.put("scaleY", 1.5) }
                "stretch" -> { json.put("scaleX", 1.0); json.put("scaleY", 1.5) }
            }

            // Atomic write: write to .tmp then rename
            val tmpFile = java.io.File(configFile.absolutePath + ".tmp")
            tmpFile.writeText(json.toString())
            tmpFile.setReadable(true, false)
            tmpFile.renameTo(configFile)
        } catch (_: Throwable) {
            // Best-effort — don't crash the overlay if IPC write fails
        }
    }

    private fun collapseToIcon() {
        if (!isExpanded) return
        removeFloatingView()
        isExpanded = false
        createFloatingBubble()
    }

    private fun removeFloatingView() {
        try {
            floatingView?.let { windowManager?.removeView(it) }
        } catch (_: Exception) {
        }
        floatingView = null
        bubbleIcon = null
        panelView = null
    }

    private fun overlayWindowType(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
    }
}
