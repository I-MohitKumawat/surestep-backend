import assert from 'assert';
import pool from '../db/config';
import {
  isExpoPushToken,
  sendExpoPushNotifications,
  checkExpoPushReceipts,
  type ExpoPushMessage,
} from '../modules/notifications/expoPush.service';

console.log('===============================================================');
console.log('SURESTEP STACK REMEDIATION: EXPO PUSH SERVICE VERIFICATION');
console.log('CLASSIFICATION: MOCKED UNIT TEST (NO LIVE EXPO/DEVICE CALLS)');
console.log('===============================================================\n');

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    process.exit(1);
  }
}

async function main() {
  // 1. isExpoPushToken validation
  await runTest('1. isExpoPushToken correctly recognizes valid Expo Push Token prefixes', () => {
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

  await runTest('2. isExpoPushToken correctly rejects non-Expo / native FCM tokens and empty inputs', () => {
    assert.strictEqual(
      isExpoPushToken('fcm-token-c1234567890abcdef'),
      false,
      'Native FCM token must not be recognized as Expo push token',
    );
    assert.strictEqual(isExpoPushToken(''), false);
    assert.strictEqual(isExpoPushToken(null as any), false);
    assert.strictEqual(isExpoPushToken(undefined as any), false);
  });

  // 2. Expo message structure
  await runTest('3. ExpoPushMessage payload shape matches Expo push notification contract', () => {
    const msg: ExpoPushMessage = {
      to: 'ExponentPushToken[sample-token-12345]',
      title: 'Patient Geofence Alert',
      body: 'Patient has exited safe zone',
      data: { patientId: 'p-1', event: 'GEOFENCE_BREACH' },
      sound: 'default',
      priority: 'high',
      channelId: 'alerts',
    };

    assert.strictEqual(msg.to, 'ExponentPushToken[sample-token-12345]');
    assert.strictEqual(msg.priority, 'high');
    assert.strictEqual(msg.channelId, 'alerts');
    assert.strictEqual(msg.sound, 'default');
    assert.strictEqual(msg.data?.patientId, 'p-1');
  });

  // Mock pool.query and global.fetch for error handling tests
  const originalQuery = pool.query.bind(pool);
  const originalFetch = global.fetch;
  const prunedBatches: string[][] = [];

  (pool as any).query = async (_sql: string, params?: any[]) => {
    if (params && Array.isArray(params[0])) {
      prunedBatches.push(params[0]);
    }
    return { rows: [], rowCount: 0 };
  };

  try {
    // 3. Ticket errors: DeviceNotRegistered vs MessageTooBig vs HTTP 500
    await runTest('4. sendExpoPushNotifications handles ticket errors & prunes DeviceNotRegistered only', async () => {
      prunedBatches.length = 0;
      global.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { status: 'ok', id: 'ticket-1' },
            { status: 'error', message: 'Not registered', details: { error: 'DeviceNotRegistered' } },
            { status: 'error', message: 'Too big', details: { error: 'MessageTooBig' } },
          ],
        }),
      })) as any;

      const res = await sendExpoPushNotifications([
        { to: 'ExponentPushToken[ok-1]', title: 't', body: 'b' },
        { to: 'ExponentPushToken[bad-1]', title: 't', body: 'b' },
        { to: 'ExponentPushToken[big-1]', title: 't', body: 'b' },
      ]);

      assert.strictEqual(res.ticketIdsByToken['ticket-1'], 'ExponentPushToken[ok-1]');
      assert.deepStrictEqual(res.invalidTokens, ['ExponentPushToken[bad-1]']);
      assert.strictEqual(res.errors.length, 2);
      assert.deepStrictEqual(prunedBatches, [['ExponentPushToken[bad-1]']]);
    });

    await runTest('5. sendExpoPushNotifications handles non-2xx HTTP responses without crashing', async () => {
      prunedBatches.length = 0;
      global.fetch = (async () => ({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      })) as any;

      const res = await sendExpoPushNotifications([
        { to: 'ExponentPushToken[ok-1]', title: 't', body: 'b' },
      ]);

      assert.strictEqual(res.errors.length, 1);
      assert.ok(res.errors[0].includes('HTTP 503'));
      assert.strictEqual(prunedBatches.length, 0);
    });

    // 4. Receipt errors: handled separately from tickets
    await runTest('6. checkExpoPushReceipts handles receipt errors & prunes DeviceNotRegistered', async () => {
      prunedBatches.length = 0;
      global.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            'ticket-ok': { status: 'ok' },
            'ticket-unreg': {
              status: 'error',
              message: 'The device cannot receive push notifications anymore',
              details: { error: 'DeviceNotRegistered' },
            },
            'ticket-rate': {
              status: 'error',
              message: 'Rate limit exceeded',
              details: { error: 'MessageRateExceeded' },
            },
          },
        }),
      })) as any;

      const res = await checkExpoPushReceipts({
        'ticket-ok': 'ExponentPushToken[ok]',
        'ticket-unreg': 'ExponentPushToken[stale]',
        'ticket-rate': 'ExponentPushToken[throttled]',
      });

      assert.deepStrictEqual(res.invalidTokens, ['ExponentPushToken[stale]']);
      assert.strictEqual(res.errors.length, 2);
      assert.deepStrictEqual(prunedBatches, [['ExponentPushToken[stale]']]);
    });
  } finally {
    (pool as any).query = originalQuery;
    global.fetch = originalFetch;
  }

  console.log('\n===============================================================');
  console.log('EXPO PUSH SERVICE VERIFICATION COMPLETE: ALL CHECKS PASSED');
  console.log('===============================================================\n');
}

void main();

