package com.majismart.zambia.ui.components

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.*
import com.majismart.zambia.data.model.CommunityReport
import com.majismart.zambia.data.model.Tank
import com.majismart.zambia.ui.theme.*
import kotlinx.coroutines.launch

data class MapLocationPreset(
    val name: String,
    val description: String,
    val latLng: LatLng
)

val LUSAKA_PRESETS = listOf(
    MapLocationPreset("Lusaka Central Water Grid", "CBD Main Distribution Tower", LatLng(-15.4167, 28.2833)),
    MapLocationPreset("Chilenje South Market", "Community Tank TANK_001", LatLng(-15.4411, 28.3245)),
    MapLocationPreset("Kabwata Commercial Hub", "Reservoir Station TANK_002", LatLng(-15.4330, 28.3000)),
    MapLocationPreset("Matero East Substation", "Pump & Tank TANK_003", LatLng(-15.3850, 28.2580)),
    MapLocationPreset("UNZA Great East Campus", "University Hydro Station", LatLng(-15.3920, 28.3310)),
    MapLocationPreset("Kalingalinga Community", "District Pipe Line & Water Tank", LatLng(-15.4080, 28.3390)),
    MapLocationPreset("Chelston Reservoir", "High Capacity Storage Unit", LatLng(-15.3710, 28.3750))
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InteractiveMapView(
    modifier: Modifier = Modifier,
    tanks: List<Tank> = emptyList(),
    reports: List<CommunityReport> = emptyList(),
    selectedLatLng: LatLng? = null,
    onLocationSelected: ((LatLng, String) -> Unit)? = null,
    isPickerMode: Boolean = false
) {
    val coroutineScope = rememberCoroutineScope()
    val defaultLusaka = LatLng(-15.4167, 28.2833)
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(selectedLatLng ?: defaultLusaka, 13f)
    }

    var searchQuery by remember { mutableStateOf("") }
    var isSearchFocused by remember { mutableStateOf(false) }
    var currentPinnedLocation by remember { mutableStateOf<LatLng?>(selectedLatLng) }
    var pinnedAddressName by remember { mutableStateOf(if (selectedLatLng == null) "Tap the map to choose" else "Selected Map Position") }

    // Filter preset locations based on search query
    val filteredPresets = remember(searchQuery) {
        if (searchQuery.isBlank()) LUSAKA_PRESETS
        else LUSAKA_PRESETS.filter {
            it.name.contains(searchQuery, ignoreCase = true) ||
                    it.description.contains(searchQuery, ignoreCase = true)
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        // Google Map Render
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(isMyLocationEnabled = false),
            uiSettings = MapUiSettings(
                zoomControlsEnabled = false,
                compassEnabled = true,
                myLocationButtonEnabled = false
            ),
            onMapClick = { latLng ->
                currentPinnedLocation = latLng
                pinnedAddressName = "Lat: %.4f, Lng: %.4f".format(latLng.latitude, latLng.longitude)
                onLocationSelected?.invoke(latLng, pinnedAddressName)
                coroutineScope.launch {
                    cameraPositionState.animate(CameraUpdateFactory.newLatLng(latLng))
                }
            }
        ) {
            // Only stored, valid coordinates are plotted. Missing locations remain unplaced.
            tanks.forEach { tank ->
                val lat = tank.latitude
                val lng = tank.longitude
                if (lat != null && lng != null && lat.isFinite() && lng.isFinite() && lat in -90.0..90.0 && lng in -180.0..180.0) {
                    Marker(
                        state = MarkerState(position = LatLng(lat, lng)),
                        title = tank.name,
                        snippet = if (tank.lastReadingAt == null) "No reading received" else "Last known: ${tank.currentWaterPercent}% • ${tank.deviceStatus ?: "UNKNOWN"}"
                    )
                }
            }
            reports.forEach { report ->
                val lat = report.latitude
                val lng = report.longitude
                if (lat != null && lng != null && lat.isFinite() && lng.isFinite() && lat in -90.0..90.0 && lng in -180.0..180.0) {
                    Marker(state = MarkerState(position = LatLng(lat, lng)), title = "Report: ${report.title}", snippet = "${report.status} • ${report.locationName}")
                }
            }
            currentPinnedLocation?.let { pin ->
                if (isPickerMode || selectedLatLng != null) Marker(state = MarkerState(position = pin), title = "Selected Location", snippet = pinnedAddressName)
            }
        }

        // Top Search Bar & Floating Location Suggestions
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
                .align(Alignment.TopCenter)
        ) {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Search,
                        contentDescription = "Search map",
                        tint = MajiNavy
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = {
                            searchQuery = it
                            isSearchFocused = true
                        },
                        placeholder = { Text("Search location in Lusaka...", fontSize = 16.sp) },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Color.Transparent,
                            unfocusedBorderColor = Color.Transparent
                        ),
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    if (searchQuery.isNotEmpty()) {
                        IconButton(onClick = {
                            searchQuery = ""
                            isSearchFocused = false
                        }) {
                            Icon(Icons.Default.Close, contentDescription = "Clear", tint = Color.Gray)
                        }
                    }
                }
            }

            // Dropdown suggestion list
            AnimatedVisibility(visible = isSearchFocused && filteredPresets.isNotEmpty()) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 10.dp),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp)
                ) {
                    LazyColumn(
                        modifier = Modifier.heightIn(max = 200.dp)
                    ) {
                        items(filteredPresets) { preset ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        searchQuery = preset.name
                                        isSearchFocused = false
                                        currentPinnedLocation = preset.latLng
                                        pinnedAddressName = preset.name
                                        onLocationSelected?.invoke(preset.latLng, preset.name)
                                        coroutineScope.launch {
                                            cameraPositionState.animate(
                                                CameraUpdateFactory.newLatLngZoom(preset.latLng, 15f)
                                            )
                                        }
                                    }
                                    .padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Surface(
                                    color = MajiSoftBlue,
                                    shape = CircleShape,
                                    modifier = Modifier.size(36.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.LocationOn,
                                            contentDescription = null,
                                            tint = MajiOceanBlue,
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                }
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text(
                                        text = preset.name,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 16.sp,
                                        color = MajiNavy
                                    )
                                    Text(
                                        text = preset.description,
                                        fontSize = 14.sp,
                                        color = Color.Gray
                                    )
                                }
                            }
                            HorizontalDivider(color = Color(0xFFF1F5F9))
                        }
                    }
                }
            }
        }

        // Bottom Map Location Badge / Direct Action
        if (isPickerMode) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.BottomCenter)
                    .padding(16.dp),
                shape = RoundedCornerShape(16.dp),
                color = Color.White,
                shadowElevation = 8.dp
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            color = MajiEmerald.copy(alpha = 0.15f),
                            shape = CircleShape,
                            modifier = Modifier.size(40.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.PinDrop,
                                    contentDescription = null,
                                    tint = MajiEmerald
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "Selected Location",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.Gray
                            )
                            Text(
                                text = pinnedAddressName,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = MajiNavy
                            )
                        }
                    }
                    Button(
                        onClick = {
                            currentPinnedLocation?.let { onLocationSelected?.invoke(it, pinnedAddressName) }
                        },
                        enabled = currentPinnedLocation != null,
                        colors = ButtonDefaults.buttonColors(containerColor = MajiOceanBlue),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text("Confirm")
                    }
                }
            }
        }
    }
}

