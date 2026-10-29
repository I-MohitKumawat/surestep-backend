"use strict";
/**
 * SureStep Backend — test_memories_and_relationships.ts
 *
 * Verifies backend updates for the My People experience:
 *  1. relationships.service queries select user phone number.
 *  2. authoritative-memories.service getMemories supports personId filtering.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const config_1 = __importDefault(require("../db/config"));
const authoritative_memories_service_1 = require("../modules/memories/authoritative-memories.service");
const relationships_service_1 = require("../modules/relationships/relationships.service");
async function run() {
    console.log('======================================================================');
    console.log('BACKEND MEMORIES & RELATIONSHIPS VERIFICATION');
    console.log('======================================================================\n');
    // Find a test patient in DB
    const { rows: patients } = await config_1.default.query(`SELECT u.id, u.phone FROM users u WHERE u.role = 'PATIENT' LIMIT 1`);
    if (patients.length === 0) {
        console.log('No patient in database, skipping DB-dependent check.');
        return;
    }
    const patientId = patients[0].id;
    console.log(`Using patient: ${patientId}`);
    // Test 1: getMyFamily returns phone property
    const family = await (0, relationships_service_1.getMyFamily)(patientId, 'PATIENT');
    console.log(`  ✓ getMyFamily returned ${family.length} members`);
    if (family.length > 0) {
        assert_1.default.ok('phone' in family[0], 'Family member must include phone field');
        console.log(`  ✓ Family member has phone property: ${family[0].phone}`);
    }
    // Test 2: getMyCaregivers returns phone property
    const caregivers = await (0, relationships_service_1.getMyCaregivers)(patientId);
    console.log(`  ✓ getMyCaregivers returned ${caregivers.length} caregivers`);
    if (caregivers.length > 0) {
        assert_1.default.ok('phone' in caregivers[0], 'Caregiver must include phone field');
        console.log(`  ✓ Caregiver has phone property: ${caregivers[0].phone}`);
    }
    // Test 3: getMemories accepts personId filter
    const allMemories = await authoritative_memories_service_1.authoritativeMemoriesService.getMemories(patientId, 10);
    console.log(`  ✓ getMemories (all) returned ${allMemories.memories.length} memories`);
    const filteredMemories = await authoritative_memories_service_1.authoritativeMemoriesService.getMemories(patientId, 10, undefined, '00000000-0000-0000-0000-000000000000');
    console.log(`  ✓ getMemories with personId filter executed without SQL error`);
    assert_1.default.ok(Array.isArray(filteredMemories.memories), 'Should return memories array');
    console.log('\nAll backend checks passed successfully!\n');
    await config_1.default.end();
}
run().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
//# sourceMappingURL=test_memories_and_relationships.js.map