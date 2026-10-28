# MajiSmart Zambia — ESP32 Ultrasonic Water Level Monitor

## Hardware Architecture & Overview

This firmware is developed for the **MajiSmart Zambia** IoT climate resilience and water infrastructure platform. It uses an ESP32 microcontroller with an ultrasonic distance sensor (HC-SR04 or waterproof JSN-SR04T) and three diagnostic status LEDs to provide both local visual feedback and cloud/edge telemetry.

### Telemetry Contract (Matching Backend Standard)

Each measurement is transmitted over Wi-Fi as an HTTP POST request to `/api/iot/readings` with the payload matching the photo specification:

```json
{
  "device_id": "ESP32_001",
  "tank_id": "TANK_001",
  "distance_cm": 15.5,
  "water_depth_cm": 34.5,
  "water_level_percent": 69,
  "status": "NORMAL"
}
```

---

## 1. Hardware Bill of Materials (BOM)

| Component | Quantity | Purpose |
| :--- | :--- | :--- |
| **ESP32 DevKit V1** (30 or 38 pin) | 1 | Microcontroller with Wi-Fi/Bluetooth |
| **Ultrasonic Sensor** (HC-SR04 or JSN-SR04T) | 1 | Non-contact water surface distance measurement |
| **Green LED** (5mm) | 1 | Normal water level status indicator |
| **Yellow LED** (5mm) | 1 | Low water warning status indicator |
| **Red LED** (5mm) | 1 | Critical water alert status indicator |
| **Current Limiting Resistors** (220Ω - 330Ω) | 3 | Protection resistors for LEDs |
| **Voltage Divider Resistors** (1kΩ + 2kΩ) | 1 set | Converts 5V ECHO output of HC-SR04 to safe 3.3V for ESP32 |
| **5V / 2A Micro-USB / DC Power Supply** | 1 | Stable power source for field deployment |

---

## 2. Wiring & Pinout Guide

```
ESP32 Pin           Connected Component
-------------------------------------------------------------
GPIO 5  (Output) -> TRIG pin on Ultrasonic Sensor
GPIO 18 (Input)  <- ECHO pin on Ultrasonic Sensor (via 1k/2k voltage divider)
GPIO 2  (Output) -> Green LED Anode (through 220Ω resistor) -> Cathode to GND
GPIO 4  (Output) -> Yellow LED Anode (through 220Ω resistor) -> Cathode to GND
GPIO 15 (Output) -> Red LED Anode (through 220Ω resistor) -> Cathode to GND
VIN (5V)         -> VCC pin on Ultrasonic Sensor
GND              -> Common Ground for Sensor & LEDs
```

> **Important Electrical Note**: The HC-SR04 ECHO pin produces a 5V logic signal. Because ESP32 GPIO pins are rated for 3.3V, use a simple two-resistor voltage divider (1kΩ and 2kΩ) on the ECHO line to step down 5V to ~3.3V to prevent pin degradation.

---

## 3. Water Level Calculation & Calibration

The firmware computes water depth and percentage using calibrated physical dimensions:

$$\text{Water Depth (cm)} = \text{Tank Total Height} - \text{Measured Distance} - \text{Sensor Offset}$$

$$\text{Water Level (\%)} = \left(\frac{\text{Water Depth}}{\text{Usable Tank Height}}\right) \times 100$$

### Threshold Boundaries
- **NORMAL (Green LED)**: Water level > 25%
- **LOW (Yellow LED)**: 15% < Water level $\le$ 25%
- **CRITICAL (Red LED)**: Water level $\le$ 15%

---

## 4. Software Setup & Flashing

1. Open **Arduino IDE** (or VS Code with PlatformIO).
2. Go to **File → Preferences** and add the ESP32 board manager URL:
   `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
3. Install the **esp32** board package from the Boards Manager.
4. Install required libraries from Library Manager:
   - `ArduinoJson` (v6 or v7)
5. Open `maji_smart_esp32.ino`.
6. Update Wi-Fi SSID, Wi-Fi password, and backend server IP address.
7. Select **ESP32 Dev Module**, select your COM port, and click **Upload**.

---

## 5. Software Simulator

For development when physical ESP32 hardware is not connected, use the integrated Node.js simulator:

```bash
# Send exact reading from photo
node FIRMWARE/simulator/iot_simulator.js --mode=once

# Stream realistic dynamic filling/draining
node FIRMWARE/simulator/iot_simulator.js --mode=stream

# Trigger critical water alert
node FIRMWARE/simulator/iot_simulator.js --mode=critical

# Trigger refill recovery
node FIRMWARE/simulator/iot_simulator.js --mode=recover
```
