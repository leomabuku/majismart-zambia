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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.majismart.zambia.data.model.CommunityReport
import com.majismart.zambia.ui.theme.*

@Composable
fun MyReportsScreen(
    reports: List<CommunityReport>,
    onRefresh: () -> Unit
) {
    var selectedFilter by remember { mutableStateOf("ALL") }

    val filteredReports = remember(reports, selectedFilter) {
        if (selectedFilter == "ALL") reports
        else reports.filter { it.status.uppercase() == selectedFilter }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Title & Header
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
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Your reports",
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp,
                            color = MajiNavy
                        )
                        Text(
                            text = "Track the status of reports you submitted",
                            fontSize = 14.sp,
                            color = Color.Gray
                        )
                    }

                    IconButton(onClick = onRefresh) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = MajiOceanBlue)
                    }
                }
            }
        }

        // Status Filter Chips
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(listOf("ALL" to "All Reports", "IN_PROGRESS" to "In Progress", "RESOLVED" to "Resolved")) { (filterKey, filterLabel) ->
                    FilterChip(
                        selected = selectedFilter == filterKey,
                        onClick = { selectedFilter = filterKey },
                        label = { Text(filterLabel, fontSize = 14.sp, fontWeight = FontWeight.Bold) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MajiOceanBlue,
                            selectedLabelColor = Color.White
                        )
                    )
                }
            }
        }

        // Reports Timeline List
        if (filteredReports.isEmpty()) {
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
                        Icon(Icons.Default.CheckCircleOutline, contentDescription = null, tint = MajiEmerald, modifier = Modifier.size(48.dp))
                        Spacer(modifier = Modifier.height(10.dp))
                        Text("No reports found", fontWeight = FontWeight.Bold, color = MajiNavy)
                        Text("Submitted community issues will appear here with live tracking updates.", fontSize = 14.sp, color = Color.Gray)
                    }
                }
            }
        } else {
            items(filteredReports) { rep ->
                ReportItemCard(rep)
            }
        }
    }
}

@Composable
fun ReportItemCard(report: CommunityReport) {
    val isResolved = report.status.uppercase() == "RESOLVED"
    val statusColor = if (isResolved) MajiEmerald else MajiOceanBlue
    val statusBg = if (isResolved) MajiGreenLight else MajiSoftBlue

    Card(
        colors = CardDefaults.cardColors(containerColor = Color.White),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header: Title & Status Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = report.title,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = MajiNavy
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Place, contentDescription = null, tint = Color.Gray, modifier = Modifier.size(14.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(report.locationName, fontSize = 14.sp, color = Color.Gray)
                    }
                }

                Surface(
                    color = statusBg,
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(
                        text = report.status,
                        color = statusColor,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 14.sp,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            Text(report.description, fontSize = 14.sp, color = MajiTextPrimary)

            Spacer(modifier = Modifier.height(14.dp))

            // Dispatch Step Timeline Visualizer
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                TimelineStep(stepName = "Logged", isActive = true)
                HorizontalDivider(modifier = Modifier.weight(1f), color = MajiOceanBlue)
                TimelineStep(stepName = "Dispatched", isActive = true)
                HorizontalDivider(modifier = Modifier.weight(1f), color = if (isResolved) MajiEmerald else Color.LightGray)
                TimelineStep(stepName = "Resolved", isActive = isResolved)
            }

            // Admin Notes Box
            report.adminNotes?.let { notes ->
                Spacer(modifier = Modifier.height(12.dp))
                Surface(
                    color = MajiSoftBlue,
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Build, contentDescription = null, tint = MajiOceanBlue, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Dispatch Unit Note: $notes",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            color = MajiNavy
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun TimelineStep(stepName: String, isActive: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Surface(
            color = if (isActive) MajiOceanBlue else Color.LightGray,
            shape = CircleShape,
            modifier = Modifier.size(12.dp)
        ) {}
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            text = stepName,
            fontSize = 14.sp,
            fontWeight = if (isActive) FontWeight.Bold else FontWeight.Normal,
            color = if (isActive) MajiNavy else Color.Gray
        )
    }
}

