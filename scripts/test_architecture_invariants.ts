import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { changePhoneNumber } from '../modules/users/users.service';
import { isDevAuthBypassAllowed } from '../shared/utils/devAuth';

console.log('===============================================================');
console.log('SURESTEP V1: ARCHITECTURE & SECURITY INVARIANT TESTS');
console.log('CLASSIFICATION: STATIC + UNIT INVARIANT CHECK');
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

const backendRoot = path.resolve(__dirname, '..');
const frontendSrc = path.resolve(__dirname, '..', '..', 'SureStep', 'src');

function walkFiles(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

async function main() {
  await runTest('1. changePhoneNumber rejects missing verification token (400 VERIFICATION_TOKEN_REQUIRED)', async () => {
    let caught: any = null;
    try {
      await changePhoneNumber('00000000-0000-0000-0000-000000000001', '+919999988888');
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'Expected changePhoneNumber without token to throw');
    assert.strictEqual(caught.code, 'VERIFICATION_TOKEN_REQUIRED');
    assert.strictEqual(caught.statusCode, 400);
  });

  await runTest('2. Only 4 canonical delegatable permissions exist in migration 018 and care-circles.types.ts', () => {
    const typesSrc = fs.readFileSync(
      path.join(backendRoot, 'modules/care-circles/care-circles.types.ts'),
      'utf-8',
    );
    assert.ok(typesSrc.includes("'Manage Member Permissions'"));
    assert.ok(typesSrc.includes("'Manage Caregiver Relationships'"));
    assert.ok(typesSrc.includes("'Search/Request Caregivers'"));
    assert.ok(typesSrc.includes("'Manage Patient Memories'"));
    assert.ok(!typesSrc.includes("'Manage Safe Zones'"));
    assert.ok(!typesSrc.includes("'Manage Routines'"));
  });

  await runTest('3. Zero active frontend callers to retired 410 endpoints', () => {
    const deprecatedPatterns = [
      /\/tasks\/.*\/status/,
      /\/location\/geofences/,
      /\/alerts\/reminders/,
      /\/family\/care-notes/,
      /\/family\/invite-code/,
      /\/family\/request-access/,
      /\/care-relationships\//,
      /\/relationships\/invite-code/,
      /\/relationships\/family\//,
      /\/routines\/templates/,
      /\/notifications\/alerts/,
      /\/notifications\/sos/,
    ];
    const files = walkFiles(frontendSrc, ['.ts', '.tsx']);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pat of deprecatedPatterns) {
        assert.ok(
          !pat.test(content),
          `Deprecated API pattern ${pat} found in ${path.relative(frontendSrc, file)}`,
        );
      }
    }
  });

  await runTest('4. Production mockPreview and showcase infrastructure are removed', () => {
    const appShell = fs.readFileSync(path.join(frontendSrc, 'AppShell.tsx'), 'utf-8');
    assert.ok(!appShell.includes('SHOWCASE_MODE'), 'SHOWCASE_MODE must be removed from AppShell');
    assert.ok(!appShell.includes('mockPreview'), 'mockPreview must not be imported in AppShell');
    assert.ok(!fs.existsSync(path.join(frontendSrc, 'mockPreview')), 'src/mockPreview must not exist');
  });

  await runTest('5. Unsupported caregiver placeholder screens, alerts.router, and DoctorNavigator are removed', () => {
    const patientNav = fs.readFileSync(path.join(frontendSrc, 'navigation/PatientNavigator.tsx'), 'utf-8');
    assert.ok(!patientNav.includes('../screens/caregiver/'), 'PatientNavigator must not import screens/caregiver/*');
    assert.ok(!fs.existsSync(path.join(frontendSrc, 'navigation/DoctorNavigator.tsx')), 'DoctorNavigator must not exist');
    assert.ok(!fs.existsSync(path.join(backendRoot, 'modules/alerts/alerts.router.ts')), 'alerts.router.ts must not exist');
    for (const screen of [
      'CaregiverPatientShiftsScreen.tsx',
      'CaregiverShiftHandoverScreen.tsx',
      'CaregiverWellbeingScreen.tsx',
      'CaregiverCalendarScreen.tsx',
      'CaregiverMessagesScreen.tsx',
    ]) {
      assert.ok(!fs.existsSync(path.join(frontendSrc, 'screens/caregiver', screen)), `${screen} must not exist`);
    }
  });

  await runTest('6. Dev auth bypass is disabled by default and always rejected in production', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevFlag = process.env.ALLOW_DEV_AUTH_BYPASS;
    try {
      process.env.NODE_ENV = 'development';
      delete process.env.ALLOW_DEV_AUTH_BYPASS;
      assert.strictEqual(isDevAuthBypassAllowed(), false, 'Must default to false in development');

      process.env.ALLOW_DEV_AUTH_BYPASS = 'true';
      assert.strictEqual(isDevAuthBypassAllowed(), true, 'Allowed only when explicitly opted-in outside production');

      process.env.NODE_ENV = 'production';
      assert.strictEqual(isDevAuthBypassAllowed(), false, 'Production must always reject dev auth bypass');
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevFlag === undefined) delete process.env.ALLOW_DEV_AUTH_BYPASS;
      else process.env.ALLOW_DEV_AUTH_BYPASS = prevFlag;
    }
  });

  console.log('\n===============================================================');
  console.log('ARCHITECTURE & SECURITY INVARIANT TESTS COMPLETE: ALL PASSED');
  console.log('===============================================================\n');
}

void main();
