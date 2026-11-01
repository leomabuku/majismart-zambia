package com.majismart.zambia.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.majismart.zambia.data.model.Tank

@Composable
fun HomeScreen(tanks: List<Tank>, isLoading: Boolean, connectionError: String?, lastSyncedAt: String?, onRefresh: () -> Unit, onNavigateToReport: () -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("Your water", fontSize = 24.sp)
            Text("The last known level may be stale if the device is offline or has a sensor error.")
            Text("Refreshes every second while this screen is open. Last successful tank sync: ${lastSyncedAt ?: "Never"}.")
            if (connectionError != null) Text(connectionError, color = MaterialTheme.colorScheme.error)
            Row { TextButton(onClick = onRefresh) { Text("Refresh") }; TextButton(onClick = onNavigateToReport) { Text("Report a problem") } }
            if (isLoading) CircularProgressIndicator()
            if (!isLoading && connectionError == null && tanks.isEmpty()) Text("No tank is assigned to your account. Contact your administrator.")
        }
        items(tanks) { tank ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(tank.name, fontSize = 20.sp)
                    if (tank.lastReadingAt == null) Text("No reading received yet") else {
                        Text("Last known level: ${tank.currentWaterPercent}%")
                        tank.currentVolumeL?.let { Text("Estimated volume: %.1f L".format(it)) }
                    }
                    Text("Condition: ${if (tank.deviceStatus == "OFFLINE") "DEVICE OFFLINE" else if (tank.deviceStatus == "ERROR" || tank.currentStatus == "SENSOR_ERROR") "SENSOR ERROR" else tank.currentCondition ?: tank.currentStatus}")
                    Text("Device: ${tank.deviceStatus ?: "UNKNOWN"}")
                    Text("Last update: ${tank.lastReadingAt ?: "Never"}")
                    if (tank.installationStatus != "CALIBRATED") Text("Calibration not verified; estimates may be inaccurate.")
                }
            }
        }
    }
}

