package com.pusztaplayer.audio

import android.media.audiofx.Visualizer
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class AudioVisualizerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private var visualizer: Visualizer? = null

    override fun getName() = "AudioVisualizer"

    @ReactMethod
    fun startCapture(promise: Promise) {
        try {
            visualizer?.release()
            visualizer = Visualizer(0).apply {
                captureSize = Visualizer.getCaptureSizeRange()[1]
                setDataCaptureListener(object : Visualizer.OnDataCaptureListener {
                    override fun onWaveFormDataCapture(vis: Visualizer?, waveform: ByteArray?, samplingRate: Int) {}
                    override fun onFftDataCapture(vis: Visualizer?, fft: ByteArray?, samplingRate: Int) {
                        if (fft == null) return
                        val result = Arguments.createArray()
                        for (i in 0 until fft.size) {
                            result.pushInt(fft[i].toInt() and 0xFF)
                        }
                        reactApplicationContext
                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                            .emit("onAudioFftData", result)
                    }
                }, Visualizer.getMaxCaptureRate() / 2, true, false)
                enabled = true
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("AUDIO_VIZ_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopCapture(promise: Promise) {
        try {
            visualizer?.enabled = false
            visualizer?.release()
            visualizer = null
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("AUDIO_VIZ_ERROR", e.message)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}
    @ReactMethod
    fun removeListeners(count: Int) {}
}
