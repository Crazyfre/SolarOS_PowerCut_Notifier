package com.solarguard.alarm

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.util.Log
import java.util.concurrent.Executors

class AlarmPlayer private constructor(private val context: Context) {
    
    companion object {
        private const val TAG = "SolarGuardAlarm"
        
        @Volatile
        private var instance: AlarmPlayer? = null
        
        private val executor = Executors.newSingleThreadExecutor()
        
        @Volatile
        private var mediaPlayer: MediaPlayer? = null
        
        @Volatile
        private var isPlayingVal: Boolean = false

        fun getInstance(context: Context): AlarmPlayer {
            return instance ?: synchronized(this) {
                instance ?: AlarmPlayer(context.applicationContext).also { instance = it }
            }
        }
    }

    /**
     * Start playing the given sound in a loop on a background thread.
     * Returns true if the sound resource is valid and preparation is queued, false otherwise.
     */
    fun play(soundName: String, triggerTime: Long): Boolean {
        val playStartTime = System.currentTimeMillis()
        val threadName = Thread.currentThread().name
        Log.d(TAG, "[AlarmPlayer] play() started on thread: $threadName. Time since JS trigger: ${playStartTime - triggerTime}ms")

        val packageName = context.packageName
        var resId = context.resources.getIdentifier(soundName, "raw", packageName)
        
        if (resId == 0) {
            Log.w(TAG, "[AlarmPlayer] Sound not found in resources: $soundName. Falling back to default 'alarm'.")
            resId = context.resources.getIdentifier("alarm", "raw", packageName)
        }

        if (resId == 0) {
            Log.e(TAG, "[AlarmPlayer] Default alarm sound resource not found.")
            return false
        }

        val targetResId = resId
        executor.execute {
            val bgThreadName = Thread.currentThread().name
            val bgStartTime = System.currentTimeMillis()
            Log.d(TAG, "[AlarmPlayer] Background task started on thread: $bgThreadName. Offset since play(): ${bgStartTime - playStartTime}ms")
            try {
                stopInternal() // Clean up any existing playback first

                val mp = MediaPlayer().apply {
                    isLooping = true
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                }

                // Retrieve asset file descriptor to set as data source
                val afd = context.resources.openRawResourceFd(targetResId)
                if (afd == null) {
                    Log.e(TAG, "[AlarmPlayer] Failed to open raw resource FD for resource ID: $targetResId")
                    return@execute
                }
                mp.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
                afd.close()

                val prepStartTime = System.currentTimeMillis()
                Log.d(TAG, "[AlarmPlayer] Calling prepareAsync() on thread: $bgThreadName")

                mp.setOnPreparedListener { preparedMp ->
                    val preparedTime = System.currentTimeMillis()
                    val preparedThreadName = Thread.currentThread().name
                    val prepDuration = preparedTime - prepStartTime
                    val totalDuration = preparedTime - triggerTime
                    Log.d(
                        TAG, 
                        "[AlarmPlayer] MediaPlayer prepared on thread: $preparedThreadName. " +
                        "Preparation duration: ${prepDuration}ms. " +
                        "Total pipeline latency since JS trigger: ${totalDuration}ms"
                    )
                    
                    try {
                        preparedMp.start()
                        isPlayingVal = true
                        Log.d(TAG, "[AlarmPlayer] Audio playback started successfully on thread: $preparedThreadName")
                    } catch (e: Exception) {
                        Log.e(TAG, "[AlarmPlayer] Error starting MediaPlayer inside onPrepared", e)
                        isPlayingVal = false
                    }
                }

                mp.setOnErrorListener { _, what, extra ->
                    Log.e(TAG, "[AlarmPlayer] MediaPlayer error occurred: what=$what, extra=$extra")
                    isPlayingVal = false
                    false
                }

                mediaPlayer = mp
                mp.prepareAsync()
                
            } catch (e: Exception) {
                Log.e(TAG, "[AlarmPlayer] Failed to initialize/prepare sound: $soundName on thread: $bgThreadName", e)
                isPlayingVal = false
            }
        }

        return true
    }

    /**
     * Stop and release the player resources.
     */
    fun stop() {
        val threadName = Thread.currentThread().name
        Log.d(TAG, "[AlarmPlayer] stop() called on thread: $threadName")
        executor.execute {
            stopInternal()
        }
    }

    private fun stopInternal() {
        val threadName = Thread.currentThread().name
        Log.d(TAG, "[AlarmPlayer] stopInternal() executing on thread: $threadName")
        try {
            mediaPlayer?.apply {
                try {
                    if (isPlaying) {
                        stop()
                    }
                } catch (e: Exception) {
                    // Ignore state errors when stopping
                }
                release()
            }
        } catch (e: Exception) {
            Log.e(TAG, "[AlarmPlayer] Error releasing MediaPlayer resources", e)
        } finally {
            mediaPlayer = null
            isPlayingVal = false
            Log.d(TAG, "[AlarmPlayer] MediaPlayer stopped and released successfully.")
        }
    }

    /**
     * Check if player is currently active
     */
    val isPlaying: Boolean
        get() = isPlayingVal
}
