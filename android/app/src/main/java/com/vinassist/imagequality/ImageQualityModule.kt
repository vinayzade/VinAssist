package com.vinassist.imagequality

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.SystemClock
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.vinassist.nativemodules.NativeImageQualitySpec
import java.io.File
import java.io.IOException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.sqrt

/**
 * On-device image quality measurement.
 *
 * Pixel statistics (sharpness via variance of the Laplacian, luminance
 * distribution) are computed here in Kotlin on a downsampled copy; faces
 * come from ML Kit Face Detection. Only numbers leave this module - the
 * image itself never does.
 */
class ImageQualityModule(reactContext: ReactApplicationContext) :
  NativeImageQualitySpec(reactContext) {

  private val executor: ExecutorService = Executors.newSingleThreadExecutor()
  private var detector: FaceDetector? = null

  override fun getName(): String = NAME

  override fun analyze(uri: String, options: ReadableMap?, promise: Promise) {
    val detectFaces = options?.takeIf { it.hasKey("detectFaces") }?.getBoolean("detectFaces") ?: true
    val maxDimension = options?.takeIf { it.hasKey("maxDimension") }?.getInt("maxDimension") ?: DEFAULT_MAX_DIMENSION

    executor.execute {
      val started = SystemClock.elapsedRealtime()
      val image: InputImage
      val stats: PixelStats
      try {
        // InputImage applies EXIF orientation, so width/height are upright and
        // face frames are in the same coordinate space as the displayed photo.
        image = InputImage.fromFilePath(reactApplicationContext, toUri(uri))
        stats = computePixelStats(uri, maxDimension)
      } catch (e: IOException) {
        promise.reject("E_UNREADABLE", "Could not read the image at $uri", e)
        return@execute
      } catch (e: SecurityException) {
        promise.reject("E_UNREADABLE", "No permission to read the image at $uri", e)
        return@execute
      } catch (e: IllegalArgumentException) {
        promise.reject("E_UNREADABLE", "Unsupported image: $uri", e)
        return@execute
      } catch (e: OutOfMemoryError) {
        promise.reject("E_UNREADABLE", "The image is too large to analyse", e)
        return@execute
      }

      if (!detectFaces) {
        promise.resolve(toResult(image, stats, emptyList(), false, SystemClock.elapsedRealtime() - started))
        return@execute
      }

      faceDetector()
        .process(image)
        .addOnSuccessListener { faces ->
          promise.resolve(toResult(image, stats, faces, true, SystemClock.elapsedRealtime() - started))
        }
        .addOnFailureListener { error ->
          promise.reject("E_ANALYSIS", error.message ?: "Face detection failed", error)
        }
    }
  }

  override fun invalidate() {
    detector?.close()
    detector = null
    executor.shutdown()
    super.invalidate()
  }

  private fun faceDetector(): FaceDetector =
    detector ?: FaceDetection.getClient(
      FaceDetectorOptions.Builder()
        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
        .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
        .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
        .setMinFaceSize(0.05f)
        .build(),
    ).also { detector = it }

  private fun toUri(raw: String): Uri {
    val parsed = Uri.parse(raw)
    return if (parsed.scheme.isNullOrEmpty()) Uri.fromFile(File(raw)) else parsed
  }

  // --- Pixel statistics --------------------------------------------------------

  private class PixelStats(
    val analyzedWidth: Int,
    val analyzedHeight: Int,
    val laplacianVariance: Double,
    val meanLuma: Double,
    val lumaStdDev: Double,
    val darkRatio: Double,
    val brightRatio: Double,
  )

  /** Decodes a downsampled bitmap (long edge <= maxDimension) and measures it. */
  private fun computePixelStats(uri: String, maxDimension: Int): PixelStats {
    val resolver = reactApplicationContext.contentResolver
    val source = toUri(uri)

    // Pass 1: header only. decodeStream returns null by design here, so the
    // stream itself is what must be checked for existence.
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    val header = resolver.openInputStream(source) ?: throw IOException("Cannot open $uri")
    header.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      throw IllegalArgumentException("Not a decodable image")
    }

    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxDimension) {
      sample *= 2
    }
    val decode = BitmapFactory.Options().apply {
      inSampleSize = sample
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    val body = resolver.openInputStream(source) ?: throw IOException("Cannot open $uri")
    val bitmap = body.use { BitmapFactory.decodeStream(it, null, decode) }
      ?: throw IOException("Cannot decode $uri")

    try {
      val w = bitmap.width
      val h = bitmap.height
      val pixels = IntArray(w * h)
      bitmap.getPixels(pixels, 0, w, 0, 0, w, h)

      // Luma (BT.601) as a flat array; also accumulate brightness stats.
      val luma = FloatArray(w * h)
      var sum = 0.0
      var sumSq = 0.0
      var dark = 0
      var bright = 0
      for (i in pixels.indices) {
        val p = pixels[i]
        val r = (p shr 16) and 0xFF
        val g = (p shr 8) and 0xFF
        val b = p and 0xFF
        val y = 0.299f * r + 0.587f * g + 0.114f * b
        luma[i] = y
        sum += y
        sumSq += y * y
        if (y < DARK_LUMA) dark++
        if (y > BRIGHT_LUMA) bright++
      }
      val n = (w * h).toDouble()
      val mean = sum / n
      val variance = max(0.0, sumSq / n - mean * mean)

      // Variance of the 3x3 Laplacian: a standard, cheap sharpness measure.
      var lapSum = 0.0
      var lapSumSq = 0.0
      var count = 0
      for (yPos in 1 until h - 1) {
        val row = yPos * w
        for (xPos in 1 until w - 1) {
          val i = row + xPos
          val lap = luma[i - w] + luma[i + w] + luma[i - 1] + luma[i + 1] - 4f * luma[i]
          lapSum += lap
          lapSumSq += lap * lap
          count++
        }
      }
      val lapVariance = if (count > 0) {
        val lapMean = lapSum / count
        max(0.0, lapSumSq / count - lapMean * lapMean)
      } else {
        0.0
      }

      return PixelStats(
        analyzedWidth = w,
        analyzedHeight = h,
        laplacianVariance = lapVariance,
        meanLuma = mean,
        lumaStdDev = sqrt(variance),
        darkRatio = dark / n,
        brightRatio = bright / n,
      )
    } finally {
      bitmap.recycle()
    }
  }

  // --- Result mapping -------------------------------------------------------------

  private fun toResult(
    image: InputImage,
    stats: PixelStats,
    faces: List<Face>,
    faceDetectionRan: Boolean,
    durationMs: Long,
  ): WritableMap {
    val faceArray = Arguments.createArray()
    for (face in faces) {
      faceArray.pushMap(
        Arguments.createMap().apply {
          putMap(
            "frame",
            Arguments.createMap().apply {
              putInt("x", face.boundingBox.left)
              putInt("y", face.boundingBox.top)
              putInt("width", face.boundingBox.width())
              putInt("height", face.boundingBox.height())
            },
          )
          putDouble("yaw", face.headEulerAngleY.toDouble())
          putDouble("roll", face.headEulerAngleZ.toDouble())
          face.leftEyeOpenProbability?.let { putDouble("leftEyeOpen", it.toDouble()) }
          face.rightEyeOpenProbability?.let { putDouble("rightEyeOpen", it.toDouble()) }
          face.smilingProbability?.let { putDouble("smiling", it.toDouble()) }
        },
      )
    }

    return Arguments.createMap().apply {
      putInt("width", image.width)
      putInt("height", image.height)
      putInt("analyzedWidth", stats.analyzedWidth)
      putInt("analyzedHeight", stats.analyzedHeight)
      putDouble("laplacianVariance", stats.laplacianVariance)
      putDouble("meanLuma", stats.meanLuma)
      putDouble("lumaStdDev", stats.lumaStdDev)
      putDouble("darkPixelRatio", stats.darkRatio)
      putDouble("brightPixelRatio", stats.brightRatio)
      putArray("faces", faceArray)
      putBoolean("faceDetectionRan", faceDetectionRan)
      putDouble("durationMs", durationMs.toDouble())
    }
  }

  companion object {
    const val NAME = "ImageQuality"
    const val DEFAULT_MAX_DIMENSION = 1024
    private const val DARK_LUMA = 40f
    private const val BRIGHT_LUMA = 240f
  }
}
