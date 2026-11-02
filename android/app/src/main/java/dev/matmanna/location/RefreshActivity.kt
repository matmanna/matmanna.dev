package dev.matmanna.location

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Bundle
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class RefreshActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val token = prefs(this).getString(KEY_TOKEN, null)
        if (token.isNullOrBlank() ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
        ) {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            return
        }

        LocationWidget.setStatus(this, "Locating…")
        val manager = getSystemService(LocationManager::class.java)
        val provider = listOf(LocationManager.FUSED_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
            .firstOrNull { manager.isProviderEnabled(it) }
        if (provider == null) {
            LocationWidget.setStatus(this, "Location is off")
            finish()
            return
        }

        // Stay open until the fix arrives, so the request counts as foreground
        manager.getCurrentLocation(provider, null, mainExecutor) { location ->
            if (location == null) {
                LocationWidget.setStatus(this, "No location fix")
            } else {
                LocationWidget.setStatus(this, "Updating…")
                upload(location, token)
            }
            finish()
        }
    }

    private fun upload(location: Location, token: String) {
        val context = applicationContext
        thread {
            try {
                val connection = URL("$BASE_URL/update").openConnection() as HttpURLConnection
                try {
                    connection.requestMethod = "POST"
                    connection.doOutput = true
                    connection.connectTimeout = 10_000
                    connection.readTimeout = 10_000
                    connection.setRequestProperty("Authorization", "Bearer $token")
                    connection.setRequestProperty("Content-Type", "application/json")
                    val body = JSONObject().put("lat", location.latitude).put("lng", location.longitude)
                    connection.outputStream.use { it.write(body.toString().toByteArray()) }
                    if (connection.responseCode != 200) {
                        LocationWidget.setStatus(context, "Update failed (${connection.responseCode})")
                        return@thread
                    }
                } finally {
                    connection.disconnect()
                }
                LocationWidget.refresh(context)
            } catch (e: Exception) {
                LocationWidget.setStatus(context, "Update failed")
            }
        }
    }
}
