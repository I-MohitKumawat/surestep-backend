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
async function migrate() {
    console.log('[Migration] Adding escalation_rules column to notification_settings...');
    try {
        await config_1.default.query(`
      ALTER TABLE notification_settings 
      ADD COLUMN IF NOT EXISTS escalation_rules JSONB NOT NULL DEFAULT '[
        {"level": 1, "offset_minutes": 10, "action": "NOTIFY_PATIENT_REPEAT"},
        {"level": 2, "offset_minutes": 20, "action": "NOTIFY_PATIENT_REPEAT"},
        {"level": 3, "offset_minutes": 30, "action": "MARK_MISSED"},
        {"level": 4, "offset_minutes": 45, "action": "NOTIFY_CAREGIVER"},
        {"level": 5, "offset_minutes": 60, "action": "NOTIFY_FAMILY"}
      ]'::jsonb;
    `);
        console.log('[Migration] Database column added successfully!');
    }
    catch (err) {
        console.error('[Migration] Failed to add database column:', err);
        process.exit(1);
    }
    finally {
        await config_1.default.end();
    }
}
void migrate();
//# sourceMappingURL=migrate_escalation_rules.js.map