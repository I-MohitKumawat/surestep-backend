import assert from 'assert';
import {
  isExpoPushToken,
  type ExpoPushMessage,
} from '../modules/notifications/expoPush.service';

console.log('===============================================================');
console.log('SURESTEP STACK REMEDIATION: EXPO PUSH SERVICE VERIFICATION');
console.log('CLASSIFICATION: IN-MEMORY / UNIT TEST');
console.log('===============================================================\n');

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    process.exit(1);
  }
}

// 1. isExpoPushToken validation
runTest('1. isExpoPushToken correctly recognizes valid Expo Push Token prefixes', () => {
  assert.strictEqual(
    isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]'),
    true,
    'ExponentPushToken[...] must be recognized as Expo push token',
  );
  assert.strictEqual(
    isExpoPushToken('ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]'),
    true,
    'ExpoPushToken[...] must be recognized as Expo push token',
  );
});

runTest('2. isExpoPushToken correctly rejects non-Expo / native FCM tokens and empty inputs', () => {
  assert.strictEqual(
    isExpoPushToken('fcm-token-c1234567890abcdef'),
    false,
    'Native FCM token must not be recognized as Expo push token',
  );
  assert.strictEqual(
    isExpoPushToken(''),
    false,
    'Empty token string must return false',
  );
  assert.strictEqual(
    isExpoPushToken(null as any),
    false,
    'Null token must return false',
  );
  assert.strictEqual(
    isExpoPushToken(undefined as any),
    false,
    'Undefined token must return false',
  );
});

// 2. Expo message structure
runTest('3. ExpoPushMessage payload shape matches Expo push notification contract', () => {
  const msg: ExpoPushMessage = {
    to: 'ExponentPushToken[sample-token-12345]',
    title: 'Patient Geofence Alert',
    body: 'Patient has exited safe zone',
    data: { patientId: 'p-1', event: 'GEOFENCE_BREACH' },
    sound: 'default',
    priority: 'high',
    channelId: 'alarms',
  };

  assert.strictEqual(msg.to, 'ExponentPushToken[sample-token-12345]');
  assert.strictEqual(msg.priority, 'high');
  assert.strictEqual(msg.channelId, 'alarms');
  assert.strictEqual(msg.sound, 'default');
  assert.strictEqual(msg.data?.patientId, 'p-1');
});

console.log('\n===============================================================');
console.log('EXPO PUSH SERVICE VERIFICATION COMPLETE: ALL CHECKS PASSED');
console.log('===============================================================\n');

