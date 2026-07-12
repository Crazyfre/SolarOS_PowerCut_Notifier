package com.solarguard.alarm

import android.os.PowerManager
import android.content.Context
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class TriggerOptions : Record {
  @Field
  val reason: String = ""

  @Field
  val sound: String = ""

  @Field
  val duration: Int = 10
}

class OutageAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OutageAlarm")

    Function("triggerAlarm") { options: TriggerOptions ->
      appContext.reactContext?.let { context ->
        OutageAlarmService.start(context, options.reason, options.sound, options.duration)
      }
    }

    Function("stopAlarm") {
      appContext.reactContext?.let { context ->
        OutageAlarmService.stop(context)
      }
    }

    Function("isAlarmPlaying") {
      OutageAlarmService.isPlaying
    }

    Function("isIgnoringBatteryOptimizations") {
      val context = appContext.reactContext ?: return@Function false
      val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        powerManager.isIgnoringBatteryOptimizations(context.packageName)
      } else {
        true
      }
    }
  }
}
