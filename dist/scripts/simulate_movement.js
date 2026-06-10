"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load .env before modules to ensure DB configuration is correct
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
// Avoid port conflicts by using a dynamic/random port (port 0) if server.ts gets imported transitively
process.env.PORT = '0';
const config_1 = __importDefault(require("../db/config"));
// Delay helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Haversine distance in meters
function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
async function simulate() {
    console.log('[ignoring loop detection]');
    console.log('================================================================');
    console.log('🤖 STARTING E2E PROGRESSIVE PATIENT MOVEMENT SIMULATOR');
    // Try to get patient ID from command-line args or database
    let patientId = process.argv[2];
    if (!patientId) {
        const defaultPatient = await config_1.default.query("SELECT id FROM users WHERE role = 'PATIENT' LIMIT 1");
        if (defaultPatient.rows.length === 0) {
            console.error('❌ Error: No users with role PATIENT found in database.');
            process.exit(1);
        }
        patientId = defaultPatient.rows[0].id;
    }
    console.log(`Targeting Patient ID: ${patientId}`);
    console.log('================================================================');
    // Verify patient user and get firebase_uid
    const userCheck = await config_1.default.query('SELECT name, firebase_uid FROM users WHERE id = $1 AND role = $2', [patientId, 'PATIENT']);
    if (userCheck.rows.length === 0) {
        console.error(`❌ Error: Patient with ID ${patientId} not found in database.`);
        process.exit(1);
    }
    const { name, firebase_uid: patientUid } = userCheck.rows[0];
    console.log(`✅ Verified Patient Name: ${name} (firebase_uid: ${patientUid})`);
    // Fetch geofences to base path calculations relative to center
    const zonesCheck = await config_1.default.query('SELECT * FROM geofence_zones WHERE patient_id = $1 AND is_active = TRUE', [patientId]);
    if (zonesCheck.rows.length === 0) {
        console.error('❌ Error: No active geofences configured for this patient in database.');
        console.error('Please configure at least one active zone before running simulation.');
        process.exit(1);
    }
    const zone = zonesCheck.rows[0];
    const cLat = Number(zone.center_lat);
    const cLng = Number(zone.center_lng);
    const radius = Number(zone.radius_m);
    console.log(`📍 Found Geofence Center: (${cLat}, ${cLng}) with Radius: ${radius}m`);
    // Progressive coordinates (6 step journey from center -> near edge -> exit -> far away -> return home)
    const steps = [
        {
            label: '1. Home Center (Safe)',
            lat: cLat,
            lng: cLng,
            speed: 0,
        },
        {
            label: '2. Midway (Safe)',
            lat: cLat + (0.4 * radius) / 111320,
            lng: cLng,
            speed: 3.6, // 10 km/h
        },
        {
            label: '3. Approaching Boundary Threshold (Approaching Edge)',
            lat: cLat + (0.85 * radius) / 111320,
            lng: cLng,
            speed: 5.4, // 15 km/h
        },
        {
            label: '4. Just Outside Safe Zone (Breach Triggered!)',
            lat: cLat + (1.15 * radius) / 111320,
            lng: cLng,
            speed: 7.2, // 20 km/h
        },
        {
            label: '5. Moving Far Outside (Emergency Wandering State)',
            lat: cLat + (1.65 * radius) / 111320,
            lng: cLng,
            speed: 9.0, // 25 km/h
        },
        {
            label: '6. Back Home (Returned Safe)',
            lat: cLat,
            lng: cLng,
            speed: 18.0, // 50 km/h (quick return)
        },
    ];
    // Load backend server port from .env (default to 3000)
    // Retrieve port from raw process.env before we override it for side-effects
    const serverPort = process.env.PORT_MAIN || process.env.PORT || '3000';
    const url = `http://localhost:3000/api/v1/location/ping`;
    for (let idx = 0; idx < steps.length; idx++) {
        const step = steps[idx];
        const dist = getDistanceMeters(step.lat, step.lng, cLat, cLng);
        console.log('\n----------------------------------------------------------------');
        console.log(`🚀 Step ${idx + 1}/${steps.length}: ${step.label}`);
        console.log(`Coordinates: (${step.lat.toFixed(6)}, ${step.lng.toFixed(6)})`);
        console.log(`Calculated Distance from Center: ${dist.toFixed(1)}m (Geofence Radius: ${radius}m)`);
        // 1. Send location ping to backend via HTTP
        console.log(`📡 Sending HTTP POST ping to ${url}...`);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer mock-dev-${patientUid}-token`,
                },
                body: JSON.stringify({
                    lat: step.lat,
                    lng: step.lng,
                    accuracy_m: 10,
                    source: 'PHONE',
                    speed_kmh: step.speed,
                    recorded_at: new Date().toISOString(),
                }),
            });
            if (!response.ok) {
                console.error(`❌ HTTP Ping Failed. Status: ${response.status} - ${await response.text()}`);
            }
            else {
                const resData = (await response.json());
                console.log(`💾 Recorded ping ID (via HTTP): ${resData.data?.ping?.id}`);
            }
        }
        catch (fetchErr) {
            console.error('❌ Network error sending location ping:', fetchErr);
        }
        // 1.5. Wait briefly for async evaluateAwareness execution to complete in backend
        await sleep(600);
        // 2. Query state database and view new computed status from DB
        const stateRes = await config_1.default.query('SELECT * FROM patient_states WHERE patient_id = $1', [patientId]);
        const s = stateRes.rows[0];
        console.log(`📊 Updated Patient State in DB:`);
        console.log(`   - Safety State:  ${s?.safety_state}`);
        console.log(`   - Location State: ${s?.location_state}`);
        console.log(`   - Last Known Lat: ${s?.last_known_lat}`);
        console.log(`   - Last Known Lng: ${s?.last_known_lng}`);
        // Check alerts created
        const alertsRes = await config_1.default.query('SELECT id, alert_type, severity, created_at FROM geofence_alerts WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1', [patientId]);
        if (alertsRes.rows.length > 0) {
            const a = alertsRes.rows[0];
            console.log(`🚨 Most Recent Alert in DB: [${a.alert_type}] Severity: ${a.severity} (ID: ${a.id})`);
        }
        if (idx < steps.length - 1) {
            console.log('⏳ Pausing for 8 seconds to allow caregiver UI and sockets to propagate... 🛌');
            await sleep(8000);
        }
    }
    console.log('\n================================================================');
    console.log('🎉 PROGRESSIVE MOVEMENT SIMULATION COMPLETE');
    console.log('================================================================');
    config_1.default.end();
}
void simulate().catch((err) => {
    console.error('❌ Simulation aborted with error:', err);
    config_1.default.end();
});
//# sourceMappingURL=simulate_movement.js.map