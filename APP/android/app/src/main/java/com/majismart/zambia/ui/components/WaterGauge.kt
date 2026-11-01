package com.majismart.zambia.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.majismart.zambia.data.model.Tank
import com.majismart.zambia.ui.theme.*
import kotlin.math.sin

@Composable
fun WaterGauge(
    tank: Tank,
    modifier: Modifier = Modifier
) {
    val percent = tank.currentWaterPercent.coerceIn(0f, 100f)
    val isCritical = percent <= 15
    val isLow = percent > 15f && percent <= 25f
    val statusColor = if (isCritical) MajiRed else if (isLow) MajiAmber else MajiEmerald
    val statusBg = if (isCritical) MajiRedLight else if (isLow) MajiAmberLight else MajiGreenLight

    val animatedPercent by animateFloatAsState(
        targetValue = percent / 100f,
        animationSpec = tween(durationMillis = 1200, easing = FastOutSlowInEasing),
        label = "WaterLevelAnim"
    )

    // Wave animation parameter
    val infiniteTransition = rememberInfiniteTransition(label = "WaveInfinite")
    val waveOffset by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 2f * Math.PI.toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "WaveOffset"
    )

    Card(
        colors = CardDefaults.cardColors(containerColor = Color.White),
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
        modifier = modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            // Header Row: Tank Name & Status Chip
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            color = statusColor.copy(alpha = 0.15f),
                            shape = CircleShape,
                            modifier = Modifier.size(10.dp)
                        ) {}
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = tank.name,
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                            color = MajiNavy
                        )
                    }
                    Text(
                        text = "${tank.tankIdCode} • ${tank.stationName ?: "Lusaka Grid"}",
                        fontSize = 14.sp,
                        color = Color.Gray
                    )
                }

                Surface(
                    color = statusBg,
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = if (isCritical) Icons.Default.Warning else if (isLow) Icons.Default.PriorityHigh else Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = statusColor,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "${tank.currentWaterPercent}%",
                            color = statusColor,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 16.sp
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Canvas Animated Water Vessel Gauge
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(110.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color(0xFFF8FAFC))
                    .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(16.dp))
            ) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val width = size.width
                    val height = size.height

                    // Grid measurement background lines
                    val lineSpacing = height / 4
                    for (i in 1..3) {
                        drawLine(
                            color = Color(0xFFE2E8F0),
                            start = Offset(0f, i * lineSpacing),
                            end = Offset(width, i * lineSpacing),
                            strokeWidth = 1f
                        )
                    }

                    // Water Fill Calculation
                    val fillHeight = height * animatedPercent
                    val waterTopY = height - fillHeight

                    // Dynamic Liquid Wave Path
                    val wavePath = Path()
                    wavePath.moveTo(0f, height)
                    wavePath.lineTo(0f, waterTopY)

                    val amplitude = 8f
                    val waveLength = width / 1.5f

                    var x = 0f
                    while (x <= width) {
                        val y = waterTopY + sin((x / waveLength * 2 * Math.PI) + waveOffset).toFloat() * amplitude
                        wavePath.lineTo(x, y)
                        x += 5f
                    }

                    wavePath.lineTo(width, height)
                    wavePath.close()

                    val waterGradient = Brush.verticalGradient(
                        colors = listOf(
                            statusColor.copy(alpha = 0.85f),
                            MajiOceanBlue.copy(alpha = 0.95f),
                            MajiNavy
                        )
                    )

                    drawPath(path = wavePath, brush = waterGradient)
                }

                // Overlay Content on Top of Vessel Gauge
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Live Water Volume",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (animatedPercent > 0.4f) Color.White else MajiNavy
                        )
                        Text(
                            text = "%.1f L".format((tank.capacityLiters * animatedPercent)),
                            fontSize = 20.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = if (animatedPercent > 0.4f) Color.White else MajiNavy
                        )
                    }

                    Surface(
                        color = Color.White.copy(alpha = 0.9f),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text(
                            text = "Cap: ${tank.capacityLiters} L",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = MajiNavy,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Footer Telemetry Details
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Straighten,
                        contentDescription = null,
                        tint = MajiCyan,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "Depth: ${tank.currentWaterDepthCm} / ${tank.totalHeightCm} cm",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        color = MajiTextPrimary
                    )
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Sensors,
                        contentDescription = null,
                        tint = MajiPurple,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = tank.deviceIdCode ?: "ESP32_IOT",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = MajiPurple
                    )
                }
            }
        }
    }
}

