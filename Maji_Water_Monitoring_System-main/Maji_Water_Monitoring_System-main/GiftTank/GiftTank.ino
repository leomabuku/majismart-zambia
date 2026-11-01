// ============================================
// MAJISMART ZAMBIA
// IoT WATER MONITORING SYSTEM
//
// ESP32 + HC-SR04 + LEDs
// Wi-Fi + Supabase Integration
// ============================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>

// ============================================
// WI-FI CONFIGURATION
// ============================================

// ENTER YOUR WI-FI DETAILS HERE

const char* WIFI_SSID = "TreshGift";
const char* WIFI_PASSWORD = "tresh123123";

// ============================================
// SUPABASE CONFIGURATION
// ============================================

// Replace with your actual Supabase details

const char* SUPABASE_URL =
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/receive-reading";

const char* DEVICE_API_KEY =
  "YOUR_DEVICE_API_KEY";

// ============================================
// SENSOR PINS
// ============================================

#define TRIG_PIN 18
#define ECHO_PIN 19

// ============================================
// LED PINS
// ============================================

#define RED_LED 21
#define YELLOW_LED 22
#define GREEN_LED 23

// ============================================
// TANK CONFIGURATION
// ============================================

const char* TANK_ID = "TANK_001";

const float EMPTY_DISTANCE = 10.24;
const float FULL_DISTANCE = 2.0;

// ============================================
// WATER LEVEL THRESHOLDS
// ============================================

const float CRITICAL_THRESHOLD = 7.0;
const float WARNING_THRESHOLD = 4.0;

const float HYSTERESIS = 0.3;

// ============================================
// SENSOR FILTERING
// ============================================

const int NUM_SAMPLES = 5;
const int MIN_VALID_SAMPLES = 3;

// ============================================
// DATA TRANSMISSION
// ============================================

const unsigned long SEND_INTERVAL = 10000;
const unsigned long WIFI_RETRY_INTERVAL = 10000;

unsigned long lastSendTime = 0;
unsigned long lastWiFiAttempt = 0;

// ============================================
// WATER STATUS
// ============================================

enum WaterStatus {
  CRITICAL,
  WARNING,
  SAFE,
  SENSOR_ERROR
};

WaterStatus currentStatus = SENSOR_ERROR;

// ============================================
// HTTPS CLIENT
// ============================================

WiFiClientSecure secureClient;

// ============================================
// MEASURE DISTANCE
// ============================================

float measureDistance() {

  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);

  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration =
      pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration == 0) {
    return -1;
  }

  float distance = duration * 0.0343 / 2.0;

  if (distance < 2.0 || distance > 50.0) {
    return -1;
  }

  return distance;
}

// ============================================
// MEDIAN FILTER
// ============================================

float getMedianDistance() {

  float readings[NUM_SAMPLES];
  int validCount = 0;

  for (int i = 0; i < NUM_SAMPLES; i++) {

    float distance = measureDistance();

    if (distance > 0) {
      readings[validCount++] = distance;
    }

    delay(70);
  }

  if (validCount < MIN_VALID_SAMPLES) {
    return -1;
  }

  for (int i = 0; i < validCount - 1; i++) {

    for (int j = i + 1; j < validCount; j++) {

      if (readings[j] < readings[i]) {

        float temp = readings[i];
        readings[i] = readings[j];
        readings[j] = temp;
      }
    }
  }

  if (validCount % 2 == 1) {
    return readings[validCount / 2];
  }

  return (
    readings[validCount / 2 - 1] +
    readings[validCount / 2]
  ) / 2.0;
}

// ============================================
// UPDATE WATER STATUS
// ============================================

void updateWaterStatus(float distance) {

  if (currentStatus == SENSOR_ERROR) {

    if (distance >= CRITICAL_THRESHOLD) {
      currentStatus = CRITICAL;
    }

    else if (distance >= WARNING_THRESHOLD) {
      currentStatus = WARNING;
    }

    else {
      currentStatus = SAFE;
    }

    return;
  }

  switch (currentStatus) {

    case CRITICAL:

      if (distance < CRITICAL_THRESHOLD - HYSTERESIS) {

        if (distance < WARNING_THRESHOLD - HYSTERESIS) {
          currentStatus = SAFE;
        }

        else {
          currentStatus = WARNING;
        }
      }

      break;

    case WARNING:

      if (distance >= CRITICAL_THRESHOLD + HYSTERESIS) {
        currentStatus = CRITICAL;
      }

      else if (distance < WARNING_THRESHOLD - HYSTERESIS) {
        currentStatus = SAFE;
      }

      break;

    case SAFE:

      if (distance >= WARNING_THRESHOLD + HYSTERESIS) {

        if (distance >= CRITICAL_THRESHOLD + HYSTERESIS) {
          currentStatus = CRITICAL;
        }

        else {
          currentStatus = WARNING;
        }
      }

      break;

    default:
      currentStatus = SENSOR_ERROR;
      break;
  }
}

// ============================================
// CONTROL LEDs
// ============================================

void updateLEDs() {

  digitalWrite(RED_LED, LOW);
  digitalWrite(YELLOW_LED, LOW);
  digitalWrite(GREEN_LED, LOW);

  switch (currentStatus) {

    case CRITICAL:
      digitalWrite(RED_LED, HIGH);
      break;

    case WARNING:
      digitalWrite(YELLOW_LED, HIGH);
      break;

    case SAFE:
      digitalWrite(GREEN_LED, HIGH);
      break;

    case SENSOR_ERROR:
      break;
  }
}

// ============================================
// STATUS TO DATABASE TEXT
// ============================================

const char* getStatusText() {

  switch (currentStatus) {

    case CRITICAL:
      return "CRITICAL";

    case WARNING:
      return "LOW";

    case SAFE:
      return "NORMAL";

    default:
      return "SENSOR_ERROR";
  }
}

// ============================================
// CONNECT TO WI-FI
// ============================================

void connectWiFi() {

  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.println();
  Serial.println("Connecting to Wi-Fi...");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startTime = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - startTime < 10000
  ) {

    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {

    Serial.println();
    Serial.println("Wi-Fi connected!");

    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

  } else {

    Serial.println();
    Serial.println("Wi-Fi connection failed.");
  }
}

// ============================================
// GENERATE JSON
// ============================================

String generateJSON(
  float distance,
  float waterDepth,
  float waterPercentage
) {

  String json = "{";

  json += "\"tank_id\":\"";
  json += TANK_ID;
  json += "\",";

  json += "\"distance_cm\":";
  json += String(distance, 2);
  json += ",";

  json += "\"water_depth_cm\":";
  json += String(waterDepth, 2);
  json += ",";

  json += "\"water_level_percent\":";
  json += String(waterPercentage, 1);
  json += ",";

  json += "\"status\":\"";
  json += getStatusText();
  json += "\"";

  json += "}";

  return json;
}

// ============================================
// SEND DATA TO SUPABASE
// ============================================

void sendToSupabase(String jsonData) {

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("Cannot send: Wi-Fi disconnected.");
    return;
  }

  HTTPClient http;

  if (!http.begin(secureClient, SUPABASE_URL)) {

    Serial.println("HTTP initialization failed.");
    return;
  }

  http.setTimeout(10000);

  http.addHeader(
    "Content-Type",
    "application/json"
  );

  http.addHeader(
    "X-Device-Key",
    DEVICE_API_KEY
  );

  Serial.println();
  Serial.println("Sending JSON to Supabase:");
  Serial.println(jsonData);

  int responseCode = http.POST(jsonData);

  Serial.print("HTTP Response Code: ");
  Serial.println(responseCode);

  if (responseCode > 0) {

    Serial.println("Server Response:");
    Serial.println(http.getString());

    if (responseCode >= 200 && responseCode < 300) {
      Serial.println("Data sent successfully!");
    }

  } else {

    Serial.print("HTTP Error: ");
    Serial.println(http.errorToString(responseCode));
  }

  http.end();
}

// ============================================
// SETUP
// ============================================

void setup() {

  Serial.begin(115200);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  pinMode(RED_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);

  digitalWrite(TRIG_PIN, LOW);

  updateLEDs();

  WiFi.mode(WIFI_STA);

  connectWiFi();

  // Synchronize ESP32 clock
  if (WiFi.status() == WL_CONNECTED) {

    configTime(
      0,
      0,
      "pool.ntp.org",
      "time.google.com"
    );

    Serial.println("Synchronizing time...");

    struct tm timeinfo;

    if (getLocalTime(&timeinfo, 10000)) {
      Serial.println("Time synchronized!");
    } else {
      Serial.println("Time synchronization failed.");
    }
  }

  // IMPORTANT:
  // HTTPS certificate verification requires
  // a trusted CA certificate.
  //
  // Add secureClient.setCACert(ROOT_CA_CERT)
  // with the appropriate certificate before
  // sending real API credentials.

  Serial.println();
  Serial.println("==============================");
  Serial.println("       MAJISMART ZAMBIA");
  Serial.println(" IoT WATER MONITORING SYSTEM");
  Serial.println("==============================");
}

// ============================================
// MAIN LOOP
// ============================================

void loop() {

  float distance = getMedianDistance();

  if (distance < 0) {

    currentStatus = SENSOR_ERROR;
    updateLEDs();

    Serial.println("ERROR: Invalid sensor readings!");

    delay(1000);
    return;
  }

  // Calculate water depth
  float waterDepth = EMPTY_DISTANCE - distance;

  waterDepth = constrain(
    waterDepth,
    0,
    EMPTY_DISTANCE - FULL_DISTANCE
  );

  // Calculate water percentage
  float waterPercentage =
      ((EMPTY_DISTANCE - distance) /
       (EMPTY_DISTANCE - FULL_DISTANCE)) * 100.0;

  waterPercentage =
      constrain(waterPercentage, 0, 100);

  updateWaterStatus(distance);
  updateLEDs();

  Serial.println();
  Serial.println("------------------------------");

  Serial.print("Distance: ");
  Serial.print(distance, 2);
  Serial.println(" cm");

  Serial.print("Water Depth: ");
  Serial.print(waterDepth, 2);
  Serial.println(" cm");

  Serial.print("Water Level: ");
  Serial.print(waterPercentage, 1);
  Serial.println("%");

  Serial.print("Status: ");
  Serial.println(getStatusText());

  // Generate JSON
  String jsonData = generateJSON(
    distance,
    waterDepth,
    waterPercentage
  );

  // Send every 10 seconds
  if (millis() - lastSendTime >= SEND_INTERVAL) {

    lastSendTime = millis();

    if (WiFi.status() != WL_CONNECTED) {
      connectWiFi();
    }

    sendToSupabase(jsonData);
  }

  delay(1000);
}