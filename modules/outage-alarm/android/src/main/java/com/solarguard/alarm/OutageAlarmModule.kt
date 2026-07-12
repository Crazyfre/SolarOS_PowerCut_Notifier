package com.solarguard.alarm

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
      val context = appContext.reactContext ?: return@Function
      OutageAlarmService.start(context, options.reason, options.sound, options.duration)
    }

    Function("stopAlarm") {
      val context = appContext.reactContext ?: return@Function
      OutageAlarmService.stop(context)
    }

    Function("isAlarmPlaying") {
      return@Function OutageAlarmService.isPlaying
    }
  }
}
