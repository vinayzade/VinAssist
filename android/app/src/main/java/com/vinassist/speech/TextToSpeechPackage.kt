package com.vinassist.speech

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** Registers [TextToSpeechModule] as a TurboModule. Added in MainApplication. */
class TextToSpeechPackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == TextToSpeechModule.NAME) TextToSpeechModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider {
      mapOf(
        TextToSpeechModule.NAME to
          ReactModuleInfo(
            TextToSpeechModule.NAME,
            TextToSpeechModule::class.java.name,
            false, // canOverrideExistingModule
            false, // needsEagerInit
            false, // isCxxModule
            true, // isTurboModule
          ),
      )
    }
}
