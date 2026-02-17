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

class FloatingOverlayService : Service() {

    private var windowManager: WindowManager? = null
    private var floatingView: View? = null
    private var expandedView: View? = null
    private var isExpanded = false
    
    private lateinit var prefs: SharedPreferences
    
    companion object {
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "virtucam_overlay_channel"
        
        fun start(context: Context) {
            val intent = Intent(context, FloatingOverlayService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
        
        fun stop(context: Context) {
            context.stopService(Intent(context, FloatingOverlayService::class.java))
        }
    }

    override fun onCreate() {
        super.onCreate()
        
        prefs = getSharedPreferences("virtucam_config", Context.MODE_WORLD_READABLE)
        
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
        
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        
        createFloatingIcon()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "VirtuCam Floating Controls",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Floating overlay controls for real-time adjustments"
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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) 
                PendingIntent.FLAG_IMMUTABLE 
            else 0
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("VirtuCam Floating Controls")
            .setContentText("Tap to return to VirtuCam")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createFloatingIcon() {
        try {
            val layoutInflater = LayoutInflater.from(this)
            floatingView = layoutInflater.inflate(R.layout.floating_bubble_icon, null)

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

            windowManager?.addView(floatingView, params)

            // Make draggable
            floatingView?.setOnTouchListener(FloatingOnTouchListener(params))
            
            // Expand on click
            floatingView?.setOnClickListener {
                if (!isExpanded) {
                    expandPanel()
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("FloatingOverlay", "Failed to create floating icon: ${e.message}")
            stopSelf()
        }
    }

    private fun expandPanel() {
        try {
            val layoutInflater = LayoutInflater.from(this)
            expandedView = layoutInflater.inflate(R.layout.floating_panel, null)

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
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or 
                    WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.CENTER
            }

            windowManager?.addView(expandedView, params)
            isExpanded = true

            // Hide the floating icon
            floatingView?.visibility = View.GONE

            setupPanelControls()
        } catch (e: Exception) {
            android.util.Log.e("FloatingOverlay", "Failed to expand panel: ${e.message}")
        }
    }

    private fun setupPanelControls() {
        expandedView?.let { panel ->
            // Close button
            panel.findViewById<ImageButton>(R.id.btn_close)?.setOnClickListener {
                collapsePanel()
            }

            // Scale mode buttons
            val btnFit = panel.findViewById<Button>(R.id.btn_scale_fit)
            val btnFill = panel.findViewById<Button>(R.id.btn_scale_fill)
            val btnStretch = panel.findViewById<Button>(R.id.btn_scale_stretch)

            btnFit?.setOnClickListener { setScaleMode("fit") }
            btnFill?.setOnClickListener { setScaleMode("fill") }
            btnStretch?.setOnClickListener { setScaleMode("stretch") }

            // Mirror and Flip toggles
            val toggleMirror = panel.findViewById<Switch>(R.id.toggle_mirror)
            val toggleFlip = panel.findViewById<Switch>(R.id.toggle_flip)

            toggleMirror?.isChecked = prefs.getBoolean("mirrored", false)
            toggleFlip?.isChecked = prefs.getBoolean("flippedVertical", false)

            toggleMirror?.setOnCheckedChangeListener { _, isChecked ->
                prefs.edit().putBoolean("mirrored", isChecked).apply()
            }

            toggleFlip?.setOnCheckedChangeListener { _, isChecked ->
                prefs.edit().putBoolean("flippedVertical", isChecked).apply()
            }

            // Position controls
            val btnUp = panel.findViewById<ImageButton>(R.id.btn_offset_up)
            val btnDown = panel.findViewById<ImageButton>(R.id.btn_offset_down)
            val btnLeft = panel.findViewById<ImageButton>(R.id.btn_offset_left)
            val btnRight = panel.findViewById<ImageButton>(R.id.btn_offset_right)
            val btnCenter = panel.findViewById<Button>(R.id.btn_center)

            btnUp?.setOnClickListener { adjustOffset(0f, -0.05f) }
            btnDown?.setOnClickListener { adjustOffset(0f, 0.05f) }
            btnLeft?.setOnClickListener { adjustOffset(-0.05f, 0f) }
            btnRight?.setOnClickListener { adjustOffset(0.05f, 0f) }
            btnCenter?.setOnClickListener { resetOffset() }

            // Display current offset
            updateOffsetDisplay()
        }
    }

    private fun setScaleMode(mode: String) {
        val editor = prefs.edit()
        when (mode) {
            "fit" -> {
                editor.putFloat("scaleX", 1.0f)
                editor.putFloat("scaleY", 1.0f)
            }
            "fill" -> {
                editor.putFloat("scaleX", 1.5f)
                editor.putFloat("scaleY", 1.5f)
            }
            "stretch" -> {
                editor.putFloat("scaleX", 1.0f)
                editor.putFloat("scaleY", 1.2f)
            }
        }
        editor.putString("scaleMode", mode)
        editor.apply()
        
        Toast.makeText(this, "Scale: ${mode.capitalize()}", Toast.LENGTH_SHORT).show()
    }

    private fun adjustOffset(deltaX: Float, deltaY: Float) {
        val currentX = prefs.getFloat("offsetX", 0f)
        val currentY = prefs.getFloat("offsetY", 0f)
        
        val newX = (currentX + deltaX).coerceIn(-1f, 1f)
        val newY = (currentY + deltaY).coerceIn(-1f, 1f)
        
        prefs.edit()
            .putFloat("offsetX", newX)
            .putFloat("offsetY", newY)
            .apply()
        
        updateOffsetDisplay()
    }

    private fun resetOffset() {
        prefs.edit()
            .putFloat("offsetX", 0f)
            .putFloat("offsetY", 0f)
            .apply()
        
        updateOffsetDisplay()
        Toast.makeText(this, "Position centered", Toast.LENGTH_SHORT).show()
    }

    private fun updateOffsetDisplay() {
        expandedView?.let { panel ->
            val offsetX = prefs.getFloat("offsetX", 0f)
            val offsetY = prefs.getFloat("offsetY", 0f)
            
            panel.findViewById<TextView>(R.id.txt_offset_x)?.text = 
                String.format("X: %.2f", offsetX)
            panel.findViewById<TextView>(R.id.txt_offset_y)?.text = 
                String.format("Y: %.2f", offsetY)
        }
    }

    private fun collapsePanel() {
        expandedView?.let {
            windowManager?.removeView(it)
            expandedView = null
        }
        isExpanded = false
        floatingView?.visibility = View.VISIBLE
    }

    override fun onDestroy() {
        super.onDestroy()
        
        try {
            floatingView?.let {
                windowManager?.removeView(it)
                floatingView = null
            }
            expandedView?.let {
                windowManager?.removeView(it)
                expandedView = null
            }
        } catch (e: Exception) {
            android.util.Log.e("FloatingOverlay", "Error removing views: ${e.message}")
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private inner class FloatingOnTouchListener(
        private val params: WindowManager.LayoutParams
    ) : View.OnTouchListener {
        private var initialX = 0
        private var initialY = 0
        private var initialTouchX = 0f
        private var initialTouchY = 0f

        override fun onTouch(v: View, event: MotionEvent): Boolean {
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    return false
                }
                MotionEvent.ACTION_MOVE -> {
                    params.x = initialX + (event.rawX - initialTouchX).toInt()
                    params.y = initialY + (event.rawY - initialTouchY).toInt()
                    windowManager?.updateViewLayout(floatingView, params)
                    return true
                }
            }
            return false
        }
    }
}
