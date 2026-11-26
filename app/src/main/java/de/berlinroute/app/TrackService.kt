package de.berlinroute.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Foreground service that keeps reading the GPS while the app is in the background during a trip or a walk.
 * Every fix goes to the page through MainActivity.pushFix. The ongoing notification is the same one the page
 * updates with the trip text (same id), so there is only one.
 */
class TrackService : Service() {

    private var manager: LocationManager? = null

    private val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            MainActivity.pushFix(location)
        }

        override fun onProviderEnabled(provider: String) {}

        override fun onProviderDisabled(provider: String) {}

        @Deprecated("Kept for devices before Android 10")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra("title") ?: "Bearline"
        val text = intent?.getStringExtra("text") ?: ""
        try {
            ServiceCompat.startForeground(
                this, MainActivity.TRIP_NOTIF_ID, buildNotification(title, text),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            )
        } catch (e: Exception) {
            stopSelf()
            return START_NOT_STICKY
        }
        running = true
        startUpdates()
        return START_STICKY
    }

    private fun buildNotification(title: String, text: String): android.app.Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm?.createNotificationChannel(
            NotificationChannel(MainActivity.TRIP_CHANNEL, "Trip", NotificationManager.IMPORTANCE_LOW)
        )
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, MainActivity.TRIP_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_directions)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setContentIntent(open)
            .build()
    }

    private fun startUpdates() {
        if (manager != null) return
        val m = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        manager = m
        try {
            if (m.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                m.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, listener, Looper.getMainLooper())
            }
            if (m.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                m.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 4000L, 0f, listener, Looper.getMainLooper())
            }
        } catch (e: SecurityException) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        running = false
        try {
            manager?.removeUpdates(listener)
        } catch (e: Exception) {
            // already removed
        }
        manager = null
        super.onDestroy()
    }

    companion object {
        @Volatile
        var running = false
    }
}
