import dotenv from 'dotenv';
import path from 'path';

// Load .env configuration
dotenv.config({ path: path.join(__dirname, '../.env') });

// Prevent port conflicts
process.env.PORT = '0';

import admin from '../config/firebase';
import pool from '../db/config';

async function main() {
  const args = process.argv.slice(2);
  let targetToken: string | null = null;
  let targetUserId: string | null = null;

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--token' && args[i + 1]) {
      targetToken = args[i + 1]!;
      i++;
    } else if (args[i] === '--user' && args[i + 1]) {
      targetUserId = args[i + 1]!;
      i++;
    }
  }

  console.log('================================================================');
  console.log('🔔 SureStep Push Notification Validation Tool');
  console.log('================================================================');

  // If no direct token, resolve from user ID or last active user
  if (!targetToken) {
    if (!targetUserId) {
      // Find the last registered user
      const lastUser = await pool.query('SELECT id, name, role FROM users ORDER BY created_at DESC LIMIT 1');
      if (lastUser.rows.length === 0) {
        console.log('⚠️ No users found in the database.');
        console.log('Please register a user on the frontend app or pass a token directly:');
        console.log('  npx ts-node scripts/test_push.ts --token <FCM_TOKEN>\n');
        process.exit(0);
      }
      targetUserId = lastUser.rows[0].id;
      console.log(`👤 Resolved target to last registered user: ${lastUser.rows[0].name} (${lastUser.rows[0].role})`);
    } else {
      console.log(`👤 Target User ID: ${targetUserId}`);
    }

    // Get device tokens for the user
    const devices = await pool.query(
      'SELECT device_token, device_type, device_name FROM device_registry WHERE user_id = $1',
      [targetUserId]
    );

    if (devices.rows.length === 0) {
      console.error(`❌ Error: No registered device tokens found for User ID ${targetUserId}.`);
      console.error('Please open the app on the device/emulator to register its FCM token first.');
      process.exit(1);
    }

    targetToken = devices.rows[0].device_token;
    console.log(`📱 Target Device: ${devices.rows[0].device_name || 'Unknown'} (${devices.rows[0].device_type})`);
  } else {
    console.log(`📱 Targeting explicit FCM Token: ${targetToken.substring(0, 15)}...`);
  }

  // Define notification payload
  const message = {
    token: targetToken as string,
    notification: {
      title: '🔔 Test Notification',
      body: `This test notification was triggered by the CLI at ${new Date().toLocaleTimeString()}`,
    },
    data: {
      type: 'TEST_NOTIFICATION',
      triggered_at: new Date().toISOString(),
    },
    android: {
      priority: 'high' as const,
      notification: {
        sound: 'default',
        priority: 'high' as const,
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
  };

  console.log('📡 Dispatching FCM notification via Firebase Admin SDK...');
  try {
    const response = await admin.messaging().send(message);
    console.log('✅ Success! Message sent successfully.');
    console.log(`🔑 Message ID: ${response}`);
  } catch (err: any) {
    console.error('❌ Failed to send push notification.');
    console.error(err);
  } finally {
    pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  pool.end();
});
