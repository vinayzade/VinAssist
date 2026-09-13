package com.vinassist.speech

import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.vinassist.nativemodules.NativeTextToSpeechSpec
import java.util.Locale
import java.util.UUID

/**
 * Spoken output via the platform [TextToSpeech] engine.
 *
 * The engine initialises asynchronously; `speak` calls made before it is
 * ready are queued and run once initialisation completes. One utterance at
 * a time: a new `speak` interrupts the previous one unless asked to queue.
 */
class TextToSpeechModule(reactContext: ReactApplicationContext) :
  NativeTextToSpeechSpec(reactContext) {

  private var engine: TextToSpeech? = null
  private var state = State.NOT_STARTED
  private val waitingForInit = mutableListOf<() -> Unit>()
  private val pending = mutableMapOf<String, Promise>()
  @Volatile private var speaking = false

  private enum class State { NOT_STARTED, INITIALISING, READY, FAILED }

  override fun getName(): String = NAME

  override fun isAvailable(): Boolean = state != State.FAILED

  override fun isSpeaking(): Boolean = speaking

  override fun speak(text: String, options: ReadableMap?, promise: Promise) {
    val language = options?.takeIf { it.hasKey("language") }?.getString("language")
    val rate = options?.takeIf { it.hasKey("rate") }?.getDouble("rate")?.toFloat() ?: 1f
    val pitch = options?.takeIf { it.hasKey("pitch") }?.getDouble("pitch")?.toFloat() ?: 1f
    val interrupt = options?.takeIf { it.hasKey("interrupt") }?.getBoolean("interrupt") ?: true

    if (text.isBlank()) {
      promise.resolve(null)
      return
    }
    UiThreadUtil.runOnUiThread {
      whenReady { engine ->
        if (engine == null) {
          promise.reject("E_UNAVAILABLE", "Text-to-speech is not available on this device.")
          return@whenReady
        }
        if (!language.isNullOrBlank()) {
          val result = engine.setLanguage(Locale.forLanguageTag(language))
          if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            promise.reject("E_LANGUAGE", "This language is not installed for text-to-speech.")
            return@whenReady
          }
        }
        engine.setSpeechRate(rate.coerceIn(0.1f, 4f))
        engine.setPitch(pitch.coerceIn(0.1f, 4f))
        if (interrupt) {
          cancelPending()
          engine.stop()
        }
        val id = UUID.randomUUID().toString()
        pending[id] = promise
        val queueMode = if (interrupt) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
        val params = Bundle().apply { putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, id) }
        val result = engine.speak(text, queueMode, params, id)
        if (result != TextToSpeech.SUCCESS) {
          pending.remove(id)
          promise.reject("E_SYNTHESIS", "The speech engine could not speak this text.")
        }
      }
    }
  }

  override fun stop() {
    UiThreadUtil.runOnUiThread {
      engine?.stop()
      speaking = false
      cancelPending()
    }
  }

  override fun invalidate() {
    UiThreadUtil.runOnUiThread {
      cancelPending()
      engine?.shutdown()
      engine = null
      state = State.NOT_STARTED
    }
    super.invalidate()
  }

  // --- internals ---------------------------------------------------------------------------

  /** Runs [block] with the engine once it has initialised (null if it failed). */
  private fun whenReady(block: (TextToSpeech?) -> Unit) {
    when (state) {
      State.READY -> block(engine)
      State.FAILED -> block(null)
      State.INITIALISING -> waitingForInit.add { block(if (state == State.READY) engine else null) }
      State.NOT_STARTED -> {
        state = State.INITIALISING
        waitingForInit.add { block(if (state == State.READY) engine else null) }
        val created = TextToSpeech(reactApplicationContext) { status ->
          UiThreadUtil.runOnUiThread {
            state = if (status == TextToSpeech.SUCCESS) State.READY else State.FAILED
            if (state == State.READY) {
              engine?.setOnUtteranceProgressListener(listener)
            } else {
              engine?.shutdown()
              engine = null
            }
            val queued = waitingForInit.toList()
            waitingForInit.clear()
            queued.forEach { it() }
          }
        }
        engine = created
      }
    }
  }

  private fun cancelPending() {
    val promises = pending.values.toList()
    pending.clear()
    promises.forEach { it.reject("E_CANCELLED", "Speech was stopped.") }
  }

  private fun emit(name: String, params: WritableMap) {
    if (!reactApplicationContext.hasActiveReactInstance()) return
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, params)
  }

  private val listener = object : UtteranceProgressListener() {
    override fun onStart(utteranceId: String) {
      speaking = true
      emit(EVENT_START, Arguments.createMap().apply { putString("id", utteranceId) })
    }

    override fun onDone(utteranceId: String) {
      speaking = false
      emit(EVENT_DONE, Arguments.createMap().apply { putString("id", utteranceId) })
      UiThreadUtil.runOnUiThread { pending.remove(utteranceId)?.resolve(null) }
    }

    override fun onStop(utteranceId: String, interrupted: Boolean) {
      speaking = false
      UiThreadUtil.runOnUiThread {
        pending.remove(utteranceId)?.reject("E_CANCELLED", "Speech was stopped.")
      }
    }

    @Deprecated("Deprecated in Android", ReplaceWith("onError(utteranceId, errorCode)"))
    override fun onError(utteranceId: String) {
      onError(utteranceId, TextToSpeech.ERROR)
    }

    override fun onError(utteranceId: String, errorCode: Int) {
      speaking = false
      UiThreadUtil.runOnUiThread {
        pending.remove(utteranceId)?.reject("E_SYNTHESIS", "Speech failed (code $errorCode).")
      }
    }
  }

  companion object {
    const val NAME = "TextToSpeech"
    const val EVENT_START = "TextToSpeech.start"
    const val EVENT_DONE = "TextToSpeech.done"
  }
}
