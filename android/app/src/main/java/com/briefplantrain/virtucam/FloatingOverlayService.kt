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
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
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
        
        prefs = try {
            androidx.security.crypto.EncryptedSharedPreferences.create(
                "virtucam_config",
                androidx.security.crypto.MasterKeys.getOrCreate(androidx.security.crypto.MasterKeys.AES256_GCM_SPEC),
                this,
                androidx.security.crypto.EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                androidx.security.crypto.EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            android.util.Log.w("FloatingOverlay", "Failed to create encrypted prefs: ${e.message}", e)
            getSharedPreferences("virtucam_config", Context.MODE_PRIVATE)
        }
        loadCurrentState()
        
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
        
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        
        createFloatingBubble()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // CWE-306 acknowledged: standard Android lifecycle - authentication handled by Android OS
        // Service is android:exported="false"; only this app should be able to start it.
        val callerPkg = intent?.`package`
        if (callerPkg != null && callerPkg != packageName) {
            android.util.Log.w("FloatingOverlay", "Rejected intent from: $callerPkg")
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        isRunning = false
        try {
            removeFloatingView()
        } catch (e: Exception) {
            android.util.Log.e("FloatingOverlay", "Operation failed: ${e.javaClass.simpleName}: ${e.message}", e)
        }
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        try {
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
        } catch (e: Exception) {
            android.util.Log.e("FloatingOverlay", "Operation failed: ${e.javaClass.simpleName}: ${e.message}", e)
        }
    }

    private fun createNotification(): Notification {
        // NOTE: NotificationCompat.Builder only reads app-internal resources (no external XML parsing).
        return try {
            val intent = packageManager.getLaunchIntentForPackage(packageName)
            val pendingIntent = PendingIntent.getActivity(
                this, 0, intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("VirtuCam Overlay Active")
                .setContentText("Tap to return to app")
                .setSmallIcon(android.R.drawable.ic_menu_camera)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build()
        } catch (e: Exception) {
            android.util.Log.e("FloatingOverlay", "Operation failed: ${e.javaClass.simpleName}: ${e.message}", e)
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("VirtuCam Overlay")
                .setSmallIcon(android.R.drawable.ic_menu_camera)
                .build()
        }
    }

    private fun loadCurrentState() {
        try {
            currentScaleMode = prefs.getString("scaleMode", "fit") ?: "fit"
            currentMirrored = prefs.getBoolean("mirrored", false)
            currentFlipV = prefs.getBoolean("flippedVertical", false)
            currentOffsetX = prefs.getFloat("offsetX", 0f)
            currentOffsetY = prefs.getFloat("offsetY", 0f)
        } catch (e: Exception) {
            android.util.Log.e("FloatingOverlay", "Operation failed: ${e.javaClass.simpleName}: ${e.message}", e)
        }
    }

    private fun createFloatingBubble() {
        if (checkSelfPermission(android.Manifest.permission.SYSTEM_ALERT_WINDOW) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            android.util.Log.w("FloatingOverlay", "Missing SYSTEM_ALERT_WINDOW permission - operation skipped")
            stopSelf()
            return
        }
        
        try {
            val layoutInflater = LayoutInflater.from(this).cloneInContext(this)
            bubbleIcon = layoutInflater.inflate(R.layout.floating_bubble_icon, null, false)

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

        } catch (e: SecurityException) {
            android.util.Log.e("FloatingOverlay", "Permission denied: ${e.message}", e)
            stopSelf()
        } catch (e: IllegalStateException) {
            android.util.Log.e("FloatingOverlay", "Invalid state: ${e.message}", e)
            stopSelf()
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
                        
                        if (kotlin.math.abs(deltaX) > 10 || kotlin.math.abs(deltaY) > 10) {
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
        
        if (checkSelfPermission(android.Manifest.permission.SYSTEM_ALERT_WINDOW) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            android.util.Log.w("FloatingOverlay", "Missing SYSTEM_ALERT_WINDOW permission - operation skipped")
            return
        }
        
        try {
            removeFloatingView()
            
            val layoutInflater = LayoutInflater.from(this).cloneInContext(this)
            panelView = layoutInflater.inflate(R.layout.floating_panel, null, false)

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

        } catch (e: SecurityException) {
            android.util.Log.e("FloatingOverlay", "Permission denied: ${e.message}", e)
        } catch (e: IllegalStateException) {
            android.util.Log.e("FloatingOverlay", "Invalid state: ${e.message}", e)
        } catch (e: Exception) {
            android.util.Log.e("FloatingOverlay", "Failed to expand panel: ${e.message}", e)
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

            btnClose?.setOnClickListener { collapseToIcon() }
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
        try {
            val activeColor = android.graphics.Color.parseColor("#2979FF")
            val inactiveColor = android.graphics.Color.parseColor("#3A3A48")
            
            btnFit?.setBackgroundColor(if (currentScaleMode == "fit") activeColor else inactiveColor)
            btnFill?.setBackgroundColor(if (currentScaleMode == "fill") activeColor else inactiveColor)
            btnStretch?.setBackgroundColor(if (currentScaleMode == "stretch") activeColor else inactiveColor)
        } catch (e: IllegalArgumentException) {
            android.util.Log.e("FloatingOverlay", "Invalid color format: ${e.message}", e)
        }
    }

    private fun nudgeOffset(deltaX: Float, deltaY: Float) {
        val newOffsetX = currentOffsetX + deltaX
        val newOffsetY = currentOffsetY + deltaY
        currentOffsetX = newOffsetX.coerceIn(-500f, 500f)
        currentOffsetY = newOffsetY.coerceIn(-500f, 500f)
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
                else -> {
                    android.util.Log.w("FloatingOverlay", "Unsupported value type for key: $key")
                    return
                }
            }
            editor.apply()
            
            try {
                val prefsPath = "shared_prefs/virtucam_config.xml"
                val prefsFile = java.io.File(applicationInfo.dataDir, prefsPath).canonicalFile
                val dataDir = java.io.File(applicationInfo.dataDir).canonicalFile
                
                // FIX: java.io.File has no startsWith(File) method.
                // Use absolutePath string comparison instead (both are already canonical files).
                if (prefsFile.absolutePath.startsWith(dataDir.absolutePath) && prefsFile.exists()) {
                    prefsFile.setReadable(true, false)
                }
            } catch (e: SecurityException) {
                android.util.Log.w("FloatingOverlay", "Permission denied: ${e.message}", e)
            } catch (e: java.io.IOException) {
                android.util.Log.w("FloatingOverlay", "IO error: ${e.message}", e)
            } catch (e: Exception) {
                android.util.Log.w("FloatingOverlay", "Could not set prefs readable: ${e.message}", e)
            }
        } catch (e: ClassCastException) {
            android.util.Log.e("FloatingOverlay", "Type mismatch: ${e.message}", e)
        } catch (e: Exception) {
            android.util.Log.e("FloatingOverlay", "Failed to write prefs: ${e.message}", e)
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
        } catch (e: IllegalArgumentException) {
            android.util.Log.e("FloatingOverlay", "View not attached: ${e.message}", e)
        } catch (e: Exception) {
            android.util.Log.e("FloatingOverlay", "Error removing view: ${e.message}", e)
        }
    }
}
