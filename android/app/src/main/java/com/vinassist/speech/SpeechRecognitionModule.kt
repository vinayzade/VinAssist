package com.vinassist.speech

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.vinassist.nativemodules.NativeSpeechRecognitionSpec

/**
 * Voice input via the platform [SpeechRecognizer].
 *
 * One session at a time: `start` resolves with the final transcript when the
 * user stops talking (or `stop` is called). Partial transcripts and the
 * microphone level are streamed as device events so the UI can show live
 * feedback. Audio stays on the device; only text leaves this module.
 */
class SpeechRecognitionModule(reactContext: ReactApplicationContext) :
  NativeSpeechRecognitionSpec(reactContext) {

  private var recognizer: SpeechRecognizer? = null
  private var recognizerIsOffline = false
  private var pending: Promise? = null
  private var startedAt = 0L

  override fun getName(): String = NAME

  override fun isAvailable(): Boolean =
    SpeechRecognizer.isRecognitionAvailable(reactApplicationContext)

  override fun start(options: ReadableMap?, promise: Promise) {
    val language = options?.takeIf { it.hasKey("language") }?.getString("language")
    val partial = options?.takeIf { it.hasKey("partialResults") }?.getBoolean("partialResults") ?: true
    val preferOffline = options?.takeIf { it.hasKey("preferOffline") }?.getBoolean("preferOffline") ?: true

    if (!isAvailable()) {
      promise.reject("E_UNAVAILABLE", "Speech recognition is not available on this device.")
      return
    }
    val granted = ContextCompat.checkSelfPermission(
      reactApplicationContext, Manifest.permission.RECORD_AUDIO
    ) == PackageManager.PERMISSION_GRANTED
    if (!granted) {
      promise.reject("E_PERMISSION", "Microphone permission has not been granted.")
      return
    }

    UiThreadUtil.runOnUiThread {
      if (pending != null) {
        promise.reject("E_BUSY", "Already listening.")
        return@runOnUiThread
      }
      val engine = try {
        obtainRecognizer(preferOffline)
      } catch (e: RuntimeException) {
        promise.reject("E_UNAVAILABLE", "Could not start the speech recogniser.", e)
        return@runOnUiThread
      }
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, partial)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactApplicationContext.packageName)
        if (!language.isNullOrBlank()) {
          putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && preferOffline) {
          putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        }
      }
      pending = promise
      startedAt = SystemClock.elapsedRealtime()
      engine.startListening(intent)
    }
  }

  override fun stop() {
    UiThreadUtil.runOnUiThread { recognizer?.stopListening() }
  }

  override fun cancel() {
    UiThreadUtil.runOnUiThread {
      recognizer?.cancel()
      settle { it.reject("E_CANCELLED", "Listening was cancelled.") }
    }
  }

  override fun invalidate() {
    UiThreadUtil.runOnUiThread {
      settle { it.reject("E_CANCELLED", "The app is shutting down.") }
      recognizer?.destroy()
      recognizer = null
    }
    super.invalidate()
  }

  // --- internals ---------------------------------------------------------------------------

  private fun obtainRecognizer(preferOffline: Boolean): SpeechRecognizer {
    val wantOffline =
      preferOffline &&
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        SpeechRecognizer.isOnDeviceRecognitionAvailable(reactApplicationContext)
    recognizer?.let {
      if (recognizerIsOffline == wantOffline) return it
      it.destroy()
      recognizer = null
    }
    val created =
      if (wantOffline && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        SpeechRecognizer.createOnDeviceSpeechRecognizer(reactApplicationContext)
      } else {
        SpeechRecognizer.createSpeechRecognizer(reactApplicationContext)
      }
    created.setRecognitionListener(listener)
    recognizer = created
    recognizerIsOffline = wantOffline
    return created
  }

  /** Hands the pending promise to [block] exactly once. */
  private inline fun settle(block: (Promise) -> Unit) {
    val promise = pending ?: return
    pending = null
    block(promise)
  }

  private fun emit(name: String, params: WritableMap) {
    if (!reactApplicationContext.hasActiveReactInstance()) return
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, params)
  }

  private val listener = object : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) = Unit
    override fun onBeginningOfSpeech() = Unit
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() = Unit
    override fun onEvent(eventType: Int, params: Bundle?) = Unit

    override fun onRmsChanged(rmsdB: Float) {
      emit(EVENT_VOLUME, Arguments.createMap().apply { putDouble("rms", rmsdB.toDouble()) })
    }

    override fun onPartialResults(partialResults: Bundle?) {
      val text = partialResults
        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        ?.firstOrNull()
        ?.takeIf { it.isNotBlank() } ?: return
      emit(EVENT_PARTIAL, Arguments.createMap().apply { putString("transcript", text) })
    }

    override fun onResults(results: Bundle?) {
      val alternatives = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
      val scores = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
      settle { it.resolve(result(alternatives, scores?.firstOrNull())) }
    }

    override fun onError(error: Int) {
      when (error) {
        // Nothing understood: an empty transcript, not a failure.
        SpeechRecognizer.ERROR_NO_MATCH,
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT ->
          settle { it.resolve(result(emptyList(), null)) }
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
          settle { it.reject("E_PERMISSION", "Microphone permission has not been granted.") }
        SpeechRecognizer.ERROR_NETWORK,
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
        SpeechRecognizer.ERROR_SERVER ->
          settle { it.reject("E_NETWORK", "The speech service could not be reached.") }
        SpeechRecognizer.ERROR_AUDIO ->
          settle { it.reject("E_AUDIO", "The microphone could not be opened.") }
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY ->
          settle { it.reject("E_BUSY", "The speech recogniser is busy.") }
        SpeechRecognizer.ERROR_CLIENT -> {
          // Typically follows cancel(); if a promise is still pending, surface it.
          settle { it.reject("E_CANCELLED", "Listening was interrupted.") }
        }
        else -> {
          val message =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
              error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED
            ) {
              "This language is not supported for speech recognition."
            } else {
              "Speech recognition failed (code $error)."
            }
          settle { it.reject("E_RECOGNITION", message) }
        }
      }
    }
  }

  private fun result(alternatives: List<String>, confidence: Float?): WritableMap {
    val list = Arguments.createArray().apply { alternatives.forEach { pushString(it) } }
    return Arguments.createMap().apply {
      putString("transcript", alternatives.firstOrNull() ?: "")
      putArray("alternatives", list)
      putDouble("confidence", confidence?.toDouble()?.takeIf { it >= 0 } ?: -1.0)
      putDouble("durationMs", (SystemClock.elapsedRealtime() - startedAt).toDouble())
    }
  }

  companion object {
    const val NAME = "SpeechRecognition"
    const val EVENT_PARTIAL = "SpeechRecognition.partial"
    const val EVENT_VOLUME = "SpeechRecognition.volume"
  }
}
