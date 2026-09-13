package com.vinassist

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.vinassist.imagequality.ImageQualityPackage
import com.vinassist.ocr.TextRecognitionPackage
import com.vinassist.speech.SpeechRecognitionPackage
import com.vinassist.speech.TextToSpeechPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // App-local TurboModules (not autolinked because they live in this app).
          add(TextRecognitionPackage())
          add(ImageQualityPackage())
          add(SpeechRecognitionPackage())
          add(TextToSpeechPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
