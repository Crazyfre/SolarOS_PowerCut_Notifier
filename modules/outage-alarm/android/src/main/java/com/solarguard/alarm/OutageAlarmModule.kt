package com.solarguard.alarm

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OutageAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OutageAlarm")

    Function("triggerAlarm") { soundName: String, durationSeconds: Int ->
      val context = appContext.reactContext ?: return@Function
      OutageAlarmService.start(context, soundName, durationSeconds)
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
