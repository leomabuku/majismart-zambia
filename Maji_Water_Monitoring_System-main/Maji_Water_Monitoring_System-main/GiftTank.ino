// ============================================
// MAJISMART ZAMBIA
// SMART WATER MONITORING SYSTEM
//
// ESP32 + HC-SR04 + LEDs
// Median Filtering + Hysteresis
// ============================================

#define TRIG_PIN 18
#define ECHO_PIN 19

#define RED_LED 21
#define YELLOW_LED 22
#define GREEN_LED 23

// Tank calibration
const float EMPTY_DISTANCE = 10.24;
const float FULL_DISTANCE = 2.0;

// Water-level thresholds
const float CRITICAL_THRESHOLD = 7.0;
const float WARNING_THRESHOLD = 4.0;

// Hysteresis margin
const float HYSTERESIS = 0.3;

// Number of samples for median filtering
const int NUM_SAMPLES = 5;

// Water status
enum WaterStatus {
  CRITICAL,
  WARNING,
  SAFE,
  SENSOR_ERROR
};

// Current system status
WaterStatus currentStatus = SENSOR_ERROR;


// ============================================
// FUNCTION: Measure Distance
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

  float distance =
      duration * 0.0343 / 2.0;

  return distance;
}


// ============================================
// FUNCTION: Median Filter
// ============================================

float getMedianDistance() {

  float readings[NUM_SAMPLES];
  int validCount = 0;

  // Collect sensor readings
  for (int i = 0; i < NUM_SAMPLES; i++) {

    float distance = measureDistance();

    if (distance > 0) {

      readings[validCount] = distance;
      validCount++;
    }

    delay(70);
  }

  // Reject measurement if no valid readings
  if (validCount == 0) {
    return -1;
  }

  // Sort readings in ascending order
  for (int i = 0; i < validCount - 1; i++) {

    for (int j = i + 1; j < validCount; j++) {

      if (readings[j] < readings[i]) {

        float temp = readings[i];
        readings[i] = readings[j];
        readings[j] = temp;
      }
    }
  }

  // Return median
  if (validCount % 2 == 1) {

    return readings[validCount / 2];

  } else {

    return (
      readings[validCount / 2 - 1] +
      readings[validCount / 2]
    ) / 2.0;
  }
}


// ============================================
// FUNCTION: Update Status With Hysteresis
// ============================================

void updateWaterStatus(float distance) {

  if (currentStatus == SENSOR_ERROR) {

    // Initial status
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

      // Leave CRITICAL only when water rises
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

      // Change to CRITICAL
      if (distance >= CRITICAL_THRESHOLD + HYSTERESIS) {

        currentStatus = CRITICAL;
      }

      // Change to SAFE
      else if (distance < WARNING_THRESHOLD - HYSTERESIS) {

        currentStatus = SAFE;
      }

      break;

    case SAFE:

      // Leave SAFE when water decreases
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
// FUNCTION: Update LEDs
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
      // All LEDs off
      break;
  }
}


// ============================================
// FUNCTION: Convert Status to Text
// ============================================

const char* getStatusText() {

  switch (currentStatus) {

    case CRITICAL:
      return "CRITICAL";

    case WARNING:
      return "WARNING";

    case SAFE:
      return "SAFE";

    default:
      return "SENSOR ERROR";
  }
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

  Serial.println();
  Serial.println("================================");
  Serial.println("        MAJISMART ZAMBIA");
  Serial.println(" SMART WATER MONITORING SYSTEM");
  Serial.println("================================");

  Serial.println("Median Filtering: ENABLED");
  Serial.println("Hysteresis: ENABLED");

  delay(1000);
}


// ============================================
// MAIN LOOP
// ============================================

void loop() {

  // Step 1: Obtain filtered distance
  float distance = getMedianDistance();

  // Step 2: Handle sensor failure
  if (distance < 0) {

    currentStatus = SENSOR_ERROR;

    updateLEDs();

    Serial.println();
    Serial.println("ERROR: Sensor measurement failed!");

    delay(1000);
    return;
  }

  // Step 3: Calculate water percentage
  float waterPercentage =
      ((EMPTY_DISTANCE - distance) /
       (EMPTY_DISTANCE - FULL_DISTANCE)) * 100.0;

  waterPercentage =
      constrain(waterPercentage, 0, 100);

  // Step 4: Update status
  updateWaterStatus(distance);

  // Step 5: Update LEDs
  updateLEDs();

  // Step 6: Display results
  Serial.println();
  Serial.println("--------------------------------");

  Serial.print("Filtered Distance: ");
  Serial.print(distance, 2);
  Serial.println(" cm");

  Serial.print("Water Level: ");
  Serial.print(waterPercentage, 1);
  Serial.println("%");

  Serial.print("Water Status: ");
  Serial.println(getStatusText());

  Serial.print("Active LED: ");

  switch (currentStatus) {

    case CRITICAL:
      Serial.println("RED");
      break;

    case WARNING:
      Serial.println("YELLOW");
      break;

    case SAFE:
      Serial.println("GREEN");
      break;

    default:
      Serial.println("NONE");
      break;
  }

  delay(1000);
}