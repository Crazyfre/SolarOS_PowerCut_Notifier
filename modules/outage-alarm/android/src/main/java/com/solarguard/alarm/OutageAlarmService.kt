package com.solarguard.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

enum class AlarmState {
    IDLE,
    STARTING,
    PLAYING,
    STOPPING
}

class OutageAlarmService : Service() {

    private var alarmPlayer: AlarmPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private var stopRunnable: Runnable? = null

    companion object {
        private const val TAG = "SolarGuardAlarm"
        private const val NOTIFICATION_ID = 9110
        private const val CHANNEL_ID = "solarguard_native_alarm_channel_v3"
        private const val CHANNEL_NAME = "SolarGuard Native Alarms"
        
        const val ACTION_START = "com.solarguard.alarm.ACTION_START"
        const val ACTION_STOP = "com.solarguard.alarm.ACTION_STOP"
        
        const val EXTRA_REASON = "extra_reason"
        const val EXTRA_SOUND_NAME = "extra_sound_name"
        const val EXTRA_DURATION = "extra_duration"

        private const val COOLDOWN_MS = 60000L

        @Volatile
        var currentState: AlarmState = AlarmState.IDLE
            private set

        @Volatile
        private var lastTriggerTime: Long = 0

        val isPlaying: Boolean
            get() = currentState == AlarmState.PLAYING

        fun start(context: Context, reason: String, soundName: String, durationSeconds: Int) {
            val now = System.currentTimeMillis()
            
            if (currentState != AlarmState.IDLE) {
                Log.d(TAG, "[Alarm Ignored] Reason: Already Running (State: $currentState)")
                return
            }

            if (reason != "GRID_RESTORED" && now - lastTriggerTime < COOLDOWN_MS) {
                val elapsed = now - lastTriggerTime
                Log.d(TAG, "[Alarm Ignored] Reason: Cooldown Active (Elapsed: ${elapsed / 1000}s / ${COOLDOWN_MS / 1000}s)")
                return
            }

            lastTriggerTime = now

            val intent = Intent(context, OutageAlarmService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_REASON, reason)
                putExtra(EXTRA_SOUND_NAME, soundName)
                putExtra(EXTRA_DURATION, durationSeconds)
            }
            
            context.startService(intent)
        }

        fun stop(context: Context) {
            try {
                Log.d(TAG, "[Alarm Dismissed] Stop requested.")
                val intent = Intent(context, OutageAlarmService::class.java)
                context.stopService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to stop OutageAlarmService", e)
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action == null) {
            Log.w(TAG, "[Unexpected Shutdown/Restart] Service started with null intent or action. Shutting down service.")
            shutdown()
            return START_NOT_STICKY
        }

        if (action == ACTION_STOP) {
            Log.d(TAG, "[Alarm Dismissed] Stop action requested.")
            shutdown()
            return START_NOT_STICKY
        }

        if (action == ACTION_START) {
            val reason = intent.getStringExtra(EXTRA_REASON) ?: "Unknown"
            val soundName = intent.getStringExtra(EXTRA_SOUND_NAME) ?: "alarm"
            val durationSeconds = intent.getIntExtra(EXTRA_DURATION, 10)

            currentState = AlarmState.STARTING
            Log.d(TAG, "[Alarm Triggered] Reason: $reason, Sound: $soundName, Duration: ${durationSeconds}s")

            showNotification()

            alarmPlayer = AlarmPlayer(this)
            val success = alarmPlayer?.play(soundName) ?: false

            if (success) {
                currentState = AlarmState.PLAYING
                acquireWakeLock(durationSeconds)
                scheduleAutoStop(durationSeconds)
            } else {
                Log.e(TAG, "[Alarm Failed] Failed to initiate audio playback.")
                shutdown()
            }
        } else {
            Log.w(TAG, "[Invalid Intent Received] Unknown action: $action. Shutting down service.")
            shutdown()
        }

        return START_NOT_STICKY
    }

    private fun acquireWakeLock(durationSeconds: Int) {
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            val timeoutMs = (durationSeconds + 5) * 1000L
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SolarGuard::AlarmWakeLock").apply {
                acquire(timeoutMs)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire WakeLock", e)
        }
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.apply {
                if (isHeld) {
                    release()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to release WakeLock", e)
        } finally {
            wakeLock = null
        }
    }

    private fun showNotification() {
        createNotificationChannel()

        val dismissIntent = Intent(this, OutageAlarmService::class.java).apply {
            action = ACTION_STOP
        }
        val dismissPendingIntent = PendingIntent.getService(
            this,
            0,
            dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val packageName = packageName
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val contentPendingIntent = launchIntent?.let {
            PendingIntent.getActivity(
                this,
                1,
                it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🚨 SolarGuard Critical Alarm")
            .setContentText("Emergency outage event detected!")
            .setSmallIcon(resources.getIdentifier("notification_icon", "drawable", packageName).let { 
                if (it != 0) it else android.R.drawable.ic_lock_idle_alarm
            })
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(contentPendingIntent)
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Dismiss Alarm",
                dismissPendingIntent
            )
            .build()

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, notification)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Emergency alarms for SolarGuard power cuts"
                setSound(null, null)
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 250, 500)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun scheduleAutoStop(durationSeconds: Int) {
        stopRunnable?.let { handler.removeCallbacks(it) }

        val runnable = Runnable {
            Log.d(TAG, "[Alarm Auto-Stopped] Duration elapsed.")
            shutdown()
        }
        stopRunnable = runnable
        handler.postDelayed(runnable, durationSeconds * 1000L)
    }

    private fun shutdown() {
        if (currentState == AlarmState.IDLE || currentState == AlarmState.STOPPING) {
            return
        }

        currentState = AlarmState.STOPPING

        releaseWakeLock()

        try {
            alarmPlayer?.stop()
        } catch (e: Exception) {
            // Ignore
        } finally {
            alarmPlayer = null
        }

        stopRunnable?.let { handler.removeCallbacks(it) }

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(NOTIFICATION_ID)
        stopSelf()

        currentState = AlarmState.IDLE
    }

    override fun onDestroy() {
        Log.d(TAG, "[Alarm Service Destroyed]")
        shutdown()
        super.onDestroy()
    }
}
