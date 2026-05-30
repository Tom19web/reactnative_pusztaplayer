package com.pusztaplayer

import android.os.Build
import android.view.KeyEvent
import android.view.View
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.bridge.Arguments
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

    companion object {
        private val MEDIA_KEY_TYPES = setOf("playPause", "play", "pause", "rewind", "fastForward", "menu")
    }

    override fun getMainComponentName(): String = "PusztaPlayer"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    override fun onResume() {
        super.onResume()
        hideSystemUI()
    }

    override fun onDestroy() {
        super.onDestroy()
        android.os.Process.killProcess(android.os.Process.myPid())
        System.exit(0)
    }

    private fun hideSystemUI() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(android.view.WindowInsets.Type.statusBars() or android.view.WindowInsets.Type.navigationBars())
                it.systemBarsBehavior = android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
            )
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val keyType = onKeyEvent(event)
        if (keyType != null && keyType in MEDIA_KEY_TYPES) {
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    private fun onKeyEvent(event: KeyEvent): String? {
        if (event.action != KeyEvent.ACTION_DOWN && event.action != KeyEvent.ACTION_UP) return null
        val keyType = mapKeyType(event.keyCode) ?: return null
        val host = getReactHost() ?: return null
        val context = host.currentReactContext ?: return null
        val data = Arguments.createMap()
        data.putString("eventType", keyType)
        data.putInt("eventKeyAction", event.action)
        context.emitDeviceEvent("onHWKeyEvent", data)
        return keyType
    }

    private fun mapKeyType(keyCode: Int): String? = when (keyCode) {
        KeyEvent.KEYCODE_DPAD_UP -> "up"
        KeyEvent.KEYCODE_DPAD_DOWN -> "down"
        KeyEvent.KEYCODE_DPAD_LEFT -> "left"
        KeyEvent.KEYCODE_DPAD_RIGHT -> "right"
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "playPause"
        KeyEvent.KEYCODE_MEDIA_PLAY -> "play"
        KeyEvent.KEYCODE_MEDIA_PAUSE -> "pause"
        KeyEvent.KEYCODE_MEDIA_REWIND -> "rewind"
        KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "fastForward"
        KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "rewind"
        KeyEvent.KEYCODE_MEDIA_NEXT -> "fastForward"
        KeyEvent.KEYCODE_MEDIA_SKIP_BACKWARD -> "rewind"
        KeyEvent.KEYCODE_MEDIA_SKIP_FORWARD -> "fastForward"
        KeyEvent.KEYCODE_MEDIA_STEP_BACKWARD -> "rewind"
        KeyEvent.KEYCODE_MEDIA_STEP_FORWARD -> "fastForward"
        KeyEvent.KEYCODE_FORWARD -> "fastForward"
        KeyEvent.KEYCODE_BUTTON_R1 -> "fastForward"
        KeyEvent.KEYCODE_BUTTON_L1 -> "rewind"
        KeyEvent.KEYCODE_BUTTON_R2 -> "fastForward"
        KeyEvent.KEYCODE_BUTTON_L2 -> "rewind"
        KeyEvent.KEYCODE_MENU -> "menu"
        else -> null
    }
}
