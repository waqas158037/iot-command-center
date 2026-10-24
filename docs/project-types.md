# Project types

The catalog lives in code, in `src/lib/project-types/registry.ts`, and is synchronised into the
`ProjectType` table by `npm run db:seed` (idempotent; safe to re-run after changes). When a project
is created, the type's template (sensors, widgets, alert rules, reports, settings) is **copied** into
the project's configuration, so later catalog edits never change existing projects.

## Catalog (16 types)

| Project type | Key | Category | Sensor keys | Default rules | Analytics |
|---|---|---|---|---|---|
| AI-Powered Smart Home Energy Management System | `smart-home-energy-management` | Smart Home and Energy | power, energy, voltage, current, occupancy, temperature | 4 | Rule-based |
| Smart Home Electricity Consumption Monitoring | `home-electricity-monitoring` | Smart Home and Energy | power, energy, voltage, current | 3 | Statistical analysis |
| Connected Glucose Monitoring System with Cloud-Based Reporting | `connected-glucose-monitoring` | Smart Home and Energy | glucose, battery | 4 | Threshold monitoring · sensitive |
| Smart Posture Corrector Using Inertial Measurement Units (IMU) | `smart-posture-corrector` | Smart Home and Energy | acceleration, angular_velocity, tilt, posture, poor_posture_duration, battery | 3 | Rule-based · sensitive |
| IoT-Based Automated Waste Segregation and Management System | `automated-waste-segregation` | Waste Management | fill_level, weight, distance, waste_class, collection_status, battery | 4 | Rule-based |
| Automated Indoor Plant Irrigation with Soil Moisture Analysis | `indoor-plant-irrigation` | Agriculture | soil_moisture, temperature, humidity, tank_level, water_flow, pump_state | 3 | Rule-based |
| Precision Agriculture with Automated Fertilizer and Water Distribution | `precision-agriculture` | Agriculture | soil_moisture, soil_ph, temperature, humidity, tank_level, water_flow, pump_state, fertilizer_status, battery | 5 | Rule-based |
| IoT-Based Forest Fire Detection and Early Warning System | `forest-fire-detection` | Environment and Weather | temperature, humidity, smoke, pm25, battery, rssi | 5 | Threshold monitoring |
| Real-Time Air Quality Monitoring Network for Urban Centers | `urban-air-quality` | Environment and Weather | pm25, pm10, co2, no2, temperature, humidity | 4 | Statistical analysis |
| Solar-Powered IoT Weather Station for Hyperlocal Forecasting | `solar-weather-station` | Environment and Weather | temperature, humidity, pressure, wind_speed, wind_direction, rainfall, solar_irradiance, battery | 5 | Statistical analysis |
| Smart Mirror with Integrated Health and Weather Monitoring | `smart-mirror-health-weather` | Healthcare and Wearables | temperature, humidity, heart_rate, body_temperature, outdoor_temperature | 3 | Threshold monitoring · sensitive |
| Real-Time Remote Patient Monitoring for Chronic Disease Management | `remote-patient-monitoring` | Healthcare and Wearables | heart_rate, spo2, body_temperature, systolic_bp, diastolic_bp, battery | 6 | Threshold monitoring · sensitive |
| Smart Medication Dispenser with Dosage Tracking and Alerting | `smart-medication-dispenser` | Healthcare and Wearables | dose_dispensed, dose_missed, pill_inventory, device_status, battery | 4 | Rule-based · sensitive |
| IoT-Enabled Wearable Device for Fall Detection and Emergency Response | `fall-detection-wearable` | Healthcare and Wearables | acceleration, tilt, fall_event, fall_confidence, emergency_status, battery, rssi | 4 | Rule-based · sensitive |
| Intelligent Livestock Tracking and Health Monitoring System | `livestock-tracking-health` | Livestock | body_temperature, activity_level, activity_state, latitude, longitude, battery, rssi | 4 | Rule-based |
| Smart Door Lock with Facial Recognition and Remote Access | `smart-door-lock` | Security and Access | lock_state, door_state, access_event, failed_access, authorized_user_ref, battery | 4 | Rule-based · sensitive |

"Sensitive" types (health and biometric) show an academic-demonstration notice, require the project
MANAGER role (instead of ENGINEER) to export data, and use the shorter sensitive-data retention. Safety-related
types (fire, fall detection, door lock) show a notice that alerts do not replace certified equipment.
Analytics are labelled honestly: no type claims a machine-learning model.

## Adding a project type

1. Add an entry to `PROJECT_TYPES` in `src/lib/project-types/registry.ts` (`ProjectTypeTemplate` in `types.ts`):
   - `key` (kebab-case, permanent), `name`, `category`, `description`, `deviceRequirements`;
   - `isSensitive`, `analyticsLabel` (`Rule-based` | `Threshold monitoring` | `Statistical analysis`) and an honest `analyticsNote`; `safetyNotice` when relevant;
   - `sensors`: `key`, `name`, `measurement` (a measurement from `src/lib/telemetry/measurements.ts`, which fixes the canonical unit and allowed input units), `minValue`/`maxValue`, optional `states` for state sensors, and a `simulation` profile (`walk`, `wave`, `state`, `event`, `counter`, `drain`) with an `abnormal` value;
   - `widgets` (KPI, state, line or bar, referencing sensor keys), `alertRules` (condition, sensor type, threshold, severity, consecutive count, cooldown, auto-resolve), `reports`, and `configSchema` for type-specific settings shown in project settings.
2. If you need a new measurement, add it to `measurements.ts` with its unit conversions.
3. Run `npm test` — the catalog tests check that there are unique keys, that each default configuration validates (widgets reference existing sensors without mixing units, rules are well-formed), that analytics labels are one of the honest values, and that sensitive types carry a notice.
4. Run `npm run db:seed` to sync the catalog, then create a project of the new type and start a simulation to check its dashboard.
