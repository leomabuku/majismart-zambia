package com.majismart.zambia.data.model

import com.google.gson.annotations.SerializedName

/**
 * Matches the photo and backend IoT contract:
 * {
 *   "device_id": "ESP32_001",
 *   "tank_id": "TANK_001",
 *   "distance_cm": 15.5,
 *   "water_depth_cm": 34.5,
 *   "water_level_percent": 69,
 *   "status": "NORMAL"
 * }
 */
data class WaterReading(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("tank_id") val tankId: String,
    @SerializedName("distance_cm") val distanceCm: Float,
    @SerializedName("water_depth_cm") val waterDepthCm: Float,
    @SerializedName("water_level_percent") val waterLevelPercent: Int,
    @SerializedName("status") val status: String,
    @SerializedName("created_at") val createdAt: String? = null
)

data class Tank(
    @SerializedName("id") val id: String,
    @SerializedName("tank_id_code") val tankIdCode: String,
    @SerializedName("name") val name: String,
    @SerializedName("station_name") val stationName: String?,
    @SerializedName("current_water_depth_cm") val currentWaterDepthCm: Float,
    @SerializedName("current_water_percent") val currentWaterPercent: Int,
    @SerializedName("current_status") val currentStatus: String,
    @SerializedName("total_height_cm") val totalHeightCm: Float,
    @SerializedName("capacity_liters") val capacityLiters: Int,
    @SerializedName("device_id_code") val deviceIdCode: String?,
    @SerializedName("device_status") val deviceStatus: String?,
    @SerializedName("last_reading_at") val lastReadingAt: String?
)

data class CommunityReport(
    @SerializedName("id") val id: String,
    @SerializedName("category") val category: String,
    @SerializedName("title") val title: String,
    @SerializedName("description") val description: String,
    @SerializedName("location_name") val locationName: String,
    @SerializedName("status") val status: String,
    @SerializedName("admin_notes") val adminNotes: String?,
    @SerializedName("created_at") val createdAt: String
)

data class CreateReportRequest(
    @SerializedName("category") val category: String,
    @SerializedName("title") val title: String,
    @SerializedName("description") val description: String,
    @SerializedName("location_name") val locationName: String,
    @SerializedName("latitude") val latitude: Double? = null,
    @SerializedName("longitude") val longitude: Double? = null,
    // How good the GPS fix was, and how it was obtained (GPS | NETWORK | MANUAL).
    @SerializedName("location_accuracy_m") val locationAccuracyM: Double? = null,
    @SerializedName("location_source") val locationSource: String? = null,
    // Leak photo evidence, base64 JPEG captured in the app.
    @SerializedName("photo_base64") val photoBase64: String? = null,
    @SerializedName("photo_mime") val photoMime: String? = null
)

data class ApiResponse<T>(
    @SerializedName("success") val success: Boolean,
    @SerializedName("data") val data: T?,
    @SerializedName("error") val error: String?
)

data class SummaryResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("summary") val summary: Map<String, Int>
)
