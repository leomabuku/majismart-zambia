package com.majismart.zambia.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.majismart.zambia.data.model.CommunityReport
import com.majismart.zambia.data.model.Tank
import com.majismart.zambia.ui.components.InteractiveMapView
import com.majismart.zambia.ui.theme.*

@Composable
fun LiveMapScreen(
    tanks: List<Tank>,
    reports: List<CommunityReport>,
    onNavigateToReport: () -> Unit
) {
    Box(modifier = Modifier.fillMaxSize()) {
        // Fullscreen Interactive Google Map with Search Bar
        InteractiveMapView(
            tanks = tanks,
            reports = reports,
            isPickerMode = false
        )

        // Overlay Legend / Map Stats Bar at Bottom
        Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 10.dp),
            shape = RoundedCornerShape(18.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
                .align(Alignment.BottomCenter)
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            color = MajiOceanBlue.copy(alpha = 0.12f),
                            shape = CircleShape,
                            modifier = Modifier.size(36.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.Map,
                                    contentDescription = null,
                                    tint = MajiOceanBlue,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "Lusaka Water Grid Map",
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                                color = MajiNavy
                            )
                            Text(
                                text = "Only records with stored coordinates are shown",
                                fontSize = 12.sp,
                                color = Color.Gray
                            )
                        }
                    }

                    Button(
                        onClick = onNavigateToReport,
                        colors = ButtonDefaults.buttonColors(containerColor = MajiRed),
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Icon(Icons.Default.AddLocationAlt, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Pin Issue", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))
                HorizontalDivider(color = Color(0xFFF1F5F9))
                Spacer(modifier = Modifier.height(10.dp))

                // Map Legend Badges
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(color = MajiEmerald, shape = CircleShape, modifier = Modifier.size(10.dp)) {}
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Normal Level", fontSize = 11.sp, color = Color.DarkGray)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(color = MajiAmber, shape = CircleShape, modifier = Modifier.size(10.dp)) {}
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Low Level", fontSize = 11.sp, color = Color.DarkGray)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(color = MajiRed, shape = CircleShape, modifier = Modifier.size(10.dp)) {}
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Critical / Burst", fontSize = 11.sp, color = Color.DarkGray)
                    }
                }
            }
        }
    }
}
