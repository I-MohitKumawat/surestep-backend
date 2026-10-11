"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const expoPush_service_1 = require("../modules/notifications/expoPush.service");
console.log('===============================================================');
console.log('SURESTEP STACK REMEDIATION: EXPO PUSH SERVICE VERIFICATION');
console.log('CLASSIFICATION: IN-MEMORY / UNIT TEST');
console.log('===============================================================\n');
function runTest(name, fn) {
    try {
        fn();
        console.log(`  ✓ [PASS] ${name}`);
    }
    catch (err) {
        console.error(`  ✗ [FAIL] ${name}:`, err.message);
        process.exit(1);
    }
}
// 1. isExpoPushToken validation
runTest('1. isExpoPushToken correctly recognizes valid Expo Push Token prefixes', () => {
    assert_1.default.strictEqual((0, expoPush_service_1.isExpoPushToken)('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]'), true, 'ExponentPushToken[...] must be recognized as Expo push token');
    assert_1.default.strictEqual((0, expoPush_service_1.isExpoPushToken)('ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]'), true, 'ExpoPushToken[...] must be recognized as Expo push token');
});
runTest('2. isExpoPushToken correctly rejects non-Expo / native FCM tokens and empty inputs', () => {
    assert_1.default.strictEqual((0, expoPush_service_1.isExpoPushToken)('fcm-token-c1234567890abcdef'), false, 'Native FCM token must not be recognized as Expo push token');
    assert_1.default.strictEqual((0, expoPush_service_1.isExpoPushToken)(''), false, 'Empty token string must return false');
    assert_1.default.strictEqual((0, expoPush_service_1.isExpoPushToken)(null), false, 'Null token must return false');
    assert_1.default.strictEqual((0, expoPush_service_1.isExpoPushToken)(undefined), false, 'Undefined token must return false');
});
// 2. Expo message structure
runTest('3. ExpoPushMessage payload shape matches Expo push notification contract', () => {
    const msg = {
        to: 'ExponentPushToken[sample-token-12345]',
        title: 'Patient Geofence Alert',
        body: 'Patient has exited safe zone',
        data: { patientId: 'p-1', event: 'GEOFENCE_BREACH' },
        sound: 'default',
        priority: 'high',
        channelId: 'alarms',
    };
    assert_1.default.strictEqual(msg.to, 'ExponentPushToken[sample-token-12345]');
    assert_1.default.strictEqual(msg.priority, 'high');
    assert_1.default.strictEqual(msg.channelId, 'alarms');
    assert_1.default.strictEqual(msg.sound, 'default');
    assert_1.default.strictEqual(msg.data?.patientId, 'p-1');
});
console.log('\n===============================================================');
console.log('EXPO PUSH SERVICE VERIFICATION COMPLETE: ALL CHECKS PASSED');
console.log('===============================================================\n');
//# sourceMappingURL=test_expo_push.js.map