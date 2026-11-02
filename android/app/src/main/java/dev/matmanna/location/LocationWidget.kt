package dev.matmanna.location

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.widget.RemoteViews
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

const val BASE_URL = "https://location.matmanna.dev"

class LocationWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val pending = goAsync()
        thread {
            try {
                refresh(context)
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        fun setStatus(context: Context, text: String) {
            val views = baseViews(context).apply { setTextViewText(R.id.status, text) }
            push(context, views, partial = true)
        }

        // Blocking: call off the main thread
        fun refresh(context: Context) {
            val views = baseViews(context)
            try {
                val json = JSONObject(get("$BASE_URL/json").decodeToString())
                // The worker leaves the city empty for regions it only shows as a whole
                val label = json.optString("city").ifBlank { json.optString("region") }
                views.setTextViewText(R.id.status, label.ifBlank { "Tap to update" })
                views.setImageViewBitmap(R.id.map, map(context))
            } catch (e: Exception) {
                views.setTextViewText(R.id.status, "Tap to update")
            }
            push(context, views, partial = false)
        }

        private fun map(context: Context): Bitmap? {
            val night = context.resources.configuration.uiMode and
                Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
            val theme = if (night) "dark" else "light"
            val bytes = get("$BASE_URL/$theme?w=400&h=200")
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        }

        private fun baseViews(context: Context): RemoteViews {
            val tap = PendingIntent.getActivity(
                context, 0,
                Intent(context, RefreshActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE,
            )
            return RemoteViews(context.packageName, R.layout.widget).apply {
                setOnClickPendingIntent(android.R.id.background, tap)
            }
        }

        private fun push(context: Context, views: RemoteViews, partial: Boolean) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, LocationWidget::class.java))
            // Partial updates keep the current map visible while only the text changes
            if (partial) manager.partiallyUpdateAppWidget(ids, views)
            else manager.updateAppWidget(ids, views)
        }

        private fun get(url: String): ByteArray {
            val connection = URL(url).openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = 10_000
                connection.readTimeout = 10_000
                return connection.inputStream.use { it.readBytes() }
            } finally {
                connection.disconnect()
            }
        }
    }
}
