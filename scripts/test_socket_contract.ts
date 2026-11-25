import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('===============================================================');
console.log('SURESTEP STACK REMEDIATION: SOCKET.IO CONTRACT VERIFICATION');
console.log('CLASSIFICATION: STATIC CONTRACT / PRODUCER-CONSUMER TEST');
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

const backendRoot = path.resolve(__dirname, '..');
const frontendRoot = path.resolve(__dirname, '..', '..', 'SureStep', 'src');

const careRequestsService = fs.readFileSync(
  path.join(backendRoot, 'modules/care-requests/care-requests.service.ts'),
  'utf-8',
);
const careRequestsListScreen = fs.readFileSync(
  path.join(frontendRoot, 'screens/shared/CareRequestsListScreen.tsx'),
  'utf-8',
);
const careRequestDetailScreen = fs.readFileSync(
  path.join(frontendRoot, 'screens/shared/CareRequestDetailScreen.tsx'),
  'utf-8',
);

const CARE_REQUEST_EVENTS = [
  'care_request:created',
  'care_request:accepted',
  'care_request:declined',
  'care_request:withdrawn',
  'care_request:expired',
] as const;

runTest('1. Backend emits care_request:created (and not legacy care_request:received)', () => {
  assert.ok(
    careRequestsService.includes("'care_request:created'"),
    'Backend care-requests.service.ts must emit care_request:created',
  );
  assert.ok(
    !careRequestsService.includes("'care_request:received'"),
    'Backend care-requests.service.ts must not emit legacy care_request:received',
  );
});

runTest('2. Frontend CareRequestsListScreen subscribes and cleans up all care_request:* events', () => {
  for (const event of CARE_REQUEST_EVENTS) {
    assert.ok(
      careRequestsListScreen.includes(`socket.on('${event}'`),
      `CareRequestsListScreen must listen for ${event}`,
    );
    assert.ok(
      careRequestsListScreen.includes(`socket.off('${event}'`),
      `CareRequestsListScreen must clean up ${event} on unmount`,
    );
  }
});

runTest('3. Frontend CareRequestDetailScreen subscribes and cleans up status transition events', () => {
  for (const event of CARE_REQUEST_EVENTS.filter((e) => e !== 'care_request:created')) {
    assert.ok(
      careRequestDetailScreen.includes(`socket.on('${event}'`),
      `CareRequestDetailScreen must listen for ${event}`,
    );
    assert.ok(
      careRequestDetailScreen.includes(`socket.off('${event}'`),
      `CareRequestDetailScreen must clean up ${event} on unmount`,
    );
  }
});

runTest('4. Backend emits every care_request:* lifecycle event produced in care-requests.service.ts', () => {
  for (const event of CARE_REQUEST_EVENTS) {
    assert.ok(
      careRequestsService.includes(`.emit('${event}'`),
      `Backend care-requests.service.ts must emit ${event}`,
    );
  }
});

console.log('\n===============================================================');
console.log('SOCKET.IO CONTRACT VERIFICATION COMPLETE: ALL CHECKS PASSED');
console.log('===============================================================\n');
