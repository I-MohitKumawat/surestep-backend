import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

import pool from '../db/config';

async function migrate() {
  console.log('[Migration] Adding escalation_rules column to notification_settings...');
  try {
    await pool.query(`
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
  } catch (err) {
    console.error('[Migration] Failed to add database column:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

void migrate();
