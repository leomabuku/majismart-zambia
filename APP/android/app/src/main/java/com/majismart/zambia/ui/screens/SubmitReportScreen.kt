package com.majismart.zambia.ui.screens

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.util.Base64
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.maps.model.LatLng
import com.majismart.zambia.data.model.CreateReportRequest
import com.majismart.zambia.data.remote.MajiSmartApiService
import com.majismart.zambia.notifications.NotificationHelper
import com.majismart.zambia.notifications.NotificationType
import com.majismart.zambia.ui.components.InteractiveLocationPicker
import com.majismart.zambia.ui.theme.*
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.util.Locale

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
    var locationName by remember { mutableStateOf("") }
    var selectedLatLng by remember { mutableStateOf<LatLng?>(null) }
    var description by remember { mutableStateOf("") }
    var urgency by remember { mutableStateOf("UNKNOWN") }
    var isSubmitting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // Leak evidence captured on the spot.
    var photoBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var gpsAccuracy by remember { mutableStateOf<Double?>(null) }
    var locationSource by remember { mutableStateOf("MANUAL") }
    var locating by remember { mutableStateOf(false) }

    val categories = listOf(
        Triple("BURST_PIPE", "Burst Pipe", Icons.Default.InvertColors),
        Triple("PIPE_LEAKAGE", "Pipe Leak", Icons.Default.WaterDrop),
        Triple("WATER_SHORTAGE", "No Water", Icons.Default.Speed),
        Triple("WATER_QUALITY", "Water Quality", Icons.Default.Warning),
        Triple("LOW_PRESSURE", "Low Pressure", Icons.Default.Speed),
        Triple("WATER_INTERRUPTION", "Interruption", Icons.Default.Warning),
        Triple("DAMAGED_INFRASTRUCTURE", "Damage", Icons.Default.Warning),
        Triple("TANK_MALFUNCTION", "Tank Fault", Icons.Default.Warning),
        Triple("MONITORING_FAULT", "Sensor Fault", Icons.Default.Warning),
        Triple("OTHER", "Other", Icons.Default.Warning)
    )

    val locationClient = remember { LocationServices.getFusedLocationProviderClient(context) }

    fun useCurrentLocation() {
        locating = true
        errorMessage = null
        try {
            locationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
                .addOnSuccessListener { loc ->
                    locating = false
                    if (loc != null) {
                        val latLng = LatLng(loc.latitude, loc.longitude)
                        selectedLatLng = latLng
                        gpsAccuracy = if (loc.hasAccuracy()) loc.accuracy.toDouble() else null
                        locationSource = if (loc.hasAccuracy() && loc.accuracy <= 60f) "GPS" else "NETWORK"
                        locationName = String.format(
                            Locale.US, "%.5f, %.5f", loc.latitude, loc.longitude
                        )
                    } else {
                        errorMessage = "Could not get a GPS fix. Move outside and try again."
                    }
                }
                .addOnFailureListener {
                    locating = false
                    errorMessage = "Location unavailable: ${it.message}"
                }
        } catch (e: SecurityException) {
            locating = false
            errorMessage = "Location permission is required to pin the leak."
        }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        val granted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) {
            useCurrentLocation()
        } else {
            errorMessage = "Location permission denied. You can still describe where the leak is."
        }
    }

    // TakePicturePreview needs no FileProvider and no storage permission: the
    // camera app hands back a small bitmap that we compress before upload.
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicturePreview()
    ) { bitmap ->
        if (bitmap != null) {
            photoBitmap = bitmap
        }
    }

    fun launchCamera() {
        try {
            cameraLauncher.launch(null)
        } catch (_: ActivityNotFoundException) {
            errorMessage = "No camera app is available. You can submit this report without a photo."
        }
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            launchCamera()
        } else {
            errorMessage = "Camera permission denied. A photo helps the crew find the leak."
        }
    }

    fun openCamera() {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) launchCamera() else cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
    }

    /** Downscale + JPEG-compress so a phone photo stays well under the 2 MB API cap. */
    fun encodePhoto(bitmap: Bitmap): String {
        val maxSide = 1280
        val scale = minOf(1f, maxSide.toFloat() / maxOf(bitmap.width, bitmap.height))
        val scaled = if (scale < 1f) {
            Bitmap.createScaledBitmap(
                bitmap,
                (bitmap.width * scale).toInt().coerceAtLeast(1),
                (bitmap.height * scale).toInt().coerceAtLeast(1),
                true
            )
        } else {
            bitmap
        }
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 60, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

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
                        text = "Submit your report for review; a crew assignment is not guaranteed",
                        fontSize = 14.sp,
                        color = Color.Gray
                    )
                }
            }
        }

        // Category Selection Chips
        Text("Incident Category *", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = MajiNavy)
        categories.chunked(2).forEach { rowCategories ->
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            rowCategories.forEach { (catId, catLabel, catIcon) ->
                FilterChip(
                    selected = category == catId,
                    onClick = { category = catId },
                    leadingIcon = { Icon(catIcon, contentDescription = null, modifier = Modifier.size(16.dp)) },
                    label = { Text(catLabel, fontSize = 14.sp) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MajiOceanBlue,
                        selectedLabelColor = Color.White
                    ),
                    modifier = Modifier.weight(1f)
                )
            }
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
                    locationSource = "MANUAL"
                    gpsAccuracy = null
                }
            }
        )
        OutlinedTextField(value = locationName, onValueChange = { locationName = it }, label = { Text("Location / community *") }, modifier = Modifier.fillMaxWidth())

        // GPS fix card: pin the leak at the reporter's real position
        Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(color = MajiOceanBlue.copy(alpha = 0.12f), shape = CircleShape, modifier = Modifier.size(40.dp)) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.MyLocation, contentDescription = null, tint = MajiOceanBlue, modifier = Modifier.size(20.dp))
                        }
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Share my current location", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = MajiNavy)
                        Text(
                            "Shares an approximate GPS pin and accuracy with the report.",
                            fontSize = 14.sp,
                            color = Color(0xFF64748B)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Button(
                        onClick = {
                            locationPermissionLauncher.launch(
                                arrayOf(
                                    Manifest.permission.ACCESS_FINE_LOCATION,
                                    Manifest.permission.ACCESS_COARSE_LOCATION
                                )
                            )
                        },
                        enabled = !locating,
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MajiOceanBlue)
                    ) {
                        if (locating) {
                            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                        } else {
                            Icon(Icons.Default.MyLocation, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                        }
                        Text(if (locating) "Locating…" else "Use my location", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }

                    gpsAccuracy?.let { acc ->
                        Surface(color = MajiGreenLight, shape = RoundedCornerShape(999.dp)) {
                            Text(
                                text = String.format(Locale.US, "±%.0f m accuracy", acc),
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF047857),
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                            )
                        }
                    }
                }

                selectedLatLng?.let { pin ->
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = String.format(Locale.US, "Pin: %.5f, %.5f (%s)", pin.latitude, pin.longitude, locationSource),
                        fontSize = 14.sp,
                        color = Color(0xFF64748B)
                    )
                }
            }
        }

        // Leak photo evidence
        Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(color = MajiRed.copy(alpha = 0.12f), shape = CircleShape, modifier = Modifier.size(40.dp)) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.CameraAlt, contentDescription = null, tint = MajiRed, modifier = Modifier.size(20.dp))
                        }
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Photo of the leak", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = MajiNavy)
                        Text(
                            "A picture is attached to the report with its GPS pin, so the crew knows exactly what to expect.",
                            fontSize = 14.sp,
                            color = Color(0xFF64748B)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                val shot = photoBitmap
                if (shot != null) {
                    Image(
                        bitmap = shot.asImageBitmap(),
                        contentDescription = "Leak photo preview",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(160.dp)
                            .clip(RoundedCornerShape(12.dp))
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { openCamera() }, shape = RoundedCornerShape(10.dp)) {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Retake", fontSize = 14.sp)
                        }
                        TextButton(onClick = { photoBitmap = null }) {
                            Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(16.dp), tint = MajiRed)
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Remove", fontSize = 14.sp, color = MajiRed)
                        }
                    }
                } else {
                    Button(
                        onClick = { openCamera() },
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MajiRed)
                    ) {
                        Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Take photo of leak", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Urgency Meter
        Text("Urgency Level", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = MajiNavy)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            listOf("LOW" to "Low", "MEDIUM" to "Medium", "HIGH" to "High").forEach { (urgKey, urgLabel) ->
                val isSelected = urgency == urgKey
                val chipColor = if (urgKey == "HIGH") MajiRed else if (urgKey == "MEDIUM") MajiAmber else MajiOceanBlue

                ElevatedFilterChip(
                    selected = isSelected,
                    onClick = { urgency = urgKey },
                    label = { Text(urgLabel, fontSize = 14.sp, fontWeight = FontWeight.Bold) },
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
                .heightIn(min = 110.dp),
            maxLines = 4
        )

        errorMessage?.let {
            Surface(
                color = MajiRedLight,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(text = it, color = MajiRed, fontSize = 14.sp, modifier = Modifier.padding(10.dp))
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
                            reportedSeverity = urgency,
                            title = title,
                            description = description,
                            locationName = locationName,
                            latitude = selectedLatLng?.latitude,
                            longitude = selectedLatLng?.longitude,
                            locationAccuracyM = gpsAccuracy,
                            locationSource = locationSource,
                            photoBase64 = photoBitmap?.let { encodePhoto(it) },
                            photoMime = if (photoBitmap != null) "image/jpeg" else null
                        )
                        val res = api.submitReport(req)
                        if (res.isSuccessful && res.body()?.success == true) {
                            Toast.makeText(context, "Report submitted. No crew assignment is confirmed yet.", Toast.LENGTH_LONG).show()
                            onReportSubmitted()
                        } else {
                            errorMessage = "Report not submitted. Please check your details and try again."
                        }
                    } catch (e: kotlinx.coroutines.CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        errorMessage = "Submission was not confirmed. Check your reports before retrying to avoid duplicates."
                    } finally {
                        isSubmitting = false
                    }
                }
            },
            enabled = !isSubmitting,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MajiOceanBlue)
        ) {
            if (isSubmitting) {
                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Submit Incident Report", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

