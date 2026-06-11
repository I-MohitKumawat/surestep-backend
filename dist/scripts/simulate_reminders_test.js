"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load .env
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
const config_1 = __importDefault(require("../db/config"));
const reminders_service_1 = require("../modules/notifications/reminders.service");
async function testReminders() {
    console.log('🤖 STARTING REMINDERS & ESCALATION TEST SIMULATION');
    console.log('===================================================');
    // 1. Fetch a patient ID from database
    const ptRes = await config_1.default.query("SELECT id, name FROM users WHERE role = 'PATIENT' LIMIT 1");
    if (ptRes.rows.length === 0) {
        console.error('❌ Error: No patient found in the database. Please register a patient first.');
        process.exit(1);
    }
    const patient = ptRes.rows[0];
    console.log(`✅ Using Patient: ${patient.name} (ID: ${patient.id})`);
    // 2. Set up notification settings with custom escalation rules
    console.log('🔧 Updating escalation rules in notification_settings...');
    const customRules = [
        { level: 1, offset_minutes: 5, action: 'NOTIFY_PATIENT_REPEAT' },
        { level: 2, offset_minutes: 15, action: 'NOTIFY_PATIENT_REPEAT' },
        { level: 3, offset_minutes: 25, action: 'MARK_MISSED' },
        { level: 4, offset_minutes: 35, action: 'NOTIFY_CAREGIVER' },
        { level: 5, offset_minutes: 50, action: 'NOTIFY_FAMILY' }
    ];
    await config_1.default.query(`INSERT INTO notification_settings (user_id, role, escalation_rules)
     VALUES ($1, 'PATIENT', $2)
     ON CONFLICT (user_id) DO UPDATE SET escalation_rules = $2`, [patient.id, JSON.stringify(customRules)]);
    console.log('✅ Custom rules updated successfully.');
    // 3. Create a reminder scheduled 30 minutes ago
    console.log('🕒 Creating a reminder scheduled 30 minutes ago...');
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60000).toISOString();
    const reminder = await (0, reminders_service_1.createReminder)({
        patientId: patient.id,
        referenceType: 'ROUTINE',
        title: 'Time to take evening medicine',
        body: 'Please take 1 capsule of your red pill.',
        scheduledAt: thirtyMinsAgo
    });
    console.log(`✅ Reminder created (ID: ${reminder.id}) scheduled_at: ${reminder.scheduled_at}`);
    // 4. Run the first sweep (due trigger: Scheduled -> Active)
    console.log('\n🧹 Running Reminder Sweep #1 (Activation)...');
    await (0, reminders_service_1.runReminderSweep)();
    // Query DB state
    let checkRes = await config_1.default.query('SELECT state, escalation_level, history FROM reminders WHERE id = $1', [reminder.id]);
    let r = checkRes.rows[0];
    console.log(`📊 Current State: ${r.state}, Escalation Level: ${r.escalation_level}`);
    console.log('📜 History:', JSON.stringify(r.history, null, 2));
    // 5. Run the second sweep to process escalations (30 mins elapsed -> should trigger Level 3: MARK_MISSED)
    console.log('\n🧹 Running Reminder Sweep #2 (Escalation to level 3: MARK_MISSED)...');
    await (0, reminders_service_1.runReminderSweep)();
    checkRes = await config_1.default.query('SELECT state, escalation_level, history FROM reminders WHERE id = $1', [reminder.id]);
    r = checkRes.rows[0];
    console.log(`📊 Current State: ${r.state}, Escalation Level: ${r.escalation_level}`);
    console.log('📜 History:', JSON.stringify(r.history, null, 2));
    // 6. Query notification logs
    console.log('\n✉️ Fetching notification logs for patient...');
    const logsRes = await config_1.default.query(`SELECT notification_type, title, body, created_at 
     FROM notification_logs 
     WHERE user_id = $1 
     ORDER BY created_at DESC LIMIT 5`, [patient.id]);
    console.log('Logs:');
    for (const log of logsRes.rows) {
        console.log(`   - [${log.notification_type}] "${log.title}": ${log.body}`);
    }
    // Cleanup
    console.log('\n🧹 Cleaning up test reminder...');
    await config_1.default.query('DELETE FROM reminders WHERE id = $1', [reminder.id]);
    console.log('✅ Done.');
    await config_1.default.end();
}
void testReminders().catch((err) => {
    console.error('❌ Test failed with error:', err);
    config_1.default.end();
});
//# sourceMappingURL=simulate_reminders_test.js.map