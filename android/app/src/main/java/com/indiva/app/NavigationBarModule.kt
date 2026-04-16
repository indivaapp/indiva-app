package com.indiva.app

import android.graphics.Color
import android.os.Build
import android.view.WindowManager
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NavigationBarModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NavigationBar"

    @ReactMethod
    fun setColor(colorString: String, lightIcons: Boolean) {
        val activity = currentActivity ?: return
        activity.runOnUiThread {
            try {
                val color = Color.parseColor(colorString)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    activity.window.addFlags(
                        WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS
                    )
                    activity.window.navigationBarColor = color
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val controller = WindowInsetsControllerCompat(
                        activity.window, activity.window.decorView
                    )
                    controller.isAppearanceLightNavigationBars = lightIcons
                }
            } catch (_: Exception) {}
        }
    }
}
