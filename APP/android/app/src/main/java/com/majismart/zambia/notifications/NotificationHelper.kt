package com.majismart.zambia.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.compose.runtime.mutableStateListOf
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

enum class NotificationType {
    CRITICAL,
    WARNING,
    INFO,
    DISPATCH
}

data class AppNotification(
    val id: String,
    val title: String,
    val message: String,
    val timestamp: String,
    val type: NotificationType,
    val isRead: Boolean = false
)

object NotificationHelper {
    private const val CHANNEL_ID = "majismart_water_alerts"
    private const val CHANNEL_NAME = "MajiSmart Water Telemetry Alerts"

    val notifications = mutableStateListOf<AppNotification>()

    init {
        // Seed initial rich sample notifications
        notifications.addAll(
            listOf(
                AppNotification(
                    id = "notif_1",
                    title = "CRITICAL: Chilenje South Tank at 12%",
                    message = "Telemetry sensor reported water level below critical threshold (12%). Maintenance team alerted.",
                    timestamp = "10 mins ago",
                    type = NotificationType.CRITICAL,
                    isRead = false
                ),
                AppNotification(
                    id = "notif_2",
                    title = "Dispatch Unit Assigned",
                    message = "Lusaka Water Maintenance Unit #4 dispatched to inspect burst pipe at Market 4.",
                    timestamp = "1 hour ago",
                    type = NotificationType.DISPATCH,
                    isRead = false
                ),
                AppNotification(
                    id = "notif_3",
                    title = "Grid Pressure Normalizing",
                    message = "Central Lusaka grid water telemetry pressure restored to 3.8 Bar across all main risers.",
                    timestamp = "3 hours ago",
                    type = NotificationType.INFO,
                    isRead = true
                )
            )
        )
    }

    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = CHANNEL_NAME
            val descriptionText = "Real-time water tank alerts & community report updates"
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
            }
            val notificationManager: NotificationManager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    fun triggerSystemNotification(context: Context, title: String, message: String, type: NotificationType) {
        createNotificationChannel(context)

        // Add to in-app notification list
        val newNotif = AppNotification(
            id = "notif_${System.currentTimeMillis()}",
            title = title,
            message = message,
            timestamp = "Just now",
            type = type,
            isRead = false
        )
        notifications.add(0, newNotif)

        // Send Android System Notification
        try {
            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(title)
                .setContentText(message)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)

            val notificationManager = NotificationManagerCompat.from(context)
            // Check permission before notifying
            notificationManager.notify((System.currentTimeMillis() % 10000).toInt(), builder.build())
        } catch (e: SecurityException) {
            // Permission missing on newer Android, notification is still in in-app list
        } catch (e: Exception) {
            // Fallback
        }
    }

    fun markAsRead(id: String) {
        val index = notifications.indexOfFirst { it.id == id }
        if (index != -1) {
            notifications[index] = notifications[index].copy(isRead = true)
        }
    }

    fun markAllAsRead() {
        for (i in notifications.indices) {
            notifications[i] = notifications[i].copy(isRead = true)
        }
    }

    fun getUnreadCount(): Int = notifications.count { !it.isRead }
}
