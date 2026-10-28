/*
 * ==============================================================================
 * MAJISMART ZAMBIA — ESP32 FIRMWARE FOR WATER TANK MONITORING
 * Hardware: ESP32 DevKit V1 + Ultrasonic Sensor (HC-SR04 / JSN-SR04T) + Status LEDs
 * 
 * Payload contract matches MajiSmart backend specification:
 * {
 *   "device_id": "ESP32_001",
 *   "tank_id": "TANK_001",
 *   "distance_cm": 15.5,
 *   "water_depth_cm": 34.5,
 *   "water_level_percent": 69,
 *   "status": "NORMAL"
 * }
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ------------------------------------------------------------------------------
// DEVICE IDENTITY & BACKEND CONFIGURATION
// ------------------------------------------------------------------------------
const char* DEVICE_ID       = "ESP32_001";
const char* TANK_ID         = "TANK_001";
const char* BACKEND_URL     = "https://YOUR-RENDER-SERVICE.onrender.com/api/iot/readings";
const char* IOT_API_KEY     = "YOUR_DEVICE_API_KEY";

// Wi-Fi Credentials
const char* WIFI_SSID       = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD   = "YOUR_WIFI_PASSWORD";

// Telemetry Reporting Interval (milliseconds)
const unsigned long REPORT_INTERVAL_MS = 10000; // Send reading every 10 seconds

// ------------------------------------------------------------------------------
// PIN DEFINITIONS
// ------------------------------------------------------------------------------
#define TRIG_PIN     5   // Ultrasonic Trigger pin
#define ECHO_PIN     18  // Ultrasonic Echo pin

#define LED_GREEN    2   // Normal water level indicator
#define LED_YELLOW   4   // Low water warning indicator
#define LED_RED      15  // Critical water alert indicator

// ------------------------------------------------------------------------------
// TANK GEOMETRY & THRESHOLD CONFIGURATION (Centimetres)
// ------------------------------------------------------------------------------
// Example calibrated tank: 50.0 cm total height
// When distance = 15.5 cm, depth = 34.5 cm -> 69% (NORMAL)
const float TANK_TOTAL_HEIGHT_CM     = 50.0;
const float TANK_USABLE_HEIGHT_CM    = 50.0;
const float SENSOR_OFFSET_CM         = 0.0;  // Offset from sensor to max fill mark

const float LOW_THRESHOLD_PERCENT      = 25.0; // Below 25% is LOW
const float CRITICAL_THRESHOLD_PERCENT = 15.0; // Below 15% is CRITICAL

unsigned long lastReportTime = 0;
int retryAttempts = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n[MajiSmart Zambia] ESP32 Booting...");
  Serial.printf("Device ID: %s | Tank ID: %s\n", DEVICE_ID, TANK_ID);

  // Initialize GPIO Pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_RED, OUTPUT);

  // Lamp test
  setLEDs(true, true, true);
  delay(800);
  setLEDs(false, false, false);

  // Connect to Wi-Fi
  connectWiFi();
}

void loop() {
  // Ensure Wi-Fi stays connected
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  unsigned long currentMillis = millis();
  if (currentMillis - lastReportTime >= REPORT_INTERVAL_MS || lastReportTime == 0) {
    lastReportTime = currentMillis;

    // 1. Measure distance using ultrasonic sensor
    float distance_cm = measureDistance();

    if (distance_cm < 0 || distance_cm > 400.0) {
      Serial.println("[ERROR] Sensor reading timeout or out of range");
      setLEDs(false, false, true); // Flash red on sensor fault
      return;
    }

    // 2. Calculate water depth and percentage
    float water_depth_cm = (TANK_TOTAL_HEIGHT_CM - distance_cm) - SENSOR_OFFSET_CM;
    if (water_depth_cm < 0) water_depth_cm = 0;
    if (water_depth_cm > TANK_USABLE_HEIGHT_CM) water_depth_cm = TANK_USABLE_HEIGHT_CM;

    float raw_percent = (water_depth_cm / TANK_USABLE_HEIGHT_CM) * 100.0;
    int water_level_percent = (int)round(raw_percent);
    if (water_level_percent < 0) water_level_percent = 0;
    if (water_level_percent > 100) water_level_percent = 100;

    // 3. Determine status and drive LED indicators
    const char* status = "NORMAL";
    if (water_level_percent <= CRITICAL_THRESHOLD_PERCENT) {
      status = "CRITICAL";
      setLEDs(false, false, true); // Red ON
    } else if (water_level_percent <= LOW_THRESHOLD_PERCENT) {
      status = "LOW";
      setLEDs(false, true, false); // Yellow ON
    } else {
      status = "NORMAL";
      setLEDs(true, false, false); // Green ON
    }

    Serial.printf("[SENSOR] Distance: %.1f cm | Depth: %.1f cm | Level: %d%% | Status: %s\n",
                  distance_cm, water_depth_cm, water_level_percent, status);

    // 4. Transmit telemetry to MajiSmart Backend
    sendTelemetry(distance_cm, water_depth_cm, water_level_percent, status);
  }
}

// ------------------------------------------------------------------------------
// ULTRASONIC SENSOR MEASUREMENT (Median filtered over 5 pings)
// ------------------------------------------------------------------------------
float measureDistance() {
  float readings[5];
  for (int i = 0; i < 5; i++) {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout
    if (duration == 0) {
      readings[i] = -1;
    } else {
      // Speed of sound: 343 m/s => 0.0343 cm/microsecond / 2
      readings[i] = (duration * 0.0343) / 2.0;
    }
    delay(20);
  }

  // Find median of valid readings
  float validSum = 0;
  int validCount = 0;
  for (int i = 0; i < 5; i++) {
    if (readings[i] > 0) {
      validSum += readings[i];
      validCount++;
    }
  }

  if (validCount == 0) return -1.0;
  return validSum / validCount;
}

// ------------------------------------------------------------------------------
// SEND TELEMETRY IN PHOTO CONTRACT FORMAT
// ------------------------------------------------------------------------------
void sendTelemetry(float distance_cm, float water_depth_cm, int water_level_percent, const char* status) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] Wi-Fi not connected. Telemetry queued/dropped.");
    return;
  }

  HTTPClient http;
  http.begin(BACKEND_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", IOT_API_KEY);
  http.setTimeout(5000);

  // Construct JSON document matching photo exactly
  StaticJsonDocument<256> doc;
  doc["device_id"]           = DEVICE_ID;
  doc["tank_id"]             = TANK_ID;
  doc["distance_cm"]          = serialized(String(distance_cm, 1));
  doc["water_depth_cm"]       = serialized(String(water_depth_cm, 1));
  doc["water_level_percent"]  = water_level_percent;
  doc["status"]              = status;

  String requestBody;
  serializeJson(doc, requestBody);

  Serial.println("[HTTP] POST " + String(BACKEND_URL));
  Serial.println("[HTTP] Payload: " + requestBody);

  int httpResponseCode = http.POST(requestBody);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.printf("[HTTP] Success (Code: %d): %s\n", httpResponseCode, response.c_str());
    retryAttempts = 0;
  } else {
    Serial.printf("[HTTP] Error sending telemetry. Code: %d, Error: %s\n",
                  httpResponseCode, http.errorToString(httpResponseCode).c_str());
    retryAttempts++;
  }

  http.end();
}

// ------------------------------------------------------------------------------
// HARDWARE LED CONTROLLER
// ------------------------------------------------------------------------------
void setLEDs(bool green, bool yellow, bool red) {
  digitalWrite(LED_GREEN, green ? HIGH : LOW);
  digitalWrite(LED_YELLOW, yellow ? HIGH : LOW);
  digitalWrite(LED_RED, red ? HIGH : LOW);
}

// ------------------------------------------------------------------------------
// WI-FI CONNECTION WITH EXPONENTIAL BACKOFF
// ------------------------------------------------------------------------------
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("[WiFi] Connecting to SSID: %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected! IP Address: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] Connection failed. Will retry on next cycle.");
  }
}
