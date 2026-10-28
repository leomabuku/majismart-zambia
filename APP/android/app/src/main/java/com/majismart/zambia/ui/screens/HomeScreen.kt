package com.majismart.zambia.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.majismart.zambia.data.model.Tank
import com.majismart.zambia.ui.components.WaterGauge
import com.majismart.zambia.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    tanks: List<Tank>,
    isLoading: Boolean,
    onRefresh: () -> Unit,
    onNavigateToReport: () -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedRegion by remember { mutableStateOf("All") }

    val regions = listOf("All", "Lusaka Central", "Chilenje", "Matero", "Kabwata", "Chelston")

    val filteredTanks = remember(tanks, searchQuery, selectedRegion) {
        tanks.filter { tank ->
            val matchesSearch = tank.name.contains(searchQuery, ignoreCase = true) ||
                    tank.tankIdCode.contains(searchQuery, ignoreCase = true) ||
                    (tank.stationName?.contains(searchQuery, ignoreCase = true) ?: false)
            val matchesRegion = selectedRegion == "All" ||
                    (tank.stationName?.contains(selectedRegion, ignoreCase = true) ?: true)
            matchesSearch && matchesRegion
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(vertical = 16.dp)
    ) {
        // Hero Status Banner
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color.Transparent),
                shape = RoundedCornerShape(20.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            brush = Brush.horizontalGradient(
                                colors = listOf(MajiOceanBlue, MajiCyan)
                            )
                        )
                        .padding(18.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Surface(
                                    color = MajiEmerald,
                                    shape = CircleShape,
                                    modifier = Modifier.size(10.dp)
                                ) {}
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Central Grid Telemetry Active",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp,
                                    color = Color.White
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Connected to Lusaka Water & Sanitation Corporation IoT Network",
                                fontSize = 12.sp,
                                color = MajiSky
                            )
                        }

                        IconButton(
                            onClick = onRefresh,
                            modifier = Modifier
                                .background(Color.White.copy(alpha = 0.2f), CircleShape)
                        ) {
                            Icon(
                                Icons.Default.Refresh,
                                contentDescription = "Refresh Telemetry",
                                tint = Color.White
                            )
                        }
                    }
                }
            }
        }

        // Quick Telemetry Summary Cards Row
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Card 1: Total Capacity
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            color = MajiOceanBlue.copy(alpha = 0.12f),
                            shape = CircleShape,
                            modifier = Modifier.size(38.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.Water,
                                    contentDescription = null,
                                    tint = MajiOceanBlue,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text("Total Storage", fontSize = 11.sp, color = Color.Gray, fontWeight = FontWeight.Bold)
                            Text("100,000 L", fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = MajiNavy)
                        }
                    }
                }

                // Card 2: Active Sensors
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            color = MajiEmerald.copy(alpha = 0.12f),
                            shape = CircleShape,
                            modifier = Modifier.size(38.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.Sensors,
                                    contentDescription = null,
                                    tint = MajiEmerald,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text("IoT Sensors", fontSize = 11.sp, color = Color.Gray, fontWeight = FontWeight.Bold)
                            Text("${tanks.size} Online", fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = MajiNavy)
                        }
                    }
                }
            }
        }

        // Search Bar & Region Filters
        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Search tanks by code, name or district...", fontSize = 13.sp) },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = MajiNavy) },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(Icons.Default.Close, contentDescription = "Clear search", tint = Color.Gray)
                            }
                        }
                    },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color.White,
                        unfocusedContainerColor = Color.White,
                        focusedBorderColor = MajiCyan,
                        unfocusedBorderColor = Color(0xFFCBD5E1)
                    ),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(regions) { reg ->
                        FilterChip(
                            selected = selectedRegion == reg,
                            onClick = { selectedRegion = reg },
                            label = { Text(reg, fontWeight = FontWeight.SemiBold, fontSize = 12.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MajiOceanBlue,
                                selectedLabelColor = Color.White,
                                containerColor = Color.White,
                                labelColor = MajiNavy
                            ),
                            shape = RoundedCornerShape(12.dp)
                        )
                    }
                }
            }
        }

        // Section Title: Community Tanks
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Reservoirs & Tank Levels (${filteredTanks.size})",
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    color = MajiNavy
                )

                TextButton(onClick = onNavigateToReport) {
                    Icon(Icons.Default.ReportProblem, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Report Leak", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = MajiRed)
                }
            }
        }

        // Loading State / Tanks List
        if (isLoading && tanks.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = MajiCyan)
                }
            }
        } else if (filteredTanks.isEmpty()) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(Icons.Default.WaterDrop, contentDescription = null, tint = Color.Gray, modifier = Modifier.size(48.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("No telemetry tanks matched your filter", fontWeight = FontWeight.Bold, color = MajiNavy)
                        Text("Try resetting your region filter or search term", fontSize = 12.sp, color = Color.Gray)
                    }
                }
            }
        } else {
            items(filteredTanks) { tank ->
                WaterGauge(tank = tank)
            }
        }
    }
}
