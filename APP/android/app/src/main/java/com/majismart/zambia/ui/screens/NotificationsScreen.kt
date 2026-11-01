package com.majismart.zambia.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.majismart.zambia.notifications.AppNotification
import com.majismart.zambia.notifications.NotificationHelper
import com.majismart.zambia.notifications.NotificationType
import com.majismart.zambia.ui.theme.*

@Composable
fun NotificationsScreen(
    notifications: List<AppNotification>,
    onMarkAllRead: () -> Unit
) {
    val context = LocalContext.current

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Header Card
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            color = MajiOceanBlue.copy(alpha = 0.12f),
                            shape = CircleShape,
                            modifier = Modifier.size(42.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.Notifications,
                                    contentDescription = null,
                                    tint = MajiOceanBlue,
                                    modifier = Modifier.size(22.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "Telemetry Notifications",
                                fontWeight = FontWeight.Bold,
                                fontSize = 17.sp,
                                color = MajiNavy
                            )
                            Text(
                                text = "${notifications.count { !it.isRead }} unread alerts",
                                fontSize = 14.sp,
                                color = Color.Gray
                            )
                        }
                    }

                    TextButton(onClick = onMarkAllRead) {
                        Text("Mark Read", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = MajiOceanBlue)
                    }
                }
            }
        }

        // Test Notification Trigger Action
        item {
            OutlinedButton(
                onClick = {
                    NotificationHelper.triggerSystemNotification(
                        context = context,
                        title = "ALERT: Lusaka East Grid Pressure Drop",
                        message = "Automatic sensor #ESP32_004 registered pressure drop below 2.0 Bar.",
                        type = NotificationType.CRITICAL
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MajiRed)
            ) {
                Icon(Icons.Default.AddAlert, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Simulate Live Telemetry Alert Notification", fontSize = 14.sp, fontWeight = FontWeight.Bold)
            }
        }

        // Notification Items
        if (notifications.isEmpty()) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MajiEmerald, modifier = Modifier.size(48.dp))
                        Spacer(modifier = Modifier.height(10.dp))
                        Text("All caught up!", fontWeight = FontWeight.Bold, color = MajiNavy)
                        Text("No water alerts or notifications at this time.", fontSize = 14.sp, color = Color.Gray)
                    }
                }
            }
        } else {
            items(notifications) { notif ->
                NotificationCardItem(notif = notif) {
                    NotificationHelper.markAsRead(notif.id)
                }
            }
        }
    }
}

@Composable
fun NotificationCardItem(
    notif: AppNotification,
    onClick: () -> Unit
) {
    val (typeColor, typeIcon) = when (notif.type) {
        NotificationType.CRITICAL -> MajiRed to Icons.Default.Warning
        NotificationType.WARNING -> MajiAmber to Icons.Default.PriorityHigh
        NotificationType.DISPATCH -> MajiOceanBlue to Icons.Default.LocalShipping
        NotificationType.INFO -> MajiEmerald to Icons.Default.Info
    }

    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (notif.isRead) Color.White else Color(0xFFF0F9FF)
        ),
        shape = RoundedCornerShape(14.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = if (notif.isRead) 1.dp else 4.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.Top
        ) {
            Surface(
                color = typeColor.copy(alpha = 0.15f),
                shape = CircleShape,
                modifier = Modifier.size(38.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = typeIcon,
                        contentDescription = null,
                        tint = typeColor,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = notif.title,
                        fontWeight = if (notif.isRead) FontWeight.SemiBold else FontWeight.ExtraBold,
                        fontSize = 16.sp,
                        color = MajiNavy,
                        modifier = Modifier.weight(1f)
                    )

                    if (!notif.isRead) {
                        Surface(
                            color = MajiRed,
                            shape = CircleShape,
                            modifier = Modifier.size(8.dp)
                        ) {}
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = notif.message,
                    fontSize = 14.sp,
                    color = MajiTextPrimary
                )

                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = notif.timestamp,
                    fontSize = 14.sp,
                    color = Color.Gray,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

