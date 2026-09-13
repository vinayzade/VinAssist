package com.vinassist.speech

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** Registers [SpeechRecognitionModule] as a TurboModule. Added in MainApplication. */
class SpeechRecognitionPackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == SpeechRecognitionModule.NAME) SpeechRecognitionModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider {
      mapOf(
        SpeechRecognitionModule.NAME to
          ReactModuleInfo(
            SpeechRecognitionModule.NAME,
            SpeechRecognitionModule::class.java.name,
            false, // canOverrideExistingModule
            false, // needsEagerInit
            false, // isCxxModule
            true, // isTurboModule
          ),
      )
    }
}
