package com.solarguard.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class OutageAlarmService : Service() {

    private var mediaPlayer: MediaPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private var stopRunnable: Runnable? = null

    companion object {
        private const val NOTIFICATION_ID = 9110
        private const val CHANNEL_ID = "solarguard_native_alarm_channel_v2"
        private const val CHANNEL_NAME = "SolarGuard Native Alarms"
        
        const val ACTION_START = "com.solarguard.alarm.ACTION_START"
        const val ACTION_STOP = "com.solarguard.alarm.ACTION_STOP"
        
        const val EXTRA_SOUND_NAME = "extra_sound_name"
        const val EXTRA_DURATION = "extra_duration"

        @Volatile
        var isPlaying: Boolean = false
            private set

        fun start(context: Context, soundName: String, durationSeconds: Int) {
            val intent = Intent(context, OutageAlarmService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_SOUND_NAME, soundName)
                putExtra(EXTRA_DURATION, durationSeconds)
            }
            if (isPlaying) {
                // If already playing, update settings/duration without restarting foreground service
                context.startService(intent)
                return
            }
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, OutageAlarmService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action == ACTION_STOP) {
            shutdown()
            return START_NOT_STICKY
        }

        if (action == ACTION_START) {
            val soundName = intent.getStringExtra(EXTRA_SOUND_NAME) ?: "alarm"
            val durationSeconds = intent.getIntExtra(EXTRA_DURATION, 10)
            
            if (isPlaying) {
                scheduleAutoStop(durationSeconds)
                return START_STICKY
            }

            isPlaying = true
            acquireWakeLock()
            startForegroundNotification()
            playAlarmSound(soundName)
            scheduleAutoStop(durationSeconds)
        }

        return START_STICKY
    }

    private fun acquireWakeLock() {
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SolarGuard::AlarmWakeLock").apply {
                acquire(10 * 60 * 1000L) // Max 10 minutes
            }
        } catch (e: Exception) {
            // Ignore
        }
    }

    private fun startForegroundNotification() {
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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID, 
                notification, 
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Emergency alarms for SolarGuard power cuts"
                setSound(null, null) // Silent channel: MediaPlayer plays sound explicitly
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 250, 500)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun playAlarmSound(soundName: String) {
        try {
            val resId = resources.getIdentifier(soundName, "raw", packageName)
            if (resId == 0) {
                val fallbackId = resources.getIdentifier("alarm", "raw", packageName)
                if (fallbackId != 0) {
                    initMediaPlayer(fallbackId)
                }
                return
            }
            initMediaPlayer(resId)
        } catch (e: Exception) {
            // Ignore
        }
    }

    private fun initMediaPlayer(resId: Int) {
        mediaPlayer = MediaPlayer.create(this, resId).apply {
            isLooping = true
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            start()
        }
    }

    private fun scheduleAutoStop(durationSeconds: Int) {
        stopRunnable?.let { handler.removeCallbacks(it) }

        val runnable = Runnable {
            shutdown()
        }
        stopRunnable = runnable
        handler.postDelayed(runnable, durationSeconds * 1000L)
    }

    private fun shutdown() {
        isPlaying = false
        
        try {
            mediaPlayer?.apply {
                if (isPlaying) {
                    stop()
                }
                release()
            }
            mediaPlayer = null
        } catch (e: Exception) {
            // Ignore
        }

        stopRunnable?.let { handler.removeCallbacks(it) }

        try {
            wakeLock?.apply {
                if (isHeld) {
                    release()
                }
            }
            wakeLock = null
        } catch (e: Exception) {
            // Ignore
        }

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        shutdown()
        super.onDestroy()
    }
}
