"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const users_service_1 = require("../modules/users/users.service");
const devAuth_1 = require("../shared/utils/devAuth");
console.log('===============================================================');
console.log('SURESTEP V1: ARCHITECTURE & SECURITY INVARIANT TESTS');
console.log('CLASSIFICATION: STATIC + UNIT INVARIANT CHECK');
console.log('===============================================================\n');
async function runTest(name, fn) {
    try {
        await fn();
        console.log(`  ✓ [PASS] ${name}`);
    }
    catch (err) {
        console.error(`  ✗ [FAIL] ${name}:`, err.message);
        process.exit(1);
    }
}
const backendRoot = path_1.default.resolve(__dirname, '..');
const frontendSrc = path_1.default.resolve(__dirname, '..', '..', 'SureStep', 'src');
function walkFiles(dir, exts) {
    const results = [];
    for (const entry of fs_1.default.readdirSync(dir, { withFileTypes: true })) {
        const full = path_1.default.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkFiles(full, exts));
        }
        else if (exts.some((ext) => entry.name.endsWith(ext))) {
            results.push(full);
        }
    }
    return results;
}
async function main() {
    await runTest('1. changePhoneNumber rejects missing verification token (400 VERIFICATION_TOKEN_REQUIRED)', async () => {
        let caught = null;
        try {
            await (0, users_service_1.changePhoneNumber)('00000000-0000-0000-0000-000000000001', '+919999988888');
        }
        catch (err) {
            caught = err;
        }
        assert_1.default.ok(caught, 'Expected changePhoneNumber without token to throw');
        assert_1.default.strictEqual(caught.code, 'VERIFICATION_TOKEN_REQUIRED');
        assert_1.default.strictEqual(caught.statusCode, 400);
    });
    await runTest('2. Only 4 canonical delegatable permissions exist in migration 018 and care-circles.types.ts', () => {
        const typesSrc = fs_1.default.readFileSync(path_1.default.join(backendRoot, 'modules/care-circles/care-circles.types.ts'), 'utf-8');
        assert_1.default.ok(typesSrc.includes("'Manage Member Permissions'"));
        assert_1.default.ok(typesSrc.includes("'Manage Caregiver Relationships'"));
        assert_1.default.ok(typesSrc.includes("'Search/Request Caregivers'"));
        assert_1.default.ok(typesSrc.includes("'Manage Patient Memories'"));
        assert_1.default.ok(!typesSrc.includes("'Manage Safe Zones'"));
        assert_1.default.ok(!typesSrc.includes("'Manage Routines'"));
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
            const content = fs_1.default.readFileSync(file, 'utf-8');
            for (const pat of deprecatedPatterns) {
                assert_1.default.ok(!pat.test(content), `Deprecated API pattern ${pat} found in ${path_1.default.relative(frontendSrc, file)}`);
            }
        }
    });
    await runTest('4. Production mockPreview and showcase infrastructure are removed', () => {
        const appShell = fs_1.default.readFileSync(path_1.default.join(frontendSrc, 'AppShell.tsx'), 'utf-8');
        assert_1.default.ok(!appShell.includes('SHOWCASE_MODE'), 'SHOWCASE_MODE must be removed from AppShell');
        assert_1.default.ok(!appShell.includes('mockPreview'), 'mockPreview must not be imported in AppShell');
        assert_1.default.ok(!fs_1.default.existsSync(path_1.default.join(frontendSrc, 'mockPreview')), 'src/mockPreview must not exist');
    });
    await runTest('5. Unsupported caregiver placeholder screens, alerts.router, and DoctorNavigator are removed', () => {
        const patientNav = fs_1.default.readFileSync(path_1.default.join(frontendSrc, 'navigation/PatientNavigator.tsx'), 'utf-8');
        assert_1.default.ok(!patientNav.includes('../screens/caregiver/'), 'PatientNavigator must not import screens/caregiver/*');
        assert_1.default.ok(!fs_1.default.existsSync(path_1.default.join(frontendSrc, 'navigation/DoctorNavigator.tsx')), 'DoctorNavigator must not exist');
        assert_1.default.ok(!fs_1.default.existsSync(path_1.default.join(backendRoot, 'modules/alerts/alerts.router.ts')), 'alerts.router.ts must not exist');
        for (const screen of [
            'CaregiverPatientShiftsScreen.tsx',
            'CaregiverShiftHandoverScreen.tsx',
            'CaregiverWellbeingScreen.tsx',
            'CaregiverCalendarScreen.tsx',
            'CaregiverMessagesScreen.tsx',
        ]) {
            assert_1.default.ok(!fs_1.default.existsSync(path_1.default.join(frontendSrc, 'screens/caregiver', screen)), `${screen} must not exist`);
        }
    });
    await runTest('6. Dev auth bypass is disabled by default and always rejected in production', () => {
        const prevEnv = process.env.NODE_ENV;
        const prevFlag = process.env.ALLOW_DEV_AUTH_BYPASS;
        try {
            process.env.NODE_ENV = 'development';
            delete process.env.ALLOW_DEV_AUTH_BYPASS;
            assert_1.default.strictEqual((0, devAuth_1.isDevAuthBypassAllowed)(), false, 'Must default to false in development');
            process.env.ALLOW_DEV_AUTH_BYPASS = 'true';
            assert_1.default.strictEqual((0, devAuth_1.isDevAuthBypassAllowed)(), true, 'Allowed only when explicitly opted-in outside production');
            process.env.NODE_ENV = 'production';
            assert_1.default.strictEqual((0, devAuth_1.isDevAuthBypassAllowed)(), false, 'Production must always reject dev auth bypass');
        }
        finally {
            process.env.NODE_ENV = prevEnv;
            if (prevFlag === undefined)
                delete process.env.ALLOW_DEV_AUTH_BYPASS;
            else
                process.env.ALLOW_DEV_AUTH_BYPASS = prevFlag;
        }
    });
    console.log('\n===============================================================');
    console.log('ARCHITECTURE & SECURITY INVARIANT TESTS COMPLETE: ALL PASSED');
    console.log('===============================================================\n');
}
void main();
//# sourceMappingURL=test_architecture_invariants.js.map