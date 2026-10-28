package com.majismart.zambia.ui.components

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.android.gms.maps.model.LatLng
import com.majismart.zambia.ui.theme.*

@Composable
fun InteractiveLocationPicker(
    selectedLocationName: String,
    onLocationPicked: (String, LatLng?) -> Unit,
    modifier: Modifier = Modifier
) {
    var isMapExpanded by remember { mutableStateOf(false) }
    var currentPresetIndex by remember { mutableStateOf(0) }

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "Location on Lusaka Map *",
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp,
            color = MajiNavy
        )
        Spacer(modifier = Modifier.height(6.dp))

        // Selected Location Card with Toggle Map View Button
        Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(14.dp),
            border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(Color(0xFFCBD5E1))),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            color = MajiOceanBlue.copy(alpha = 0.12f),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.size(38.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.PinDrop,
                                    contentDescription = null,
                                    tint = MajiOceanBlue
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = if (selectedLocationName.isBlank()) "Tap Map or Select Below" else selectedLocationName,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = MajiNavy
                            )
                            Text(
                                text = "Lusaka Water & Sewerage District",
                                fontSize = 11.sp,
                                color = Color.Gray
                            )
                        }
                    }

                    OutlinedButton(
                        onClick = { isMapExpanded = !isMapExpanded },
                        shape = RoundedCornerShape(10.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Icon(
                            imageVector = if (isMapExpanded) Icons.Default.Close else Icons.Default.Map,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(if (isMapExpanded) "Close Map" else "Open Map", fontSize = 12.sp)
                    }
                }

                // Preset Quick Chips
                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    LUSAKA_PRESETS.take(3).forEachIndexed { idx, preset ->
                        FilterChip(
                            selected = currentPresetIndex == idx,
                            onClick = {
                                currentPresetIndex = idx
                                onLocationPicked(preset.name, preset.latLng)
                            },
                            label = { Text(preset.name.take(16), fontSize = 11.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MajiSoftBlue,
                                selectedLabelColor = MajiNavy
                            )
                        )
                    }
                }
            }
        }

        // Expanded Interactive Map View Container
        AnimatedVisibility(visible = isMapExpanded) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(280.dp)
                    .padding(top = 10.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .border(1.dp, MajiCyan, RoundedCornerShape(16.dp))
            ) {
                InteractiveMapView(
                    isPickerMode = true,
                    selectedLatLng = LUSAKA_PRESETS[currentPresetIndex].latLng,
                    onLocationSelected = { latLng, addressName ->
                        onLocationPicked(addressName, latLng)
                        isMapExpanded = false
                    }
                )
            }
        }
    }
}
