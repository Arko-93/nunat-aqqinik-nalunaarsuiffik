package gl.nunat.marine.tracking

import android.app.Notification
import android.app.Service
import android.content.Intent
import android.os.IBinder

/**
 * Placeholder Android foreground location service.
 * Real implementation must use a location-type FGS + persistent notification.
 * Standard Capacitor Geolocation is insufficient for locked-screen recording.
 */
class TrackingForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // startForeground(NOTIFICATION_ID, buildNotification())
    return START_STICKY
  }

  @Suppress("unused")
  private fun buildNotification(): Notification {
    throw NotImplementedError("Wire notification channel before shipping field builds")
  }
}
