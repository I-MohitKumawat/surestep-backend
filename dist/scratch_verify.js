"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '.env') });
process.env.PORT = '3005';
const config_1 = __importDefault(require("./db/config"));
const reminders_service_1 = require("./modules/notifications/reminders.service");
async function runVerification() {
    console.log('[Test] Starting Reminder & Escalation Engine Verification...');
    // Log all tables
    const tables = await config_1.default.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    console.log('[Test] Existing tables in database:', tables.rows.map(r => r.table_name));
    // 1. Create a dummy patient & caregiver for testing
    const patientId = '11111111-1111-1111-1111-111111111111';
    const caregiverId = '22222222-2222-2222-2222-222222222222';
    // Cleanup
    await config_1.default.query('DELETE FROM reminders WHERE patient_id = $1', [patientId]);
    await config_1.default.query('DELETE FROM geofence_alerts WHERE patient_id = $1', [patientId]);
    await config_1.default.query('DELETE FROM notification_settings WHERE user_id = $1 OR user_id = $2', [patientId, caregiverId]);
    await config_1.default.query('DELETE FROM patient_relationships WHERE patient_user_id = $1', [patientId]);
    await config_1.default.query('DELETE FROM users WHERE id = $1 OR id = $2', [patientId, caregiverId]);
    // Insert test users
    await config_1.default.query(`
    INSERT INTO users (id, phone, email, name, role, firebase_uid)
    VALUES 
      ($1, '+919999999991', 'test_patient@surestep.com', 'Test Patient', 'PATIENT', 'mock-patient-uid-123'),
      ($2, '+919999999992', 'test_caregiver@surestep.com', 'Test Caregiver', 'CAREGIVER', 'mock-caregiver-uid-123')
  `, [patientId, caregiverId]);
    // Insert relationship
    await config_1.default.query(`
    INSERT INTO patient_relationships (patient_user_id, related_user_id, status, relationship_type)
    VALUES ($1, $2, 'CONFIRMED', 'CAREGIVER')
  `, [patientId, caregiverId]);
    // 2. Create a reminder scheduled 1 minute ago (so it is due)
    const dueTime = new Date(Date.now() - 60000).toISOString();
    console.log(`[Test] Creating reminder scheduled at: ${dueTime}`);
    const reminder = await (0, reminders_service_1.createReminder)({
        patientId,
        referenceType: 'ROUTINE',
        title: 'Test Morning Pills',
        body: 'Take blue pill after breakfast',
        scheduledAt: dueTime,
    });
    console.log(`[Test] Scheduled Reminder Created: ID=${reminder.id}, state=${reminder.state}`);
    // 3. Run runReminderSweep to transition SCHEDULED -> ACTIVE
    console.log('[Test] Running runReminderSweep (1)...');
    await (0, reminders_service_1.runReminderSweep)();
    // Verify reminder was activated
    const activeCheck = await config_1.default.query('SELECT * FROM reminders WHERE id = $1', [reminder.id]);
    const activeReminder = activeCheck.rows[0];
    console.log(`[Test] Reminder state after activation sweep: ${activeReminder.state}`);
    if (activeReminder.state !== 'ACTIVE') {
        throw new Error(`Expected reminder state to be ACTIVE, got ${activeReminder.state}`);
    }
    // 4. Force scheduled_at to 31 minutes ago to test 30-min escalation to MISSED
    console.log('[Test] Setting scheduled_at to 31 minutes ago to trigger escalation...');
    const expiredTime = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    await config_1.default.query('UPDATE reminders SET state = $1, scheduled_at = $2 WHERE id = $3', ['ACTIVE', expiredTime, reminder.id]);
    console.log('[Test] Running runReminderSweep (2) for escalation...');
    await (0, reminders_service_1.runReminderSweep)();
    // Verify reminder transitioned to MISSED
    const escalatedCheck = await config_1.default.query('SELECT * FROM reminders WHERE id = $1', [reminder.id]);
    const escalatedReminder = escalatedCheck.rows[0];
    console.log(`[Test] Reminder state after escalation sweep: ${escalatedReminder.state}`);
    if (escalatedReminder.state !== 'MISSED') {
        throw new Error(`Expected reminder state to be MISSED, got ${escalatedReminder.state}`);
    }
    // Check if a safety notification/log was created or sent
    console.log('[Test] Verification completed successfully! All reminder and escalation logic works.');
}
runVerification()
    .then(() => process.exit(0))
    .catch((err) => {
    console.error('[Test] Verification failed:', err);
    process.exit(1);
});
//# sourceMappingURL=scratch_verify.js.map