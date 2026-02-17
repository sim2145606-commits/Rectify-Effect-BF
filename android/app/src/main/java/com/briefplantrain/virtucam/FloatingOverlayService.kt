package com.briefplantrain.virtucam

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.*
import android.widget.*
import androidx.core.app.NotificationCompat
import kotlin.math.roundToInt

class FloatingOverlayService : Service() {

    private var windowManager: WindowManager? = null
    private var floatingView: View? = null
    private var isExpanded = false
    
    private lateinit var prefs: SharedPreferences
    
    // UI Components - Bubble
    private var bubbleIcon: View? = null
    
    // UI Components - Panel
    private var panelView: View? = null
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
    private var txtOffsetX: TextView? = null
    private var txtOffsetY: TextView? = null
    
    // Current state
    private var currentScaleMode = "fit"
    private var currentMirrored = false
    private var currentFlipV = false
    private var currentOffsetX = 0f
    private var currentOffsetY = 0f
    
    companion object {
        private const val NOTIFICATION_ID = 9001
        private const val CHANNEL_ID = "virtucam_overlay"
        private const val NUDGE_STEP = 10f
        
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
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val intent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("VirtuCam Overlay Active")
            .setContentText("Tap to return to app")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun loadCurrentState() {
        currentScaleMode = prefs.getString("scaleMode", "fit") ?: "fit"
        currentMirrored = prefs.getBoolean("mirrored", false)
        currentFlipV = prefs.getBoolean("flippedVertical", false)
        currentOffsetX = prefs.getFloat("offsetX", 0f)
        currentOffsetY = prefs.getFloat("offsetY", 0f)
    }

    private fun createFloatingBubble() {
        try {
            val layoutInflater = LayoutInflater.from(this)
            bubbleIcon = layoutInflater.inflate(R.layout.floating_bubble_icon, null)

            val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            }

            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutType,
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
            android.util.Log.e("FloatingOverlay", "Failed to create bubble: ${e.message}")
            stopSelf()
        }
    }

    private fun setupBubbleDrag(params: WindowManager.LayoutParams) {
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f
        var isDragging = false
        var hasMoved = false

        bubbleIcon?.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    isDragging = true
                    hasMoved = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    if (isDragging) {
                        val deltaX = (event.rawX - initialTouchX).toInt()
                        val deltaY = (event.rawY - initialTouchY).toInt()
                        
                        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                            hasMoved = true
                        }
                        
                        params.x = initialX + deltaX
                        params.y = initialY + deltaY
                        windowManager?.updateViewLayout(bubbleIcon, params)
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    isDragging = false
                    if (!hasMoved) {
                        // It was a tap, not a drag
                        expandToPanel()
                    }
                    true
                }
                else -> false
            }
        }
    }

    private fun setupBubbleClick() {
        bubbleIcon?.setOnClickListener {
            expandToPanel()
        }
    }

    private fun expandToPanel() {
        if (isExpanded) return
        
        try {
            removeFloatingView()
            
            val layoutInflater = LayoutInflater.from(this)
            panelView = layoutInflater.inflate(R.layout.floating_panel, null)

            val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            }

            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutType,
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.CENTER
            }

            windowManager?.addView(panelView, params)
            floatingView = panelView
            isExpanded = true

            setupPanelControls()

        } catch (e: Exception) {
            android.util.Log.e("FloatingOverlay", "Failed to expand panel: ${e.message}")
        }
    }

    private fun setupPanelControls() {
        panelView?.let { panel ->
            // Find all controls
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
            txtOffsetX = panel.findViewById(R.id.txtOffsetX)
            txtOffsetY = panel.findViewById(R.id.txtOffsetY)

            // Set initial states
            updateScaleModeButtons()
            toggleMirrorH?.isChecked = currentMirrored
            toggleFlipV?.isChecked = currentFlipV
            updateOffsetDisplay()

            // Scale mode buttons
            btnFit?.setOnClickListener { setScaleMode("fit") }
            btnFill?.setOnClickListener { setScaleMode("fill") }
            btnStretch?.setOnClickListener { setScaleMode("stretch") }

            // Mirror/Flip toggles
            toggleMirrorH?.setOnCheckedChangeListener { _, isChecked ->
                currentMirrored = isChecked
                writeToPrefs("mirrored", isChecked)
            }

            toggleFlipV?.setOnCheckedChangeListener { _, isChecked ->
                currentFlipV = isChecked
                writeToPrefs("flippedVertical", isChecked)
            }

            // Position nudge buttons
            btnNudgeUp?.setOnClickListener { nudgeOffset(0f, -NUDGE_STEP) }
            btnNudgeDown?.setOnClickListener { nudgeOffset(0f, NUDGE_STEP) }
            btnNudgeLeft?.setOnClickListener { nudgeOffset(-NUDGE_STEP, 0f) }
            btnNudgeRight?.setOnClickListener { nudgeOffset(NUDGE_STEP, 0f) }
            btnCenter?.setOnClickListener { centerOffset() }

            // Close button
            btnClose?.setOnClickListener { collapseToIcon() }
        }
    }

    private fun setScaleMode(mode: String) {
        currentScaleMode = mode
        updateScaleModeButtons()
        
        // Calculate scaleX and scaleY based on mode
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
        currentOffsetX += deltaX
        currentOffsetY += deltaY
        
        // Clamp to reasonable range
        currentOffsetX = currentOffsetX.coerceIn(-500f, 500f)
        currentOffsetY = currentOffsetY.coerceIn(-500f, 500f)
        
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
        try {
            val editor = prefs.edit()
            when (value) {
                is Boolean -> editor.putBoolean(key, value)
                is Float -> editor.putFloat(key, value)
                is String -> editor.putString(key, value)
                is Int -> editor.putInt(key, value)
            }
            editor.apply()
            
            // Make file world-readable for Xposed
            try {
                val prefsFile = java.io.File(applicationInfo.dataDir, 
                    "shared_prefs/virtucam_config.xml")
                if (prefsFile.exists()) {
                    prefsFile.setReadable(true, false)
                }
            } catch (e: Exception) {
                android.util.Log.w("FloatingOverlay", "Could not set prefs readable: ${e.message}")
            }
        } catch (e: Exception) {
            android.util.Log.e("FloatingOverlay", "Failed to write prefs: ${e.message}")
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
            floatingView?.let {
                windowManager?.removeView(it)
            }
            floatingView = null
            bubbleIcon = null
            panelView = null
        } catch (e: Exception) {
            android.util.Log.e("FloatingOverlay", "Error removing view: ${e.message}")
        }
    }
}
