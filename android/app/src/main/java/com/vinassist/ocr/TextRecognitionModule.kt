package com.vinassist.ocr

import android.net.Uri
import android.os.SystemClock
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.vinassist.nativemodules.NativeTextRecognitionSpec
import java.io.File
import java.io.IOException

/**
 * On-device OCR backed by Google ML Kit Text Recognition v2.
 *
 * Everything runs locally: no network, no image leaves the device. One
 * recognizer per script is created lazily and kept for the lifetime of the
 * React instance, because model loading is the expensive part.
 */
class TextRecognitionModule(reactContext: ReactApplicationContext) :
  NativeTextRecognitionSpec(reactContext) {

  private val recognizers = HashMap<String, TextRecognizer>()

  override fun getName(): String = NAME

  override fun getSupportedScripts(): WritableArray =
    Arguments.fromList(SUPPORTED_SCRIPTS)

  override fun recognize(uri: String, options: ReadableMap?, promise: Promise) {
    val script = (options?.takeIf { it.hasKey("script") }?.getString("script") ?: DEFAULT_SCRIPT)
      .lowercase()
    if (script !in SUPPORTED_SCRIPTS) {
      promise.reject(
        "E_UNSUPPORTED_SCRIPT",
        "Script '$script' is not available. Supported: ${SUPPORTED_SCRIPTS.joinToString()}",
      )
      return
    }

    val image = try {
      // fromFilePath reads EXIF orientation, so the frames we return are in
      // upright image coordinates.
      InputImage.fromFilePath(reactApplicationContext, toUri(uri))
    } catch (e: IOException) {
      promise.reject("E_UNREADABLE", "Could not read the image at $uri", e)
      return
    } catch (e: SecurityException) {
      promise.reject("E_UNREADABLE", "No permission to read the image at $uri", e)
      return
    } catch (e: IllegalArgumentException) {
      promise.reject("E_UNREADABLE", "Unsupported image: $uri", e)
      return
    }

    val started = SystemClock.elapsedRealtime()
    recognizerFor(script)
      .process(image)
      .addOnSuccessListener { text ->
        val duration = SystemClock.elapsedRealtime() - started
        promise.resolve(toResult(text, image, "mlkit-$script", duration))
      }
      .addOnFailureListener { error ->
        promise.reject("E_RECOGNITION", error.message ?: "Text recognition failed", error)
      }
  }

  override fun invalidate() {
    recognizers.values.forEach { it.close() }
    recognizers.clear()
    super.invalidate()
  }

  private fun recognizerFor(script: String): TextRecognizer =
    recognizers.getOrPut(script) {
      when (script) {
        "devanagari" -> TextRecognition.getClient(DevanagariTextRecognizerOptions.Builder().build())
        else -> TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      }
    }

  private fun toUri(raw: String): Uri {
    val parsed = Uri.parse(raw)
    // A bare filesystem path has no scheme; treat it as a file.
    return if (parsed.scheme.isNullOrEmpty()) Uri.fromFile(File(raw)) else parsed
  }

  private fun toResult(text: Text, image: InputImage, engine: String, durationMs: Long): WritableMap {
    val blocks = Arguments.createArray()
    for (block in text.textBlocks) {
      val lines = Arguments.createArray()
      for (line in block.lines) {
        lines.pushMap(
          Arguments.createMap().apply {
            putString("text", line.text)
            putMap("frame", rect(line.boundingBox))
            putDouble("confidence", line.confidence.toDouble())
            putLanguage(line.recognizedLanguage)
          },
        )
      }
      blocks.pushMap(
        Arguments.createMap().apply {
          putString("text", block.text)
          putMap("frame", rect(block.boundingBox))
          putArray("lines", lines)
          putLanguage(block.recognizedLanguage)
        },
      )
    }

    return Arguments.createMap().apply {
      putString("text", text.text)
      putArray("blocks", blocks)
      putInt("imageWidth", image.width)
      putInt("imageHeight", image.height)
      putString("engine", engine)
      putDouble("durationMs", durationMs.toDouble())
    }
  }

  private fun WritableMap.putLanguage(language: String?) {
    // ML Kit reports "und" or "und-Latn" (undetermined language, known
    // script) when it cannot tell; neither is useful to callers.
    if (!language.isNullOrEmpty() && !language.startsWith("und", ignoreCase = true)) {
      putString("language", language)
    }
  }

  private fun rect(box: android.graphics.Rect?): WritableMap =
    Arguments.createMap().apply {
      putInt("x", box?.left ?: 0)
      putInt("y", box?.top ?: 0)
      putInt("width", box?.width() ?: 0)
      putInt("height", box?.height() ?: 0)
    }

  companion object {
    const val NAME = "TextRecognition"
    const val DEFAULT_SCRIPT = "latin"
    val SUPPORTED_SCRIPTS = listOf("latin", "devanagari")
  }
}
