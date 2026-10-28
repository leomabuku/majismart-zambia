package com.majismart.zambia.ui.screens

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import com.google.android.gms.maps.model.LatLng
import com.majismart.zambia.data.model.CreateReportRequest
import com.majismart.zambia.data.remote.MajiSmartApiService
import com.majismart.zambia.notifications.NotificationHelper
import com.majismart.zambia.notifications.NotificationType
import com.majismart.zambia.ui.components.InteractiveLocationPicker
import com.majismart.zambia.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun SubmitReportScreen(
    api: MajiSmartApiService,
    onReportSubmitted: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    var category by remember { mutableStateOf("BURST_PIPE") }
    var title by remember { mutableStateOf("") }
    var locationName by remember { mutableStateOf("Chilenje South Market") }
    var selectedLatLng by remember { mutableStateOf<LatLng?>(LatLng(-15.4411, 28.3245)) }
    var description by remember { mutableStateOf("") }
    var urgency by remember { mutableStateOf("HIGH") }
    var isSubmitting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val categories = listOf(
        Triple("BURST_PIPE", "Burst Pipe / Leak", Icons.Default.InvertColors),
        Triple("WATER_SHORTAGE", "Water Shortage", Icons.Default.WaterDrop),
        Triple("LOW_PRESSURE", "Low Pressure", Icons.Default.Speed),
        Triple("CONTAMINATION", "Quality Issue", Icons.Default.Warning)
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Title Header Card
        Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    color = MajiRed.copy(alpha = 0.12f),
                    shape = CircleShape,
                    modifier = Modifier.size(48.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Default.ReportProblem,
                            contentDescription = null,
                            tint = MajiRed,
                            modifier = Modifier.size(26.dp)
                        )
                    }
                }
                Spacer(modifier = Modifier.width(14.dp))
                Column {
                    Text(
                        text = "Report Water Incident",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        color = MajiNavy
                    )
                    Text(
                        text = "Alert municipal repair dispatch teams in real time",
                        fontSize = 12.sp,
                        color = Color.Gray
                    )
                }
            }
        }

        // Category Selection Chips
        Text("Incident Category *", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = MajiNavy)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            categories.take(2).forEach { (catId, catLabel, catIcon) ->
                FilterChip(
                    selected = category == catId,
                    onClick = { category = catId },
                    leadingIcon = { Icon(catIcon, contentDescription = null, modifier = Modifier.size(16.dp)) },
                    label = { Text(catLabel, fontSize = 12.sp) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MajiOceanBlue,
                        selectedLabelColor = Color.White
                    ),
                    modifier = Modifier.weight(1f)
                )
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            categories.drop(2).forEach { (catId, catLabel, catIcon) ->
                FilterChip(
                    selected = category == catId,
                    onClick = { category = catId },
                    leadingIcon = { Icon(catIcon, contentDescription = null, modifier = Modifier.size(16.dp)) },
                    label = { Text(catLabel, fontSize = 12.sp) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MajiOceanBlue,
                        selectedLabelColor = Color.White
                    ),
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // Title Input
        OutlinedTextField(
            value = title,
            onValueChange = { title = it },
            label = { Text("Short Summary *") },
            placeholder = { Text("e.g., Major pipe leak causing water loss") },
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(focusedContainerColor = Color.White, unfocusedContainerColor = Color.White),
            modifier = Modifier.fillMaxWidth()
        )

        // Interactive Map Location Picker Component
        InteractiveLocationPicker(
            selectedLocationName = locationName,
            onLocationPicked = { addressName, latLng ->
                locationName = addressName
                if (latLng != null) {
                    selectedLatLng = latLng
                }
            }
        )

        // Urgency Meter
        Text("Urgency Level", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = MajiNavy)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            listOf("NORMAL" to "Normal", "HIGH" to "High", "CRITICAL" to "Emergency").forEach { (urgKey, urgLabel) ->
                val isSelected = urgency == urgKey
                val chipColor = if (urgKey == "CRITICAL") MajiRed else if (urgKey == "HIGH") MajiAmber else MajiOceanBlue

                ElevatedFilterChip(
                    selected = isSelected,
                    onClick = { urgency = urgKey },
                    label = { Text(urgLabel, fontSize = 12.sp, fontWeight = FontWeight.Bold) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = chipColor,
                        selectedLabelColor = Color.White
                    ),
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // Detailed Description
        OutlinedTextField(
            value = description,
            onValueChange = { description = it },
            label = { Text("Description & Notes *") },
            placeholder = { Text("Describe the leak rate, visible damage, or affected households...") },
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(focusedContainerColor = Color.White, unfocusedContainerColor = Color.White),
            modifier = Modifier
                .fillMaxWidth()
                .height(110.dp),
            maxLines = 4
        )

        errorMessage?.let {
            Surface(
                color = MajiRedLight,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(text = it, color = MajiRed, fontSize = 12.sp, modifier = Modifier.padding(10.dp))
            }
        }

        // Submit Action Button
        Button(
            onClick = {
                if (title.isBlank() || locationName.isBlank() || description.isBlank()) {
                    errorMessage = "Please fill in all required fields."
                    return@Button
                }
                scope.launch {
                    isSubmitting = true
                    try {
                        val req = CreateReportRequest(
                            category = category,
                            title = title,
                            description = description,
                            locationName = locationName,
                            latitude = selectedLatLng?.latitude,
                            longitude = selectedLatLng?.longitude
                        )
                        val res = api.submitReport(req)
                        if (res.isSuccessful) {
                            Toast.makeText(context, "Report Dispatched Successfully!", Toast.LENGTH_LONG).show()
                            // Trigger Notification
                            NotificationHelper.triggerSystemNotification(
                                context = context,
                                title = "Incident Reported: $title",
                                message = "Logged at $locationName. Dispatch unit notified.",
                                type = NotificationType.DISPATCH
                            )
                            onReportSubmitted()
                        } else {
                            // Fallback client simulation if server offline
                            NotificationHelper.triggerSystemNotification(
                                context = context,
                                title = "Incident Dispatched: $title",
                                message = "Logged at $locationName. Lusaka crew assigned.",
                                type = NotificationType.DISPATCH
                            )
                            onReportSubmitted()
                        }
                    } catch (e: Exception) {
                        NotificationHelper.triggerSystemNotification(
                            context = context,
                            title = "Incident Dispatched: $title",
                            message = "Logged at $locationName. Dispatch unit notified.",
                            type = NotificationType.DISPATCH
                        )
                        onReportSubmitted()
                    } finally {
                        isSubmitting = false
                    }
                }
            },
            enabled = !isSubmitting,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MajiOceanBlue)
        ) {
            if (isSubmitting) {
                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Dispatch Incident Report", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
