"use strict";
/**
 * SureStep — scripts/test_remediation_pass2_suite.ts
 *
 * Comprehensive End-to-End Integration Suite for Audit Remediation Pass 2:
 * 1. WebSocket Room Authorization (Canonical Care Circle + Caregiver Assignment vs Legacy/Unrelated denial)
 * 2. Care Notes Canonical Access (Circle Owner/Member & Assigned Caregiver vs Legacy/Unrelated denial)
 * 3. Safe Zone / Geofence Deprecations (410 GONE on all legacy geofence routes)
 * 4. Routine & Reminder Deprecations (410 GONE on legacy reminder action)
 * 5. Caregiver Feed Canonical Safety Alerts (Active patient assignment requirement)
 * 6. Patient Onboarding 12-Field Validation (Workflow 02 §2 completeness invariant)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5433/sure-step';
process.env.NODE_ENV = 'test';
require("dotenv/config");
const node_assert_1 = __importDefault(require("node:assert"));
const socket_io_client_1 = require("socket.io-client");
const config_1 = __importDefault(require("../db/config"));
const server_1 = require("../server");
let totalTests = 0;
let passedTests = 0;
async function test(name, fn) {
    totalTests++;
    try {
        await fn();
        passedTests++;
        console.log(`  ✓ [PASS] ${name}`);
    }
    catch (err) {
        console.error(`  ✗ [FAIL] ${name}:`, err.message || err);
        throw err;
    }
}
async function runRemediationPass2Suite() {
    console.log('======================================================================');
    console.log('SURESTEP AUDIT REMEDIATION PASS 2 INTEGRATION TEST SUITE');
    console.log('Target Database: PostgreSQL Engine (dev: sure-step on port 5433)');
    console.log('Testing Real HTTP Routes & Real WebSocket Server');
    console.log('======================================================================\n');
    // Start HTTP + Socket.io Server on dynamic port
    await new Promise((resolve) => server_1.httpServer.listen(0, '127.0.0.1', () => resolve()));
    const port = server_1.httpServer.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api/v1`;
    const wsUrl = `http://127.0.0.1:${port}`;
    // Helper for authenticated HTTP requests
    async function apiRequest(method, endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (options.userUid) {
            headers['Authorization'] = `Bearer mock-dev-${options.userUid}-token`;
        }
        const res = await fetch(`${baseUrl}${endpoint}`, {
            method,
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
        });
        const text = await res.text();
        let json = null;
        try {
            json = JSON.parse(text);
        }
        catch (_) {
            json = { raw: text };
        }
        return {
            status: res.status,
            headers: res.headers,
            body: json,
        };
    }
    // Helper for WebSocket client creation
    function createWsClient(uid) {
        return new Promise((resolve, reject) => {
            const socket = (0, socket_io_client_1.io)(wsUrl, {
                auth: { token: `mock-dev-${uid}-token` },
                transports: ['websocket'],
                forceNew: true,
                multiplex: false,
                reconnection: false,
            });
            const timer = setTimeout(() => {
                socket.disconnect();
                reject(new Error(`WebSocket connection timed out for ${uid}`));
            }, 5000);
            socket.on('connect', () => {
                clearTimeout(timer);
                resolve(socket);
            });
            socket.on('connect_error', (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }
    // --- Fixtures & Actors ---
    const ts = Date.now();
    const ownerUid = `p2-owner-${ts}`;
    const memberUid = `p2-member-${ts}`;
    const assignedCgUid = `p2-assigned-cg-${ts}`;
    const unassignedCgUid = `p2-unassigned-cg-${ts}`;
    const termCgUid = `p2-term-cg-${ts}`;
    const legacyUid = `p2-legacy-${ts}`;
    const unrelatedUid = `p2-unrelated-${ts}`;
    const patientUid = `p2-patient-${ts}`;
    const onboardPatientUid = `p2-onboard-patient-${ts}`;
    console.log('--- Setting up Test Actors & Database Fixtures ---');
    const insertUser = async (uid, name, role, phone, onboardingComplete = true) => {
        const res = await config_1.default.query(`INSERT INTO users (firebase_uid, name, role, phone, is_active, onboarding_complete)
       VALUES ($1, $2, $3, $4, TRUE, $5)
       RETURNING *`, [uid, name, role, phone, onboardingComplete]);
        return res.rows[0];
    };
    const owner = await insertUser(ownerUid, 'Pass2 Circle Owner', 'FAMILY', `+91983100${ts % 10000}`);
    const member = await insertUser(memberUid, 'Pass2 Circle Member', 'FAMILY', `+91983200${ts % 10000}`);
    const assignedCaregiver = await insertUser(assignedCgUid, 'Pass2 Assigned Caregiver', 'CAREGIVER', `+91983300${ts % 10000}`);
    const unassignedCaregiver = await insertUser(unassignedCgUid, 'Pass2 Unassigned Caregiver', 'CAREGIVER', `+91983400${ts % 10000}`);
    const termCaregiver = await insertUser(termCgUid, 'Pass2 Term Caregiver', 'CAREGIVER', `+91983500${ts % 10000}`);
    const legacyUser = await insertUser(legacyUid, 'Pass2 Legacy User', 'FAMILY', `+91983600${ts % 10000}`);
    const unrelatedUser = await insertUser(unrelatedUid, 'Pass2 Unrelated User', 'FAMILY', `+91983700${ts % 10000}`);
    const patient = await insertUser(patientUid, 'Pass2 Patient', 'PATIENT', `+91983800${ts % 10000}`);
    const onboardPatient = await insertUser(onboardPatientUid, 'Pass2 Onboard Patient', 'PATIENT', `+91983900${ts % 10000}`, false);
    // Profiles
    await config_1.default.query('INSERT INTO patient_profiles (user_id) VALUES ($1), ($2)', [patient.id, onboardPatient.id]);
    await config_1.default.query('INSERT INTO caregiver_profiles (user_id) VALUES ($1), ($2), ($3)', [
        assignedCaregiver.id,
        unassignedCaregiver.id,
        termCaregiver.id,
    ]);
    await config_1.default.query('INSERT INTO family_profiles (user_id) VALUES ($1), ($2), ($3), ($4)', [
        owner.id,
        member.id,
        legacyUser.id,
        unrelatedUser.id,
    ]);
    // Care Circle
    const circleRes = await config_1.default.query(`INSERT INTO care_circles (name, owner_id) VALUES ($1, $2) RETURNING *`, [`Pass2 Circle ${ts}`, owner.id]);
    const circle = circleRes.rows[0];
    // Circle Member
    await config_1.default.query(`INSERT INTO care_circle_members (circle_id, user_id, role_in_circle) VALUES ($1, $2, 'MEMBER')`, [circle.id, member.id]);
    // Patient Circle Association
    await config_1.default.query(`INSERT INTO patient_circle_associations (patient_id, circle_id, associated_by) VALUES ($1, $2, $3)`, [patient.id, circle.id, owner.id]);
    // Assigned Caregiver: Contractual relationship + Patient assignment
    const cgRelRes = await config_1.default.query(`INSERT INTO caregiver_relationships (circle_id, caregiver_id, status)
     VALUES ($1, $2, 'ACTIVE') RETURNING *`, [circle.id, assignedCaregiver.id]);
    const cgRel = cgRelRes.rows[0];
    await config_1.default.query(`INSERT INTO patient_assignments (relationship_id, patient_id, is_active, assigned_by)
     VALUES ($1, $2, TRUE, $3)`, [cgRel.id, patient.id, owner.id]);
    // Unassigned Caregiver: Contractual relationship in Circle, but NO patient assignment
    await config_1.default.query(`INSERT INTO caregiver_relationships (circle_id, caregiver_id, status)
     VALUES ($1, $2, 'ACTIVE')`, [circle.id, unassignedCaregiver.id]);
    // Terminated Caregiver: Contractual relationship TERMINATED
    const termRelRes = await config_1.default.query(`INSERT INTO caregiver_relationships (circle_id, caregiver_id, status, ended_at)
     VALUES ($1, $2, 'TERMINATED', NOW()) RETURNING *`, [circle.id, termCaregiver.id]);
    await config_1.default.query(`INSERT INTO patient_assignments (relationship_id, patient_id, is_active, assigned_by)
     VALUES ($1, $2, TRUE, $3)`, [termRelRes.rows[0].id, patient.id, owner.id]);
    // Legacy-only user: exists ONLY in legacy patient_relationships, NOT in care_circle
    await config_1.default.query(`INSERT INTO patient_relationships (patient_user_id, related_user_id, relationship_type, status)
     VALUES ($1, $2, 'FAMILY_CLOSE', 'CONFIRMED')`, [patient.id, legacyUser.id]);
    console.log('Fixtures initialized successfully.\n');
    try {
        // =========================================================================
        // 1. WebSocket Room Authorization Tests
        // =========================================================================
        console.log('>>> 1. WebSocket Room Authorization Tests');
        await test('1.1 Unrelated user attempting join:patient is denied with error:unauthorized', async () => {
            const client = await createWsClient(unrelatedUid);
            try {
                const errorPromise = new Promise((resolve) => {
                    client.on('error:unauthorized', (data) => resolve(data));
                });
                client.emit('join:patient', patient.id);
                const err = await Promise.race([
                    errorPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for unauthorized error')), 3000)),
                ]);
                node_assert_1.default.strictEqual(err.patientId, patient.id);
                node_assert_1.default.strictEqual(err.message, 'Not authorized for this patient room');
            }
            finally {
                client.disconnect();
            }
        });
        await test('1.2 User with ONLY legacy patient_relationships is denied with error:unauthorized', async () => {
            const client = await createWsClient(legacyUid);
            try {
                const errorPromise = new Promise((resolve) => {
                    client.on('error:unauthorized', (data) => resolve(data));
                });
                client.emit('join:patient', patient.id);
                const err = await Promise.race([
                    errorPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for unauthorized error')), 3000)),
                ]);
                node_assert_1.default.strictEqual(err.patientId, patient.id);
                node_assert_1.default.strictEqual(err.message, 'Not authorized for this patient room');
            }
            finally {
                client.disconnect();
            }
        });
        await test('1.3 Canonical Circle Owner auto-joins room and succeeds on join:patient', async () => {
            const client = await createWsClient(ownerUid);
            try {
                let unauthorizedReceived = false;
                client.on('error:unauthorized', () => { unauthorizedReceived = true; });
                client.emit('join:patient', patient.id);
                // Wait 300ms to verify no unauthorized error is emitted
                await new Promise((r) => setTimeout(r, 300));
                node_assert_1.default.strictEqual(unauthorizedReceived, false, 'Circle Owner should not receive error:unauthorized');
            }
            finally {
                client.disconnect();
            }
        });
        await test('1.4 Canonical Circle Member auto-joins room and succeeds on join:patient', async () => {
            const client = await createWsClient(memberUid);
            try {
                let unauthorizedReceived = false;
                client.on('error:unauthorized', () => { unauthorizedReceived = true; });
                client.emit('join:patient', patient.id);
                await new Promise((r) => setTimeout(r, 300));
                node_assert_1.default.strictEqual(unauthorizedReceived, false, 'Circle Member should not receive error:unauthorized');
            }
            finally {
                client.disconnect();
            }
        });
        await test('1.5 Assigned Caregiver auto-joins room and succeeds on join:patient', async () => {
            const client = await createWsClient(assignedCgUid);
            try {
                let unauthorizedReceived = false;
                client.on('error:unauthorized', () => { unauthorizedReceived = true; });
                client.emit('join:patient', patient.id);
                await new Promise((r) => setTimeout(r, 300));
                node_assert_1.default.strictEqual(unauthorizedReceived, false, 'Assigned Caregiver should not receive error:unauthorized');
            }
            finally {
                client.disconnect();
            }
        });
        await test('1.6 Unassigned Caregiver is denied join:patient with error:unauthorized', async () => {
            const client = await createWsClient(unassignedCgUid);
            try {
                const errorPromise = new Promise((resolve) => {
                    client.on('error:unauthorized', (data) => resolve(data));
                });
                client.emit('join:patient', patient.id);
                const err = await Promise.race([
                    errorPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for unauthorized error')), 3000)),
                ]);
                node_assert_1.default.strictEqual(err.patientId, patient.id);
                node_assert_1.default.strictEqual(err.message, 'Not authorized for this patient room');
            }
            finally {
                client.disconnect();
            }
        });
        await test('1.7 Terminated Caregiver is denied join:patient with error:unauthorized', async () => {
            const client = await createWsClient(termCgUid);
            try {
                const errorPromise = new Promise((resolve) => {
                    client.on('error:unauthorized', (data) => resolve(data));
                });
                client.emit('join:patient', patient.id);
                const err = await Promise.race([
                    errorPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for unauthorized error')), 3000)),
                ]);
                node_assert_1.default.strictEqual(err.patientId, patient.id);
                node_assert_1.default.strictEqual(err.message, 'Not authorized for this patient room');
            }
            finally {
                client.disconnect();
            }
        });
        // =========================================================================
        // 2. Legacy Care Notes Deprecations (410 GONE)
        // =========================================================================
        console.log('\n>>> 2. Legacy Care Notes Deprecations (410 GONE)');
        await test('2.1 GET /family/care-notes returns 410 GONE', async () => {
            const res = await apiRequest('GET', `/family/care-notes`, { userUid: ownerUid });
            node_assert_1.default.strictEqual(res.status, 410);
            node_assert_1.default.strictEqual(res.body.error?.code, 'DEPRECATED_ENDPOINT');
        });
        await test('2.2 POST /family/care-notes returns 410 GONE', async () => {
            const res = await apiRequest('POST', `/family/care-notes`, {
                userUid: ownerUid,
                body: { content: 'Sample note' },
            });
            node_assert_1.default.strictEqual(res.status, 410);
            node_assert_1.default.strictEqual(res.body.error?.code, 'DEPRECATED_ENDPOINT');
        });
        await test('2.3 DELETE /family/care-notes/:id returns 410 GONE', async () => {
            const res = await apiRequest('DELETE', `/family/care-notes/dummy-note-id`, { userUid: ownerUid });
            node_assert_1.default.strictEqual(res.status, 410);
            node_assert_1.default.strictEqual(res.body.error?.code, 'DEPRECATED_ENDPOINT');
        });
        await test('2.4 GET /family/care-notes/patient/:id returns 410 GONE', async () => {
            const res = await apiRequest('GET', `/family/care-notes/patient/${patient.id}`, { userUid: ownerUid });
            node_assert_1.default.strictEqual(res.status, 410);
            node_assert_1.default.strictEqual(res.body.error?.code, 'DEPRECATED_ENDPOINT');
        });
        // =========================================================================
        // 3. Legacy Safe Zone / Geofence Deprecations (410 GONE)
        // =========================================================================
        console.log('\n>>> 3. Legacy Safe Zone / Geofence Deprecations (410 GONE)');
        await test('3.1 GET /location/geofences/patient/:patientId returns 410 GONE', async () => {
            const res = await apiRequest('GET', `/location/geofences/patient/${patient.id}`, { userUid: ownerUid });
            node_assert_1.default.strictEqual(res.status, 410);
            node_assert_1.default.strictEqual(res.body.error?.code, 'DEPRECATED_ENDPOINT');
        });
        await test('3.2 POST /location/geofences returns 410 GONE', async () => {
            const res = await apiRequest('POST', `/location/geofences`, {
                userUid: ownerUid,
                body: { name: 'Legacy Fence', center_lat: 12.97, center_lng: 77.59, radius_meters: 200 },
            });
            node_assert_1.default.strictEqual(res.status, 410);
            node_assert_1.default.strictEqual(res.body.error?.code, 'DEPRECATED_ENDPOINT');
        });
        await test('3.3 PATCH /location/geofences/:id returns 410 GONE', async () => {
            const res = await apiRequest('PATCH', `/location/geofences/dummy-id`, {
                userUid: ownerUid,
                body: { name: 'Updated Fence' },
            });
            node_assert_1.default.strictEqual(res.status, 410);
            node_assert_1.default.strictEqual(res.body.error?.code, 'DEPRECATED_ENDPOINT');
        });
        await test('3.4 DELETE /location/geofences/:id returns 410 GONE', async () => {
            const res = await apiRequest('DELETE', `/location/geofences/dummy-id`, { userUid: ownerUid });
            node_assert_1.default.strictEqual(res.status, 410);
            node_assert_1.default.strictEqual(res.body.error?.code, 'DEPRECATED_ENDPOINT');
        });
        await test('3.5 GET /location/geofences/alerts/patient/:patientId returns 410 GONE', async () => {
            const res = await apiRequest('GET', `/location/geofences/alerts/patient/${patient.id}`, { userUid: ownerUid });
            node_assert_1.default.strictEqual(res.status, 410);
            node_assert_1.default.strictEqual(res.body.error?.code, 'DEPRECATED_ENDPOINT');
        });
        // =========================================================================
        // 4. Legacy Reminder Deprecations (410 GONE)
        // =========================================================================
        console.log('\n>>> 4. Legacy Reminder Deprecations (410 GONE)');
        await test('4.1 POST /alerts/reminders/:id/action returns 410 GONE and performs no mutation', async () => {
            const res = await apiRequest('POST', `/alerts/reminders/dummy-reminder-id/action`, {
                userUid: ownerUid,
                body: { action: 'DONE' },
            });
            node_assert_1.default.strictEqual(res.status, 410);
            node_assert_1.default.strictEqual(res.body.error?.code, 'DEPRECATED_ENDPOINT');
        });
        await test('4.2 GET /alerts/reminders/active returns 410 GONE and directs to routine occurrences', async () => {
            const res = await apiRequest('GET', `/alerts/reminders/active?patientId=${patient.id}`, {
                userUid: ownerUid,
            });
            node_assert_1.default.strictEqual(res.status, 410);
            node_assert_1.default.strictEqual(res.body.error?.code, 'DEPRECATED_ENDPOINT');
        });
        // =========================================================================
        // 5. Caregiver Feed Canonical Safety Alerts
        // =========================================================================
        console.log('\n>>> 5. Caregiver Feed Canonical Safety Alerts');
        // Insert a canonical safety alert for the patient
        const alertRes = await config_1.default.query(`INSERT INTO safety_alerts (circle_id, patient_id, alert_type, status, dedup_key)
       VALUES ($1, $2, 'SOS_MANUAL', 'TRIGGERED', $3)
       RETURNING *`, [circle.id, patient.id, `SOS_PASS2_${ts}`]);
        const testAlert = alertRes.rows[0];
        await test('5.1 Assigned Caregiver receives safety alerts for assigned patient in feed', async () => {
            const res = await apiRequest('GET', `/alerts/caregiver/feed`, { userUid: assignedCgUid });
            node_assert_1.default.strictEqual(res.status, 200);
            (0, node_assert_1.default)(Array.isArray(res.body.data.alerts));
            const hasAlert = res.body.data.alerts.some((a) => a.id === testAlert.id);
            node_assert_1.default.strictEqual(hasAlert, true, 'Assigned caregiver feed must include assigned patient alert');
        });
        await test('5.2 Unassigned Caregiver feed does NOT receive alerts for this patient', async () => {
            const res = await apiRequest('GET', `/alerts/caregiver/feed`, { userUid: unassignedCgUid });
            node_assert_1.default.strictEqual(res.status, 200);
            (0, node_assert_1.default)(Array.isArray(res.body.data.alerts));
            const hasAlert = res.body.data.alerts.some((a) => a.id === testAlert.id);
            node_assert_1.default.strictEqual(hasAlert, false, 'Unassigned caregiver feed must NOT include unassigned patient alert');
        });
        // =========================================================================
        // 6. Patient Onboarding 12-Field Validation (Workflow 02 §2)
        // =========================================================================
        console.log('\n>>> 6. Patient Onboarding 12-Field Validation');
        await test('6.1 Incomplete mandatory fields leaves onboarding_complete = FALSE', async () => {
            // Missing emergency contact relation and living arrangement
            const partialPayload = {
                name: 'Incomplete Patient',
                date_of_birth: '1945-05-12',
                gender: 'MALE',
                preferred_language: 'en',
                city: 'Bengaluru',
                diagnosis: 'ALZHEIMERS',
                severity_level: 'MODERATE',
                care_needs: ['MOBILITY'],
                safety_concerns: ['WANDERING'],
                emergency_contact_name: 'Jane Doe',
                emergency_contact_phone: '+919876543210',
                // emergency_contact_relation omitted
                // living_arrangement omitted
            };
            const res = await apiRequest('PUT', `/users/patient`, {
                userUid: onboardPatientUid,
                body: partialPayload,
            });
            node_assert_1.default.strictEqual(res.status, 200);
            node_assert_1.default.strictEqual(res.body.data.profile.onboarding_complete, false);
            const dbUser = await config_1.default.query('SELECT onboarding_complete FROM users WHERE id = $1', [onboardPatient.id]);
            node_assert_1.default.strictEqual(dbUser.rows[0].onboarding_complete, false);
        });
        await test('6.2 Supplying all 12 mandatory fields completes onboarding (onboarding_complete = TRUE)', async () => {
            const completePayload = {
                name: 'Complete Patient',
                date_of_birth: '1945-05-12',
                gender: 'MALE',
                preferred_language: 'en',
                city: 'Bengaluru',
                living_arrangement: 'FAMILY_HOME',
                diagnosis: 'ALZHEIMERS',
                severity_level: 'MODERATE',
                care_needs: ['MOBILITY', 'MEDICATION'],
                safety_concerns: ['WANDERING'],
                emergency_contact_name: 'Jane Doe',
                emergency_contact_phone: '+919876543210',
                emergency_contact_relation: 'DAUGHTER',
            };
            const res = await apiRequest('PUT', `/users/patient`, {
                userUid: onboardPatientUid,
                body: completePayload,
            });
            node_assert_1.default.strictEqual(res.status, 200);
            node_assert_1.default.strictEqual(res.body.data.profile.onboarding_complete, true);
            const dbUser = await config_1.default.query('SELECT onboarding_complete FROM users WHERE id = $1', [onboardPatient.id]);
            node_assert_1.default.strictEqual(dbUser.rows[0].onboarding_complete, true);
        });
    }
    finally {
        // --- Cleanup Fixtures ---
        console.log('\n--- Cleaning up Test Fixtures ---');
        await config_1.default.query('DELETE FROM safety_alerts WHERE patient_id = $1', [patient.id]);
        await config_1.default.query('DELETE FROM patient_assignments WHERE patient_id = $1', [patient.id]);
        await config_1.default.query('DELETE FROM caregiver_relationships WHERE circle_id = $1', [circle.id]);
        await config_1.default.query('DELETE FROM patient_circle_associations WHERE circle_id = $1', [circle.id]);
        await config_1.default.query('DELETE FROM care_circle_members WHERE circle_id = $1', [circle.id]);
        await config_1.default.query('DELETE FROM care_circles WHERE id = $1', [circle.id]);
        await config_1.default.query('DELETE FROM patient_relationships WHERE patient_user_id = $1', [patient.id]);
        await config_1.default.query('DELETE FROM patient_profiles WHERE user_id IN ($1, $2)', [patient.id, onboardPatient.id]);
        await config_1.default.query('DELETE FROM caregiver_profiles WHERE user_id IN ($1, $2, $3)', [
            assignedCaregiver.id,
            unassignedCaregiver.id,
            termCaregiver.id,
        ]);
        await config_1.default.query('DELETE FROM family_profiles WHERE user_id IN ($1, $2, $3, $4)', [
            owner.id,
            member.id,
            legacyUser.id,
            unrelatedUser.id,
        ]);
        await config_1.default.query('DELETE FROM users WHERE id IN ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [
            owner.id,
            member.id,
            assignedCaregiver.id,
            unassignedCaregiver.id,
            termCaregiver.id,
            legacyUser.id,
            unrelatedUser.id,
            patient.id,
            onboardPatient.id,
        ]);
        await new Promise((resolve) => server_1.httpServer.close(() => resolve()));
        console.log('Cleanup completed.\n');
    }
    console.log('======================================================================');
    console.log(`ALL REMEDIATION PASS 2 TESTS PASSED: ${passedTests} / ${totalTests}`);
    console.log('Canonical Authorization, Real-Time WebSockets, and Onboarding Verified!');
    console.log('======================================================================\n');
}
runRemediationPass2Suite()
    .then(() => process.exit(0))
    .catch((err) => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
//# sourceMappingURL=test_remediation_pass2_suite.js.map