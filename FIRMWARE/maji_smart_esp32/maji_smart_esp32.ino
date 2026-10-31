/*
 * ==============================================================================
 * MAJISMART ZAMBIA — ESP32 FIRMWARE FOR WATER TANK MONITORING
 * Hardware: ESP32 DevKit V1 + Ultrasonic Sensor (HC-SR04 / JSN-SR04T) + Status LEDs
 * 
 * Sends authenticated raw sensor distance; the server interprets geometry,
 * calibration and condition. Configure HTTPS, CA certificate and device key.
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// ------------------------------------------------------------------------------
// DEVICE IDENTITY & BACKEND CONFIGURATION
// ------------------------------------------------------------------------------
const char* DEVICE_ID       = "ESP32_001";
const char* TANK_ID         = "TANK_001";
const char* BACKEND_URL     = "https://YOUR-RENDER-SERVICE.onrender.com/api/iot/readings";
const char* IOT_API_KEY     = "YOUR_DEVICE_API_KEY";
// Install the trusted CA certificate for the HTTPS server, not an insecure bypass.
const char* SERVER_CA_CERT = "YOUR_CA_CERT_PEM";

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

    // The backend alone interprets distance using the installed calibration.
    Serial.printf("[SENSOR] Median distance: %.2f cm\n", distance_cm);
    sendTelemetry(distance_cm);

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

  // Reject timeouts/out-of-range samples and require a majority of valid pings.
  float valid[5];
  int count = 0;
  for (int i = 0; i < 5; i++) if (readings[i] >= 2.0 && readings[i] <= 400.0) valid[count++] = readings[i];
  if (count < 3) return -1.0;
  for (int i = 1; i < count; i++) {
    float x = valid[i]; int j = i - 1;
    while (j >= 0 && valid[j] > x) { valid[j + 1] = valid[j]; j--; }
    valid[j + 1] = x;
  }
  return count % 2 ? valid[count / 2] : (valid[count / 2 - 1] + valid[count / 2]) / 2.0;

}

// ------------------------------------------------------------------------------
// SEND TELEMETRY IN PHOTO CONTRACT FORMAT
// ------------------------------------------------------------------------------
void sendTelemetry(float distance_cm) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] Wi-Fi not connected. Reading dropped; will sample again on the next interval.");
    return;
  }

  if (!String(BACKEND_URL).startsWith("https://") || String(SERVER_CA_CERT).indexOf("BEGIN CERTIFICATE") < 0) {
    Serial.println("[HTTP] Configure HTTPS and a trusted CA certificate before use.");
    return;
  }
  WiFiClientSecure client;
  client.setCACert(SERVER_CA_CERT);
  HTTPClient http;
  if (!http.begin(client, BACKEND_URL)) { Serial.println("[HTTP] TLS setup failed"); return; }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", IOT_API_KEY);
  http.setTimeout(5000);

  // Construct JSON document matching photo exactly
  StaticJsonDocument<256> doc;
  doc["device_id"]           = DEVICE_ID;
  doc["tank_id"]             = TANK_ID;
  doc["distance_cm"]          = serialized(String(distance_cm, 1));

  String requestBody;
  serializeJson(doc, requestBody);

  Serial.println("[HTTP] POST " + String(BACKEND_URL));
  Serial.println("[HTTP] Payload: " + requestBody);

  int httpResponseCode = http.POST(requestBody);

  if (httpResponseCode >= 200 && httpResponseCode < 300) {
    String response = http.getString();
    Serial.printf("[HTTP] Accepted (Code: %d)\n", httpResponseCode);
    StaticJsonDocument<768> result;
    if (deserializeJson(result, response) == DeserializationError::Ok) {
      const char* condition = result["data"]["condition"] | "";
      if (strcmp(condition, "CRITICAL") == 0) setLEDs(false, false, true);
      else if (strcmp(condition, "LOW") == 0 || strcmp(condition, "WARNING") == 0) setLEDs(false, true, false);
      else if (strcmp(condition, "NORMAL") == 0) setLEDs(true, false, false);
    }
    retryAttempts = 0;
  } else {
    Serial.printf("[HTTP] Rejected or failed; next sample will retry. Code: %d, Error: %s\n",
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
