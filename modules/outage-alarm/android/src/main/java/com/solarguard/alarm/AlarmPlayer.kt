package com.solarguard.alarm

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.util.Log

class AlarmPlayer(private val context: Context) {
    private var mediaPlayer: MediaPlayer? = null
    
    companion object {
        private const val TAG = "SolarGuardAlarm"
    }

    /**
     * Start playing the given sound in a loop.
     * Returns true if playback started successfully, false otherwise.
     */
    fun play(soundName: String): Boolean {
        try {
            stop() // Clean up any existing playback first

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

            mediaPlayer = MediaPlayer.create(context, resId).apply {
                isLooping = true
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                start()
            }
            return true
        } catch (e: Exception) {
            Log.e(TAG, "[AlarmPlayer] Failed to play sound: $soundName", e)
            return false
        }
    }

    /**
     * Stop and release the player resources.
     */
    fun stop() {
        try {
            mediaPlayer?.apply {
                if (isPlaying) {
                    stop()
                }
                release()
            }
        } catch (e: Exception) {
            Log.e(TAG, "[AlarmPlayer] Error releasing MediaPlayer resources", e)
        } finally {
            mediaPlayer = null
        }
    }

    /**
     * Check if player is currently active
     */
    val isPlaying: Boolean
        get() = mediaPlayer?.isPlaying ?: false
}
