import type { ProjectConfiguration, ProjectTypeTemplate, SensorTemplate, AlertRuleTemplate } from "./types";

export const TEMPLATE_VERSION = 1;

// Shared building blocks ------------------------------------------------------------

const battery = (start = 100, perHour = 0.4): SensorTemplate => ({
  key: "battery",
  name: "Battery level",
  measurement: "battery",
  minValue: 0,
  maxValue: 100,
  simulation: { mode: "drain", start, perHour, min: 5, abnormal: 8 },
});

const rssi: SensorTemplate = {
  key: "rssi",
  name: "Signal strength",
  measurement: "rssi",
  minValue: -120,
  maxValue: 0,
  simulation: { mode: "walk", start: -62, step: 2, min: -90, max: -40, abnormal: -105 },
};

const ambientTemp = (base = 24, amplitude = 4): SensorTemplate => ({
  key: "temperature",
  name: "Ambient temperature",
  measurement: "temperature",
  minValue: -40,
  maxValue: 85,
  simulation: { mode: "wave", base, amplitude, noise: 0.4, periodMinutes: 1440, abnormal: base + 25 },
});

const ambientHumidity = (base = 55): SensorTemplate => ({
  key: "humidity",
  name: "Relative humidity",
  measurement: "humidity",
  minValue: 0,
  maxValue: 100,
  simulation: { mode: "wave", base, amplitude: 10, noise: 1.5, periodMinutes: 1440, min: 0, max: 100, abnormal: 12 },
});

const batteryLowRule: AlertRuleTemplate = {
  name: "Battery low",
  conditionType: "BATTERY_LOW",
  sensorType: "battery",
  threshold: { value: 15 },
  severity: "LOW",
  cooldownSeconds: 3600,
  autoResolve: true,
};

const offlineRule: AlertRuleTemplate = {
  name: "Device offline",
  conditionType: "DEVICE_OFFLINE",
  threshold: {},
  severity: "MEDIUM",
  cooldownSeconds: 600,
  autoResolve: true,
};

const HEALTH_NOTICE =
  "Academic monitoring demonstration only. Readings and alerts are informational system events and are not a medical device, a diagnosis, or a substitute for professional medical assessment.";
const SAFETY_NOTICE =
  "Alerts are informational system events and are not a substitute for certified safety or emergency-response equipment.";

// Catalog -------------------------------------------------------------------------

export const PROJECT_TYPES: ProjectTypeTemplate[] = [
  // ── Category A: Smart Home and Energy ──
  {
    key: "smart-home-energy-management",
    name: "AI-Powered Smart Home Energy Management System",
    category: "SMART_HOME_ENERGY",
    description:
      "Monitors household power, energy, voltage and current per circuit with occupancy and temperature context. The platform provides rule-based load analytics (peak detection and usage-while-vacant rules); no machine-learning model is bundled, so no AI claim is made until one is integrated.",
    isSensitive: false,
    analyticsLabel: "Rule-based",
    analyticsNote:
      "Energy insights are rule-based (threshold, peak and vacancy rules). An AI model can be integrated later; until then nothing is labelled AI-powered.",
    deviceRequirements: ["ESP32 with PZEM-004T or SCT-013 current transformer", "PIR occupancy sensor", "DHT22 or BME280 temperature sensor"],
    sensors: [
      { key: "power", name: "Active power", measurement: "power", minValue: 0, maxValue: 20000, simulation: { mode: "wave", base: 900, amplitude: 600, noise: 80, periodMinutes: 720, min: 0, abnormal: 6200 } },
      { key: "energy", name: "Energy meter (cumulative)", measurement: "energy", minValue: 0, description: "Cumulative kWh meter register; consumption is the difference between readings.", simulation: { mode: "counter", start: 1250, ratePerHour: 0.9, abnormalRatePerHour: 6 } },
      { key: "voltage", name: "Mains voltage", measurement: "voltage", minValue: 0, maxValue: 300, simulation: { mode: "wave", base: 230, amplitude: 4, noise: 1, periodMinutes: 240, abnormal: 262 } },
      { key: "current", name: "Load current", measurement: "current", minValue: 0, maxValue: 100, simulation: { mode: "wave", base: 4, amplitude: 2.5, noise: 0.3, periodMinutes: 720, min: 0, abnormal: 27 } },
      { key: "occupancy", name: "Room occupancy", measurement: "occupancy", simulation: { mode: "state", states: [0, 1], weights: [0.4, 0.6], abnormal: 0 } },
      ambientTemp(25, 3),
    ],
    widgets: [
      { id: "power-kpi", type: "kpi", title: "Current load", sensorKeys: ["power"] },
      { id: "energy-kpi", type: "kpi", title: "Meter reading", sensorKeys: ["energy"] },
      { id: "power-line", type: "line", title: "Active power", sensorKeys: ["power"] },
      { id: "voltage-line", type: "line", title: "Mains voltage", sensorKeys: ["voltage"] },
      { id: "current-line", type: "line", title: "Load current", sensorKeys: ["current"] },
      { id: "occupancy-state", type: "state", title: "Occupancy", sensorKeys: ["occupancy"] },
    ],
    alertRules: [
      { name: "Overload: power above limit", conditionType: "THRESHOLD_ABOVE", sensorType: "power", threshold: { value: 5000 }, severity: "HIGH", consecutiveCount: 2 },
      { name: "Over-voltage", conditionType: "THRESHOLD_ABOVE", sensorType: "voltage", threshold: { value: 253 }, severity: "MEDIUM", consecutiveCount: 2 },
      { name: "Under-voltage", conditionType: "THRESHOLD_BELOW", sensorType: "voltage", threshold: { value: 207 }, severity: "MEDIUM", consecutiveCount: 2 },
      offlineRule,
    ],
    reports: ["project-overview", "energy-consumption", "telemetry-history", "alert-history", "device-availability"],
    configSchema: [
      { key: "tariffPerKwh", label: "Electricity tariff", type: "number", default: 0.15, unit: "per kWh", min: 0 },
      { key: "currency", label: "Currency code", type: "string", default: "USD" },
      { key: "peakLoadW", label: "Peak load limit", type: "number", default: 5000, unit: "W", min: 0 },
    ],
  },
  {
    key: "home-electricity-monitoring",
    name: "Smart Home Electricity Consumption Monitoring",
    category: "SMART_HOME_ENERGY",
    description: "Tracks whole-home electricity consumption from a smart meter or CT clamp, with daily and monthly energy totals derived from the cumulative kWh register.",
    isSensitive: false,
    analyticsLabel: "Statistical analysis",
    analyticsNote: "Consumption totals are computed from cumulative kWh meter deltas; instantaneous power is never summed as energy.",
    deviceRequirements: ["ESP32 or ESP8266", "PZEM-004T v3 energy meter module"],
    sensors: [
      { key: "power", name: "Active power", measurement: "power", minValue: 0, maxValue: 20000, simulation: { mode: "wave", base: 650, amplitude: 450, noise: 60, periodMinutes: 1440, min: 0, abnormal: 7000 } },
      { key: "energy", name: "Energy meter (cumulative)", measurement: "energy", minValue: 0, simulation: { mode: "counter", start: 8400, ratePerHour: 0.65, abnormalRatePerHour: 7 } },
      { key: "voltage", name: "Mains voltage", measurement: "voltage", minValue: 0, maxValue: 300, simulation: { mode: "wave", base: 230, amplitude: 3, noise: 1, periodMinutes: 300, abnormal: 195 } },
      { key: "current", name: "Load current", measurement: "current", minValue: 0, maxValue: 100, simulation: { mode: "wave", base: 2.8, amplitude: 2, noise: 0.2, periodMinutes: 1440, min: 0, abnormal: 30 } },
    ],
    widgets: [
      { id: "power-kpi", type: "kpi", title: "Current load", sensorKeys: ["power"] },
      { id: "energy-kpi", type: "kpi", title: "Meter reading", sensorKeys: ["energy"] },
      { id: "power-line", type: "line", title: "Active power", sensorKeys: ["power"] },
      { id: "voltage-line", type: "line", title: "Voltage", sensorKeys: ["voltage"] },
    ],
    alertRules: [
      { name: "High consumption", conditionType: "THRESHOLD_ABOVE", sensorType: "power", threshold: { value: 5500 }, severity: "MEDIUM", consecutiveCount: 3 },
      { name: "Voltage out of range", conditionType: "OUTSIDE_RANGE", sensorType: "voltage", threshold: { min: 207, max: 253 }, severity: "HIGH", consecutiveCount: 2 },
      offlineRule,
    ],
    reports: ["project-overview", "energy-consumption", "telemetry-history", "device-availability"],
    configSchema: [
      { key: "tariffPerKwh", label: "Electricity tariff", type: "number", default: 0.15, unit: "per kWh", min: 0 },
      { key: "currency", label: "Currency code", type: "string", default: "USD" },
      { key: "monthlyBudgetKwh", label: "Monthly budget", type: "number", default: 400, unit: "kWh", min: 0 },
    ],
  },
  {
    key: "connected-glucose-monitoring",
    name: "Connected Glucose Monitoring System with Cloud-Based Reporting",
    category: "SMART_HOME_ENERGY",
    description: "Collects glucose readings from a connected glucometer or CGM bridge and reports trends in mg/dL (mmol/L readings are converted using 1 mmol/L = 18.0182 mg/dL).",
    isSensitive: true,
    analyticsLabel: "Threshold monitoring",
    analyticsNote: "Trend summaries and configurable thresholds only. No diagnosis or dosing advice is generated.",
    deviceRequirements: ["BLE glucometer or CGM with an ESP32 gateway", "Gateway forwards readings over HTTP or MQTT"],
    safetyNotice: HEALTH_NOTICE,
    sensors: [
      { key: "glucose", name: "Blood glucose", measurement: "glucose", minValue: 20, maxValue: 600, simulation: { mode: "wave", base: 115, amplitude: 25, noise: 6, periodMinutes: 360, min: 40, abnormal: 290 } },
      battery(100, 0.2),
    ],
    widgets: [
      { id: "glucose-kpi", type: "kpi", title: "Latest glucose", sensorKeys: ["glucose"] },
      { id: "glucose-line", type: "line", title: "Glucose trend", sensorKeys: ["glucose"] },
      { id: "battery-kpi", type: "kpi", title: "Gateway battery", sensorKeys: ["battery"] },
    ],
    alertRules: [
      { name: "Glucose above configured range", conditionType: "THRESHOLD_ABOVE", sensorType: "glucose", threshold: { value: 250 }, severity: "HIGH" },
      { name: "Glucose below configured range", conditionType: "THRESHOLD_BELOW", sensorType: "glucose", threshold: { value: 70 }, severity: "CRITICAL" },
      batteryLowRule,
      { ...offlineRule, severity: "HIGH" },
    ],
    reports: ["project-overview", "health-telemetry", "alert-history"],
    configSchema: [
      { key: "displayUnit", label: "Display unit", type: "select", default: "mg/dL", options: ["mg/dL", "mmol/L"] },
      { key: "retentionDays", label: "Reading retention", type: "number", default: 90, unit: "days", min: 1, max: 3650 },
    ],
  },
  {
    key: "smart-posture-corrector",
    name: "Smart Posture Corrector Using Inertial Measurement Units (IMU)",
    category: "SMART_HOME_ENERGY",
    description: "A wearable IMU (e.g. MPU-6050) measures acceleration, angular velocity and tilt. Posture is classified on-device by a documented tilt-angle threshold rule.",
    isSensitive: true,
    analyticsLabel: "Rule-based",
    analyticsNote: "Posture classification uses a tilt-angle threshold (configurable). It is not a machine-learning model.",
    deviceRequirements: ["ESP32 with MPU-6050 or MPU-9250 IMU", "Vibration motor for haptic feedback (optional)"],
    sensors: [
      { key: "acceleration", name: "Acceleration magnitude", measurement: "acceleration", simulation: { mode: "wave", base: 9.81, amplitude: 0.3, noise: 0.15, periodMinutes: 30, abnormal: 14 } },
      { key: "angular_velocity", name: "Angular velocity", measurement: "angular_velocity", simulation: { mode: "wave", base: 5, amplitude: 4, noise: 2, periodMinutes: 20, min: 0, abnormal: 120 } },
      { key: "tilt", name: "Forward tilt angle", measurement: "tilt_angle", minValue: -90, maxValue: 90, simulation: { mode: "wave", base: 12, amplitude: 8, noise: 2, periodMinutes: 60, abnormal: 42 } },
      { key: "posture", name: "Posture classification", measurement: "posture_state", origin: "CALCULATED", simulation: { mode: "state", states: [0, 1, 2], weights: [0.7, 0.2, 0.1], abnormal: 1 } },
      { key: "poor_posture_duration", name: "Poor-posture duration", measurement: "posture_event_duration", origin: "CALCULATED", minValue: 0, simulation: { mode: "walk", start: 30, step: 20, min: 0, max: 600, abnormal: 1500 } },
      battery(100, 1.2),
    ],
    widgets: [
      { id: "posture-state", type: "state", title: "Current posture", sensorKeys: ["posture"] },
      { id: "tilt-line", type: "line", title: "Tilt angle", sensorKeys: ["tilt"] },
      { id: "duration-kpi", type: "kpi", title: "Poor-posture duration", sensorKeys: ["poor_posture_duration"] },
      { id: "accel-line", type: "line", title: "Acceleration", sensorKeys: ["acceleration"] },
    ],
    alertRules: [
      { name: "Sustained forward tilt", conditionType: "THRESHOLD_ABOVE", sensorType: "tilt_angle", threshold: { value: 30 }, severity: "LOW", consecutiveCount: 3, cooldownSeconds: 900 },
      { name: "Poor posture for over 20 minutes", conditionType: "THRESHOLD_ABOVE", sensorType: "posture_event_duration", threshold: { value: 1200 }, severity: "MEDIUM" },
      batteryLowRule,
    ],
    reports: ["project-overview", "health-telemetry", "sensor-statistics"],
    configSchema: [{ key: "slouchAngleDeg", label: "Slouch threshold angle", type: "number", default: 30, unit: "°", min: 5, max: 80 }],
  },

  // ── Category B: Waste Management ──
  {
    key: "automated-waste-segregation",
    name: "IoT-Based Automated Waste Segregation and Management System",
    category: "WASTE_MANAGEMENT",
    description: "Smart bins report fill level (ultrasonic distance), weight (load cell), and the waste class produced by an explicitly identified classifier (inductive/capacitive/moisture sensor rules or an external vision model).",
    isSensitive: false,
    analyticsLabel: "Rule-based",
    analyticsNote: "Waste class comes from the bin's own classifier sensor. The platform stores and reports it but does not classify waste itself.",
    deviceRequirements: ["ESP32", "HC-SR04 ultrasonic sensor", "HX711 load cell amplifier", "Inductive, capacitive and moisture sensors or an external classifier"],
    sensors: [
      { key: "fill_level", name: "Bin fill level", measurement: "fill_level", minValue: 0, maxValue: 100, simulation: { mode: "walk", start: 20, step: 3, min: 0, max: 100, abnormal: 96 } },
      { key: "weight", name: "Bin weight", measurement: "weight", minValue: 0, maxValue: 200, simulation: { mode: "walk", start: 4, step: 0.8, min: 0, max: 60, abnormal: 85 } },
      { key: "distance", name: "Lid-to-waste distance", measurement: "distance", minValue: 0, maxValue: 400, simulation: { mode: "walk", start: 80, step: 3, min: 2, max: 100, abnormal: 3 } },
      { key: "waste_class", name: "Last item classification", measurement: "waste_class", description: "Produced by the bin's classifier sensor array.", simulation: { mode: "state", states: [1, 2, 3, 4, 5], weights: [0.35, 0.3, 0.1, 0.15, 0.1], abnormal: 0 } },
      { key: "collection_status", name: "Collection status", measurement: "collection_status", simulation: { mode: "state", states: [0, 1, 2], weights: [0.7, 0.2, 0.1], abnormal: 1 } },
      battery(100, 0.15),
    ],
    widgets: [
      { id: "fill-kpi", type: "kpi", title: "Fill level", sensorKeys: ["fill_level"] },
      { id: "fill-line", type: "line", title: "Fill level", sensorKeys: ["fill_level"] },
      { id: "weight-line", type: "line", title: "Weight", sensorKeys: ["weight"] },
      { id: "class-state", type: "state", title: "Last classification", sensorKeys: ["waste_class"] },
      { id: "collection-state", type: "state", title: "Collection status", sensorKeys: ["collection_status"] },
    ],
    alertRules: [
      { name: "Bin nearly full", conditionType: "THRESHOLD_ABOVE", sensorType: "fill_level", threshold: { value: 85 }, severity: "MEDIUM", autoResolve: true },
      { name: "Bin overweight", conditionType: "THRESHOLD_ABOVE", sensorType: "weight", threshold: { value: 70 }, severity: "HIGH" },
      batteryLowRule,
      offlineRule,
    ],
    reports: ["project-overview", "device-inventory", "telemetry-history", "alert-frequency"],
    configSchema: [
      { key: "binHeightCm", label: "Bin height", type: "number", default: 100, unit: "cm", min: 10 },
      { key: "collectionThresholdPct", label: "Collection threshold", type: "number", default: 85, unit: "%", min: 10, max: 100 },
    ],
  },

  // ── Category C: Agriculture ──
  {
    key: "indoor-plant-irrigation",
    name: "Automated Indoor Plant Irrigation with Soil Moisture Analysis",
    category: "AGRICULTURE",
    description: "Capacitive soil-moisture probes drive a pump relay. Tank level and flow confirm water delivery.",
    isSensitive: false,
    analyticsLabel: "Rule-based",
    analyticsNote: "Irrigation is triggered on-device when moisture falls below the configured threshold.",
    deviceRequirements: ["ESP32", "Capacitive soil moisture sensor v1.2", "5 V relay and mini pump", "YF-S201 flow sensor", "Ultrasonic tank level sensor"],
    sensors: [
      { key: "soil_moisture", name: "Soil moisture", measurement: "soil_moisture", minValue: 0, maxValue: 100, simulation: { mode: "walk", start: 45, step: 1.5, min: 15, max: 80, abnormal: 9 } },
      ambientTemp(23, 3),
      ambientHumidity(50),
      { key: "tank_level", name: "Water tank level", measurement: "tank_level", minValue: 0, maxValue: 100, simulation: { mode: "drain", start: 95, perHour: 1.2, min: 5, abnormal: 6 } },
      { key: "water_flow", name: "Water flow", measurement: "water_flow", minValue: 0, maxValue: 30, simulation: { mode: "wave", base: 0.6, amplitude: 0.6, noise: 0.1, periodMinutes: 180, min: 0, abnormal: 0 } },
      { key: "pump_state", name: "Pump", measurement: "pump_state", simulation: { mode: "state", states: [0, 1], weights: [0.8, 0.2], abnormal: 1 } },
    ],
    widgets: [
      { id: "moisture-kpi", type: "kpi", title: "Soil moisture", sensorKeys: ["soil_moisture"] },
      { id: "moisture-line", type: "line", title: "Soil moisture", sensorKeys: ["soil_moisture"] },
      { id: "tank-kpi", type: "kpi", title: "Tank level", sensorKeys: ["tank_level"] },
      { id: "pump-state", type: "state", title: "Pump", sensorKeys: ["pump_state"] },
      { id: "temp-line", type: "line", title: "Temperature", sensorKeys: ["temperature"] },
    ],
    alertRules: [
      { name: "Soil too dry", conditionType: "THRESHOLD_BELOW", sensorType: "soil_moisture", threshold: { value: 20 }, severity: "MEDIUM", consecutiveCount: 2, autoResolve: true },
      { name: "Water tank low", conditionType: "THRESHOLD_BELOW", sensorType: "tank_level", threshold: { value: 15 }, severity: "HIGH" },
      offlineRule,
    ],
    reports: ["project-overview", "agricultural-measurements", "telemetry-history", "alert-history"],
    configSchema: [
      { key: "moistureTargetPct", label: "Target soil moisture", type: "number", default: 45, unit: "%", min: 0, max: 100 },
      { key: "dryThresholdPct", label: "Dry threshold", type: "number", default: 20, unit: "%", min: 0, max: 100 },
      { key: "maxPumpSeconds", label: "Maximum pump run", type: "number", default: 30, unit: "s", min: 1 },
    ],
  },
  {
    key: "precision-agriculture",
    name: "Precision Agriculture with Automated Fertilizer and Water Distribution",
    category: "AGRICULTURE",
    description: "Field nodes measure soil moisture, pH, temperature and humidity; a controller schedules water and fertilizer delivery and reports pump and fertilizer status.",
    isSensitive: false,
    analyticsLabel: "Rule-based",
    analyticsNote: "Distribution schedules are rule-based on moisture and pH thresholds.",
    deviceRequirements: ["ESP32 field node (LoRa or Wi-Fi)", "Capacitive soil moisture sensor", "Analog soil pH probe", "DHT22", "Peristaltic fertilizer pump and flow sensor"],
    sensors: [
      { key: "soil_moisture", name: "Soil moisture", measurement: "soil_moisture", minValue: 0, maxValue: 100, simulation: { mode: "walk", start: 38, step: 1.2, min: 12, max: 70, abnormal: 8 } },
      { key: "soil_ph", name: "Soil pH", measurement: "soil_ph", minValue: 0, maxValue: 14, simulation: { mode: "walk", start: 6.5, step: 0.05, min: 5.2, max: 7.8, abnormal: 4.4 } },
      ambientTemp(29, 6),
      ambientHumidity(60),
      { key: "tank_level", name: "Irrigation tank level", measurement: "tank_level", minValue: 0, maxValue: 100, simulation: { mode: "drain", start: 90, perHour: 1.5, min: 5, abnormal: 7 } },
      { key: "water_flow", name: "Irrigation flow", measurement: "water_flow", minValue: 0, maxValue: 200, simulation: { mode: "wave", base: 12, amplitude: 10, noise: 1, periodMinutes: 240, min: 0, abnormal: 0 } },
      { key: "pump_state", name: "Water pump", measurement: "pump_state", simulation: { mode: "state", states: [0, 1], weights: [0.6, 0.4], abnormal: 1 } },
      { key: "fertilizer_status", name: "Fertilizer delivery", measurement: "fertilizer_status", simulation: { mode: "state", states: [0, 1], weights: [0.85, 0.15], abnormal: 2 } },
      battery(100, 0.25),
    ],
    widgets: [
      { id: "moisture-line", type: "line", title: "Soil moisture", sensorKeys: ["soil_moisture"] },
      { id: "ph-line", type: "line", title: "Soil pH", sensorKeys: ["soil_ph"] },
      { id: "flow-line", type: "line", title: "Irrigation flow", sensorKeys: ["water_flow"] },
      { id: "pump-state", type: "state", title: "Water pump", sensorKeys: ["pump_state"] },
      { id: "fert-state", type: "state", title: "Fertilizer delivery", sensorKeys: ["fertilizer_status"] },
      { id: "tank-kpi", type: "kpi", title: "Tank level", sensorKeys: ["tank_level"] },
    ],
    alertRules: [
      { name: "Soil pH out of range", conditionType: "OUTSIDE_RANGE", sensorType: "soil_ph", threshold: { min: 5.5, max: 7.5 }, severity: "MEDIUM", consecutiveCount: 3 },
      { name: "Soil too dry", conditionType: "THRESHOLD_BELOW", sensorType: "soil_moisture", threshold: { value: 18 }, severity: "MEDIUM", consecutiveCount: 2 },
      { name: "Fertilizer delivery fault", conditionType: "STATE_EQUALS", sensorType: "fertilizer_status", threshold: { state: 2 }, severity: "HIGH" },
      batteryLowRule,
      offlineRule,
    ],
    reports: ["project-overview", "agricultural-measurements", "sensor-statistics", "alert-history"],
    configSchema: [
      { key: "cropType", label: "Crop", type: "string", default: "Wheat" },
      { key: "fieldAreaHa", label: "Field area", type: "number", default: 1.5, unit: "ha", min: 0 },
      { key: "targetPh", label: "Target soil pH", type: "number", default: 6.5, min: 0, max: 14 },
    ],
  },

  // ── Category D: Environment and Weather ──
  {
    key: "forest-fire-detection",
    name: "IoT-Based Forest Fire Detection and Early Warning System",
    category: "ENVIRONMENT_WEATHER",
    description: "Solar/battery forest nodes combine temperature, humidity, an MQ-2 smoke sensor (raw ADC level) and optional PM2.5 to raise configurable early warnings.",
    isSensitive: false,
    analyticsLabel: "Threshold monitoring",
    analyticsNote: "Warnings combine per-sensor thresholds; MQ-2 values are uncalibrated raw readings.",
    deviceRequirements: ["ESP32 or LoRa node", "DHT22 / SHT31", "MQ-2 smoke sensor", "PMS5003 (optional)", "Solar panel + Li-ion battery"],
    safetyNotice: SAFETY_NOTICE,
    sensors: [
      ambientTemp(27, 7),
      ambientHumidity(45),
      { key: "smoke", name: "Smoke sensor (MQ-2)", measurement: "smoke_level", minValue: 0, maxValue: 4095, description: "Raw 12-bit ADC value; not a calibrated ppm reading.", simulation: { mode: "walk", start: 320, step: 25, min: 150, max: 700, abnormal: 2900 } },
      { key: "pm25", name: "PM2.5", measurement: "pm25", minValue: 0, maxValue: 1000, simulation: { mode: "walk", start: 14, step: 2, min: 3, max: 45, abnormal: 310 } },
      battery(100, 0.1),
      rssi,
    ],
    widgets: [
      { id: "temp-line", type: "line", title: "Temperature", sensorKeys: ["temperature"] },
      { id: "smoke-line", type: "line", title: "Smoke level (raw)", sensorKeys: ["smoke"] },
      { id: "humidity-line", type: "line", title: "Humidity", sensorKeys: ["humidity"] },
      { id: "battery-kpi", type: "kpi", title: "Node battery", sensorKeys: ["battery"] },
      { id: "rssi-kpi", type: "kpi", title: "Signal", sensorKeys: ["rssi"] },
    ],
    alertRules: [
      { name: "Smoke detected", conditionType: "THRESHOLD_ABOVE", sensorType: "smoke_level", threshold: { value: 1800 }, severity: "CRITICAL", consecutiveCount: 2 },
      { name: "Extreme heat", conditionType: "THRESHOLD_ABOVE", sensorType: "temperature", threshold: { value: 45 }, severity: "HIGH", consecutiveCount: 2 },
      { name: "Very low humidity", conditionType: "THRESHOLD_BELOW", sensorType: "humidity", threshold: { value: 20 }, severity: "MEDIUM", consecutiveCount: 3 },
      batteryLowRule,
      { ...offlineRule, severity: "HIGH" },
    ],
    reports: ["project-overview", "environmental-trends", "alert-history", "device-availability"],
    configSchema: [
      { key: "smokeWarningRaw", label: "Smoke warning level", type: "number", default: 1800, unit: "raw", min: 0, max: 4095 },
      { key: "forestZone", label: "Forest zone", type: "string", default: "Zone A" },
    ],
  },
  {
    key: "urban-air-quality",
    name: "Real-Time Air Quality Monitoring Network for Urban Centers",
    category: "ENVIRONMENT_WEATHER",
    description: "A network of street-level nodes reporting PM2.5, PM10, CO₂, NO₂, temperature and humidity, with node location shown where enabled.",
    isSensitive: false,
    analyticsLabel: "Statistical analysis",
    analyticsNote: "Averages and exceedance counts per node; no AQI forecasting model is bundled.",
    deviceRequirements: ["ESP32", "PMS5003 / SDS011 particulate sensor", "SCD30 / MH-Z19 CO₂ sensor", "MiCS-6814 or electrochemical NO₂ sensor", "BME280"],
    sensors: [
      { key: "pm25", name: "PM2.5", measurement: "pm25", minValue: 0, maxValue: 1000, simulation: { mode: "wave", base: 28, amplitude: 14, noise: 3, periodMinutes: 720, min: 0, abnormal: 180 } },
      { key: "pm10", name: "PM10", measurement: "pm10", minValue: 0, maxValue: 1000, simulation: { mode: "wave", base: 55, amplitude: 22, noise: 5, periodMinutes: 720, min: 0, abnormal: 320 } },
      { key: "co2", name: "CO₂", measurement: "co2", minValue: 300, maxValue: 10000, simulation: { mode: "wave", base: 470, amplitude: 60, noise: 10, periodMinutes: 720, abnormal: 2100 } },
      { key: "no2", name: "NO₂", measurement: "no2", minValue: 0, maxValue: 2000, simulation: { mode: "wave", base: 35, amplitude: 15, noise: 4, periodMinutes: 720, min: 0, abnormal: 210 } },
      ambientTemp(31, 5),
      ambientHumidity(48),
    ],
    widgets: [
      { id: "pm-line", type: "line", title: "Particulate matter (PM2.5 / PM10)", sensorKeys: ["pm25", "pm10"] },
      { id: "co2-line", type: "line", title: "CO₂", sensorKeys: ["co2"] },
      { id: "no2-line", type: "line", title: "NO₂", sensorKeys: ["no2"] },
      { id: "pm25-kpi", type: "kpi", title: "PM2.5 now", sensorKeys: ["pm25"] },
    ],
    alertRules: [
      { name: "PM2.5 unhealthy", conditionType: "THRESHOLD_ABOVE", sensorType: "pm25", threshold: { value: 55.4 }, severity: "HIGH", consecutiveCount: 3 },
      { name: "PM10 unhealthy", conditionType: "THRESHOLD_ABOVE", sensorType: "pm10", threshold: { value: 154 }, severity: "MEDIUM", consecutiveCount: 3 },
      { name: "CO₂ elevated", conditionType: "THRESHOLD_ABOVE", sensorType: "co2", threshold: { value: 1500 }, severity: "MEDIUM", consecutiveCount: 2 },
      offlineRule,
    ],
    reports: ["project-overview", "environmental-trends", "sensor-statistics", "device-availability"],
    configSchema: [
      { key: "city", label: "City", type: "string", default: "Lahore" },
      { key: "showLocations", label: "Show node locations", type: "boolean", default: true },
    ],
  },
  {
    key: "solar-weather-station",
    name: "Solar-Powered IoT Weather Station for Hyperlocal Forecasting",
    category: "ENVIRONMENT_WEATHER",
    description: "A solar-powered station measuring temperature, humidity, pressure, wind speed and direction, rainfall and solar irradiance. Forecasting is limited to documented statistical trends (pressure tendency).",
    isSensitive: false,
    analyticsLabel: "Statistical analysis",
    analyticsNote: "Short-term outlook uses barometric pressure tendency over 3 hours, a standard statistical rule, not an ML forecast.",
    deviceRequirements: ["ESP32", "BME280", "Anemometer and wind vane", "Tipping-bucket rain gauge", "Pyranometer or BH1750 (approximate)", "Solar charge controller"],
    sensors: [
      ambientTemp(26, 6),
      ambientHumidity(58),
      { key: "pressure", name: "Barometric pressure", measurement: "pressure", minValue: 800, maxValue: 1100, simulation: { mode: "walk", start: 1012, step: 0.4, min: 995, max: 1025, abnormal: 982 } },
      { key: "wind_speed", name: "Wind speed", measurement: "wind_speed", minValue: 0, maxValue: 75, simulation: { mode: "walk", start: 3, step: 0.6, min: 0, max: 14, abnormal: 24 } },
      { key: "wind_direction", name: "Wind direction", measurement: "wind_direction", minValue: 0, maxValue: 360, simulation: { mode: "walk", start: 180, step: 12, min: 0, max: 359, abnormal: 270 } },
      { key: "rainfall", name: "Rainfall (per interval)", measurement: "rainfall", minValue: 0, maxValue: 300, simulation: { mode: "wave", base: 0, amplitude: 0.3, noise: 0.1, periodMinutes: 600, min: 0, abnormal: 22 } },
      { key: "solar_irradiance", name: "Solar irradiance", measurement: "solar_irradiance", minValue: 0, maxValue: 1500, simulation: { mode: "wave", base: 380, amplitude: 380, noise: 25, periodMinutes: 1440, min: 0, abnormal: 0 } },
      battery(100, 0.05),
    ],
    widgets: [
      { id: "temp-line", type: "line", title: "Temperature", sensorKeys: ["temperature"] },
      { id: "pressure-line", type: "line", title: "Pressure", sensorKeys: ["pressure"] },
      { id: "wind-line", type: "line", title: "Wind speed", sensorKeys: ["wind_speed"] },
      { id: "rain-bar", type: "bar", title: "Rainfall", sensorKeys: ["rainfall"] },
      { id: "solar-line", type: "line", title: "Solar irradiance", sensorKeys: ["solar_irradiance"] },
      { id: "wind-dir-kpi", type: "kpi", title: "Wind direction", sensorKeys: ["wind_direction"] },
    ],
    alertRules: [
      { name: "High wind", conditionType: "THRESHOLD_ABOVE", sensorType: "wind_speed", threshold: { value: 17 }, severity: "HIGH", consecutiveCount: 2 },
      { name: "Heavy rainfall", conditionType: "THRESHOLD_ABOVE", sensorType: "rainfall", threshold: { value: 10 }, severity: "MEDIUM" },
      { name: "Low pressure", conditionType: "THRESHOLD_BELOW", sensorType: "pressure", threshold: { value: 990 }, severity: "MEDIUM", consecutiveCount: 3 },
      batteryLowRule,
      offlineRule,
    ],
    reports: ["project-overview", "environmental-trends", "sensor-statistics", "telemetry-history"],
    configSchema: [
      { key: "altitudeM", label: "Station altitude", type: "number", default: 215, unit: "m" },
      { key: "rainGaugeMmPerTip", label: "Rain gauge resolution", type: "number", default: 0.2794, unit: "mm/tip", min: 0 },
    ],
  },

  // ── Category E: Healthcare and Wearables ──
  {
    key: "smart-mirror-health-weather",
    name: "Smart Mirror with Integrated Health and Weather Monitoring",
    category: "HEALTHCARE_WEARABLES",
    description: "A Raspberry Pi mirror shows ambient temperature/humidity and optional health readings (heart rate, body temperature). External weather is displayed only when a weather provider is configured and is labelled as external data.",
    isSensitive: true,
    analyticsLabel: "Threshold monitoring",
    analyticsNote: "External weather values are stored with origin EXTERNAL and never mixed with mirror sensor readings.",
    deviceRequirements: ["Raspberry Pi 4 with two-way mirror display", "BME280", "MAX30102 pulse sensor (optional)", "MLX90614 IR thermometer (optional)"],
    safetyNotice: HEALTH_NOTICE,
    sensors: [
      ambientTemp(24, 2),
      ambientHumidity(50),
      { key: "heart_rate", name: "Heart rate", measurement: "heart_rate", minValue: 20, maxValue: 250, simulation: { mode: "wave", base: 74, amplitude: 6, noise: 2, periodMinutes: 120, abnormal: 132 } },
      { key: "body_temperature", name: "Body temperature", measurement: "body_temperature", minValue: 30, maxValue: 45, simulation: { mode: "wave", base: 36.7, amplitude: 0.2, noise: 0.05, periodMinutes: 600, abnormal: 38.9 } },
      { key: "outdoor_temperature", name: "Outdoor temperature (weather provider)", measurement: "temperature", origin: "EXTERNAL", description: "Populated only when a weather provider integration is configured.", simulation: { mode: "wave", base: 29, amplitude: 6, noise: 0.3, periodMinutes: 1440, abnormal: 47 } },
    ],
    widgets: [
      { id: "temp-line", type: "line", title: "Room temperature", sensorKeys: ["temperature"] },
      { id: "hr-kpi", type: "kpi", title: "Heart rate", sensorKeys: ["heart_rate"] },
      { id: "bt-kpi", type: "kpi", title: "Body temperature", sensorKeys: ["body_temperature"] },
      { id: "outdoor-kpi", type: "kpi", title: "Outdoor (external)", sensorKeys: ["outdoor_temperature"] },
    ],
    alertRules: [
      { name: "Elevated heart rate", conditionType: "THRESHOLD_ABOVE", sensorType: "heart_rate", threshold: { value: 120 }, severity: "MEDIUM", consecutiveCount: 2 },
      { name: "Elevated body temperature", conditionType: "THRESHOLD_ABOVE", sensorType: "body_temperature", threshold: { value: 38 }, severity: "MEDIUM" },
      offlineRule,
    ],
    reports: ["project-overview", "health-telemetry", "environmental-trends"],
    configSchema: [
      { key: "weatherProvider", label: "Weather provider", type: "select", default: "none", options: ["none", "open-meteo", "openweathermap"] },
      { key: "weatherLocation", label: "Weather location", type: "string", default: "" },
    ],
  },
  {
    key: "remote-patient-monitoring",
    name: "Real-Time Remote Patient Monitoring for Chronic Disease Management",
    category: "HEALTHCARE_WEARABLES",
    description: "Wearable and bedside sensors report heart rate, SpO₂, body temperature and blood pressure for authorized care-team members. Patients are referenced by pseudonymous device identifiers only.",
    isSensitive: true,
    analyticsLabel: "Threshold monitoring",
    analyticsNote: "Configurable thresholds only. No clinical risk scoring or diagnosis is performed.",
    deviceRequirements: ["ESP32 wearable", "MAX30102 (HR / SpO₂)", "MLX90614 or DS18B20", "Automatic BP cuff with serial/BLE output (optional)"],
    safetyNotice: HEALTH_NOTICE,
    sensors: [
      { key: "heart_rate", name: "Heart rate", measurement: "heart_rate", minValue: 20, maxValue: 250, simulation: { mode: "wave", base: 78, amplitude: 8, noise: 2, periodMinutes: 180, abnormal: 138 } },
      { key: "spo2", name: "SpO₂", measurement: "spo2", minValue: 50, maxValue: 100, simulation: { mode: "walk", start: 97, step: 0.4, min: 94, max: 99, abnormal: 86 } },
      { key: "body_temperature", name: "Body temperature", measurement: "body_temperature", minValue: 30, maxValue: 45, simulation: { mode: "wave", base: 36.8, amplitude: 0.2, noise: 0.05, periodMinutes: 600, abnormal: 39.2 } },
      { key: "systolic_bp", name: "Systolic BP", measurement: "systolic_bp", minValue: 50, maxValue: 260, simulation: { mode: "wave", base: 122, amplitude: 8, noise: 3, periodMinutes: 720, abnormal: 182 } },
      { key: "diastolic_bp", name: "Diastolic BP", measurement: "diastolic_bp", minValue: 30, maxValue: 160, simulation: { mode: "wave", base: 80, amplitude: 5, noise: 2, periodMinutes: 720, abnormal: 112 } },
      battery(100, 0.8),
    ],
    widgets: [
      { id: "hr-line", type: "line", title: "Heart rate", sensorKeys: ["heart_rate"] },
      { id: "spo2-line", type: "line", title: "SpO₂", sensorKeys: ["spo2"] },
      { id: "bp-line", type: "line", title: "Blood pressure", sensorKeys: ["systolic_bp", "diastolic_bp"] },
      { id: "temp-kpi", type: "kpi", title: "Body temperature", sensorKeys: ["body_temperature"] },
    ],
    alertRules: [
      { name: "Low SpO₂", conditionType: "THRESHOLD_BELOW", sensorType: "spo2", threshold: { value: 90 }, severity: "CRITICAL", consecutiveCount: 2 },
      { name: "Heart rate out of range", conditionType: "OUTSIDE_RANGE", sensorType: "heart_rate", threshold: { min: 45, max: 125 }, severity: "HIGH", consecutiveCount: 2 },
      { name: "Fever threshold", conditionType: "THRESHOLD_ABOVE", sensorType: "body_temperature", threshold: { value: 38 }, severity: "MEDIUM" },
      { name: "High systolic pressure", conditionType: "THRESHOLD_ABOVE", sensorType: "systolic_bp", threshold: { value: 170 }, severity: "HIGH", consecutiveCount: 2 },
      batteryLowRule,
      { ...offlineRule, severity: "HIGH" },
    ],
    reports: ["project-overview", "health-telemetry", "alert-history", "device-availability"],
    configSchema: [
      { key: "careTeamOnly", label: "Restrict to care team members", type: "boolean", default: true },
      { key: "retentionDays", label: "Reading retention", type: "number", default: 90, unit: "days", min: 1, max: 3650 },
    ],
  },
  {
    key: "smart-medication-dispenser",
    name: "Smart Medication Dispenser with Dosage Tracking and Alerting",
    category: "HEALTHCARE_WEARABLES",
    description: "A scheduled dispenser reports dispensed doses, missed doses, device status and remaining pill inventory (inventory only where the hardware counts pills).",
    isSensitive: true,
    analyticsLabel: "Rule-based",
    analyticsNote: "Adherence figures are counts of dispensed vs. missed dose events.",
    deviceRequirements: ["ESP32", "Servo or stepper carousel", "IR break-beam pill detector", "RTC module (DS3231)", "Buzzer / LED"],
    safetyNotice: HEALTH_NOTICE,
    sensors: [
      { key: "dose_dispensed", name: "Dose dispensed", measurement: "dose_dispensed", simulation: { mode: "event", probability: 0.08, abnormalProbability: 0 } },
      { key: "dose_missed", name: "Missed dose", measurement: "dose_missed", simulation: { mode: "event", probability: 0.01, abnormalProbability: 0.5 } },
      { key: "pill_inventory", name: "Pills remaining", measurement: "pill_inventory", minValue: 0, simulation: { mode: "drain", start: 60, perHour: 0.15, min: 0, abnormal: 2 } },
      { key: "device_status", name: "Dispenser status", measurement: "device_status", simulation: { mode: "state", states: [0, 1], weights: [0.95, 0.05], abnormal: 2 } },
      battery(100, 0.1),
    ],
    widgets: [
      { id: "inventory-kpi", type: "kpi", title: "Pills remaining", sensorKeys: ["pill_inventory"] },
      { id: "dispensed-bar", type: "bar", title: "Doses dispensed", sensorKeys: ["dose_dispensed"] },
      { id: "missed-bar", type: "bar", title: "Missed doses", sensorKeys: ["dose_missed"] },
      { id: "status-state", type: "state", title: "Dispenser status", sensorKeys: ["device_status"] },
    ],
    alertRules: [
      { name: "Missed dose", conditionType: "THRESHOLD_ABOVE", sensorType: "dose_missed", threshold: { value: 0 }, severity: "HIGH", cooldownSeconds: 60 },
      { name: "Inventory low", conditionType: "THRESHOLD_BELOW", sensorType: "pill_inventory", threshold: { value: 7 }, severity: "MEDIUM", autoResolve: true },
      { name: "Dispenser fault", conditionType: "STATE_EQUALS", sensorType: "device_status", threshold: { state: 2 }, severity: "HIGH" },
      offlineRule,
    ],
    reports: ["project-overview", "health-telemetry", "alert-history"],
    configSchema: [
      { key: "dosesPerDay", label: "Doses per day", type: "number", default: 2, min: 1, max: 12 },
      { key: "missedDoseGraceMinutes", label: "Missed-dose grace period", type: "number", default: 30, unit: "min", min: 1 },
    ],
  },
  {
    key: "fall-detection-wearable",
    name: "IoT-Enabled Wearable Device for Fall Detection and Emergency Response",
    category: "HEALTHCARE_WEARABLES",
    description: "A wearable IMU reports acceleration, orientation, and fall events from a documented on-device threshold algorithm (free-fall then impact), plus emergency notification status, battery and connectivity.",
    isSensitive: true,
    analyticsLabel: "Rule-based",
    analyticsNote: "Fall confidence is reported only if the device firmware computes it. The platform does not claim clinical or emergency-response reliability.",
    deviceRequirements: ["ESP32 wearable", "MPU-6050 IMU", "Panic button", "Optional GSM module (SIM800L) for SMS"],
    safetyNotice: `${HEALTH_NOTICE} ${SAFETY_NOTICE}`,
    sensors: [
      { key: "acceleration", name: "Acceleration magnitude", measurement: "acceleration", simulation: { mode: "wave", base: 9.81, amplitude: 0.5, noise: 0.3, periodMinutes: 15, abnormal: 29 } },
      { key: "tilt", name: "Orientation (tilt)", measurement: "tilt_angle", minValue: -180, maxValue: 180, simulation: { mode: "wave", base: 5, amplitude: 10, noise: 3, periodMinutes: 30, abnormal: 85 } },
      { key: "fall_event", name: "Fall event", measurement: "fall_event", origin: "CALCULATED", simulation: { mode: "event", probability: 0.002, abnormalProbability: 0.6 } },
      { key: "fall_confidence", name: "Fall-event confidence (firmware)", measurement: "fall_confidence", origin: "CALCULATED", minValue: 0, maxValue: 100, simulation: { mode: "walk", start: 3, step: 2, min: 0, max: 15, abnormal: 92 } },
      { key: "emergency_status", name: "Emergency notification", measurement: "emergency_status", simulation: { mode: "state", states: [0], weights: [1], abnormal: 2 } },
      battery(100, 0.9),
      rssi,
    ],
    widgets: [
      { id: "accel-line", type: "line", title: "Acceleration", sensorKeys: ["acceleration"] },
      { id: "fall-bar", type: "bar", title: "Fall events", sensorKeys: ["fall_event"] },
      { id: "emergency-state", type: "state", title: "Emergency status", sensorKeys: ["emergency_status"] },
      { id: "battery-kpi", type: "kpi", title: "Battery", sensorKeys: ["battery"] },
    ],
    alertRules: [
      { name: "Fall detected", conditionType: "THRESHOLD_ABOVE", sensorType: "fall_event", threshold: { value: 0 }, severity: "CRITICAL", cooldownSeconds: 60 },
      { name: "High-confidence fall pattern", conditionType: "THRESHOLD_ABOVE", sensorType: "fall_confidence", threshold: { value: 80 }, severity: "HIGH" },
      batteryLowRule,
      { ...offlineRule, severity: "HIGH" },
    ],
    reports: ["project-overview", "health-telemetry", "alert-history", "device-availability"],
    configSchema: [
      { key: "impactThresholdG", label: "Impact threshold", type: "number", default: 2.5, unit: "g", min: 1, max: 16 },
      { key: "emergencyContactConfigured", label: "Emergency contact configured", type: "boolean", default: false },
    ],
  },

  // ── Category F: Livestock ──
  {
    key: "livestock-tracking-health",
    name: "Intelligent Livestock Tracking and Health Monitoring System",
    category: "LIVESTOCK",
    description: "Collar tags report location (where GPS is fitted and tracking is authorized), body temperature, activity and battery. Activity status is classified on-collar by accelerometer thresholds.",
    isSensitive: false,
    analyticsLabel: "Rule-based",
    analyticsNote: "Activity classes come from collar firmware thresholds. Health flags are threshold rules, not veterinary diagnoses.",
    deviceRequirements: ["ESP32 / LoRa collar node", "NEO-6M GPS (optional)", "DS18B20 temperature probe", "ADXL345 accelerometer"],
    sensors: [
      { key: "body_temperature", name: "Animal body temperature", measurement: "temperature", minValue: 30, maxValue: 45, simulation: { mode: "wave", base: 38.6, amplitude: 0.3, noise: 0.1, periodMinutes: 1440, abnormal: 40.8 } },
      { key: "activity_level", name: "Activity level", measurement: "activity_level", minValue: 0, simulation: { mode: "wave", base: 420, amplitude: 250, noise: 50, periodMinutes: 1440, min: 0, abnormal: 15 } },
      { key: "activity_state", name: "Activity status", measurement: "activity_state", origin: "CALCULATED", simulation: { mode: "state", states: [0, 1, 2], weights: [0.35, 0.45, 0.2], abnormal: 0 } },
      { key: "latitude", name: "Latitude", measurement: "latitude", minValue: -90, maxValue: 90, simulation: { mode: "walk", start: 31.5204, step: 0.0004, min: 31.515, max: 31.526, abnormal: 31.54 } },
      { key: "longitude", name: "Longitude", measurement: "longitude", minValue: -180, maxValue: 180, simulation: { mode: "walk", start: 74.3587, step: 0.0004, min: 74.353, max: 74.364, abnormal: 74.38 } },
      battery(100, 0.2),
      rssi,
    ],
    widgets: [
      { id: "temp-line", type: "line", title: "Body temperature", sensorKeys: ["body_temperature"] },
      { id: "activity-line", type: "line", title: "Activity", sensorKeys: ["activity_level"] },
      { id: "activity-state", type: "state", title: "Activity status", sensorKeys: ["activity_state"] },
      { id: "battery-kpi", type: "kpi", title: "Collar battery", sensorKeys: ["battery"] },
    ],
    alertRules: [
      { name: "Elevated animal temperature", conditionType: "THRESHOLD_ABOVE", sensorType: "temperature", threshold: { value: 40 }, severity: "HIGH", consecutiveCount: 2 },
      { name: "Very low activity", conditionType: "THRESHOLD_BELOW", sensorType: "activity_level", threshold: { value: 50 }, severity: "MEDIUM", consecutiveCount: 4 },
      batteryLowRule,
      offlineRule,
    ],
    reports: ["project-overview", "sensor-statistics", "device-availability", "alert-history"],
    configSchema: [
      { key: "locationTrackingAuthorized", label: "Location tracking authorized", type: "boolean", default: true },
      { key: "herdName", label: "Herd name", type: "string", default: "Herd 1" },
    ],
  },

  // ── Category G: Security and Access ──
  {
    key: "smart-door-lock",
    name: "Smart Door Lock with Facial Recognition and Remote Access",
    category: "SECURITY_ACCESS",
    description: "The lock reports lock and door state, access events (granted/denied), failed attempts, a numeric authorized-user reference, and battery. Face matching runs on the lock's own module (e.g. ESP32-CAM); the platform never stores face images or biometric templates.",
    isSensitive: true,
    analyticsLabel: "Rule-based",
    analyticsNote: "Facial recognition, if present, is performed on the device. The platform only receives the resulting access event and a numeric user reference.",
    deviceRequirements: ["ESP32-CAM or face-recognition module", "Solenoid or motor lock with relay", "Reed switch door sensor", "Battery pack"],
    safetyNotice: "Biometric data never leaves the lock. Remote unlock is not implemented by the platform; it only monitors state and events.",
    sensors: [
      { key: "lock_state", name: "Lock state", measurement: "lock_state", simulation: { mode: "state", states: [0, 1], weights: [0.85, 0.15], abnormal: 2 } },
      { key: "door_state", name: "Door state", measurement: "door_state", simulation: { mode: "state", states: [0, 1], weights: [0.9, 0.1], abnormal: 1 } },
      { key: "access_event", name: "Access event", measurement: "access_event", simulation: { mode: "state", states: [0, 1, 2], weights: [0.85, 0.12, 0.03], abnormal: 2 } },
      { key: "failed_access", name: "Failed access attempts", measurement: "failed_access", simulation: { mode: "event", probability: 0.02, abnormalProbability: 0.7 } },
      { key: "authorized_user_ref", name: "Authorized user reference", measurement: "authorized_user_ref", simulation: { mode: "state", states: [101, 102, 103], weights: [0.5, 0.3, 0.2], abnormal: 0 } },
      battery(100, 0.08),
    ],
    widgets: [
      { id: "lock-state", type: "state", title: "Lock", sensorKeys: ["lock_state"] },
      { id: "door-state", type: "state", title: "Door", sensorKeys: ["door_state"] },
      { id: "failed-bar", type: "bar", title: "Failed attempts", sensorKeys: ["failed_access"] },
      { id: "access-state", type: "state", title: "Last access event", sensorKeys: ["access_event"] },
      { id: "battery-kpi", type: "kpi", title: "Lock battery", sensorKeys: ["battery"] },
    ],
    alertRules: [
      { name: "Repeated failed access attempts", conditionType: "THRESHOLD_ABOVE", sensorType: "failed_access", threshold: { value: 0 }, severity: "HIGH", consecutiveCount: 3, cooldownSeconds: 300 },
      { name: "Lock jammed", conditionType: "STATE_EQUALS", sensorType: "lock_state", threshold: { state: 2 }, severity: "CRITICAL" },
      { ...batteryLowRule, threshold: { value: 20 }, severity: "MEDIUM" },
      offlineRule,
    ],
    reports: ["project-overview", "alert-history", "alert-frequency", "device-availability"],
    configSchema: [
      { key: "autoLockSeconds", label: "Auto-lock delay", type: "number", default: 10, unit: "s", min: 1, max: 600 },
      { key: "maxFailedAttempts", label: "Failed attempts before lockout", type: "number", default: 5, min: 1, max: 20 },
    ],
  },
];

export const PROJECT_TYPE_KEYS = PROJECT_TYPES.map((t) => t.key);

export function getProjectTypeTemplate(key: string): ProjectTypeTemplate | undefined {
  return PROJECT_TYPES.find((t) => t.key === key);
}

export function buildDefaultConfiguration(template: ProjectTypeTemplate): ProjectConfiguration {
  return {
    templateVersion: TEMPLATE_VERSION,
    settings: Object.fromEntries(template.configSchema.map((f) => [f.key, f.default])),
    widgets: template.widgets,
    sensors: template.sensors,
    alertRules: template.alertRules,
    reports: template.reports,
  };
}
