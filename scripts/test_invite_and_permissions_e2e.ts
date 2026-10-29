/**
 * SureStep — scripts/test_invite_and_permissions_e2e.ts
 *
 * End-to-end verification of:
 * 1. 6-digit invite code generation.
 * 2. Multi-role redemption: Patient, Caregiver, Family Member submitting join requests.
 * 3. Owner review and acceptance:
 *    - Patient: added to patient_circle_associations + care_circle_members + assigned to existing caregivers.
 *    - Caregiver: added to care_circle_members + relationship established & active + assigned to circle patients.
 *    - Family: added to care_circle_members.
 * 4. Intrinsic Owner Authority: Owner gets all 4 permissions by default in getCircleMembers.
 * 5. Delegated Permissions: Updating member permissions via setMemberPermissions.
 */

import 'dotenv/config';
import assert from 'node:assert';
import pool from '../db/config';
import { careCirclesService } from '../modules/care-circles/care-circles.service';
import { invitationsService } from '../modules/care-circles/invitations.service';
import { permissionsService } from '../modules/care-circles/permissions.service';
import { CanonicalPermissionName } from '../modules/care-circles/care-circles.types';

async function runE2ETest() {
  console.log('======================================================================');
  console.log('SURESTEP E2E: INVITE CODES & PERMISSIONS VERIFICATION');
  console.log('======================================================================\n');

  const runId = Date.now();

  async function createUser(role: 'FAMILY' | 'CAREGIVER' | 'PATIENT', label: string) {
    const uid = `fb-${label}-${runId}-${Math.floor(Math.random() * 10000)}`;
    const email = `${label}-${runId}-${Math.floor(Math.random() * 10000)}@test.com`;
    const phone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
    const name = `Test ${label} ${runId}`;

    const res = await pool.query(
      `INSERT INTO users (firebase_uid, email, phone, role, name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, firebase_uid, email, phone, role, name`,
      [uid, email, phone, role, name]
    );
    return res.rows[0];
  }

  const createdUserIds: string[] = [];
  let circleId: string | null = null;

  try {
    // 1. Create Actors
    const owner = await createUser('FAMILY', 'Owner');
    const patient = await createUser('PATIENT', 'Patient');
    const caregiver = await createUser('CAREGIVER', 'Caregiver');
    const familyMember = await createUser('FAMILY', 'FamilyMember');
    createdUserIds.push(owner.id, patient.id, caregiver.id, familyMember.id);

    console.log(`Created test actors:`);
    console.log(`  Owner:        ${owner.id}`);
    console.log(`  Patient:      ${patient.id}`);
    console.log(`  Caregiver:    ${caregiver.id}`);
    console.log(`  FamilyMember: ${familyMember.id}\n`);

    // 2. Create Care Circle
    console.log('--- Step 1: Create Care Circle ---');
    const circle = await careCirclesService.createCareCircle(owner.id, `Circle-${runId}`);
    circleId = circle.id;
    assert.strictEqual(circle.owner_id, owner.id);
    console.log(`✓ Circle created: ${circle.id} (${circle.name})\n`);

    // 3. Test Patient Join Request & Acceptance
    console.log('--- Step 2: Patient Join Flow ---');
    const inv1 = await invitationsService.generateInvitation(circle.id, owner.id);
    assert.match(inv1.code, /^[0-9]{6}$/);
    console.log(`✓ Generated 6-digit code for Patient: ${inv1.code}`);

    const reqPatient = await invitationsService.submitJoinRequest(inv1.code, patient.id);
    assert.strictEqual(reqPatient.status, 'PENDING');
    assert.strictEqual(reqPatient.circle_id, circle.id);
    console.log(`✓ Patient submitted join request (status: PENDING)`);

    await invitationsService.reviewJoinRequest(reqPatient.id, owner.id, { decision: 'ACCEPTED' });
    console.log(`✓ Owner accepted Patient join request`);

    const patientsAfter = await careCirclesService.getCirclePatients(circle.id);
    assert.strictEqual(patientsAfter.length, 1);
    assert.strictEqual(patientsAfter[0].id, patient.id);
    console.log(`✓ Patient confirmed in getCirclePatients: ${patientsAfter[0].id}\n`);

    // 4. Test Caregiver Join Request & Acceptance
    console.log('--- Step 3: Caregiver Join Flow ---');
    const inv2 = await invitationsService.generateInvitation(circle.id, owner.id);
    assert.match(inv2.code, /^[0-9]{6}$/);
    console.log(`✓ Generated 6-digit code for Caregiver: ${inv2.code}`);

    const reqCaregiver = await invitationsService.submitJoinRequest(inv2.code, caregiver.id);
    assert.strictEqual(reqCaregiver.status, 'PENDING');
    console.log(`✓ Caregiver submitted join request (status: PENDING)`);

    await invitationsService.reviewJoinRequest(reqCaregiver.id, owner.id, { decision: 'ACCEPTED' });
    console.log(`✓ Owner accepted Caregiver join request`);

    // Verify caregiver relationship and assignment
    const relRes = await pool.query(
      `SELECT status FROM caregiver_relationships WHERE caregiver_id = $1 AND circle_id = $2`,
      [caregiver.id, circle.id]
    );
    assert.strictEqual(relRes.rows[0]?.status, 'ACTIVE');
    console.log(`✓ Caregiver relationship established & ACTIVE`);

    const assignRes = await pool.query(
      `SELECT pa.is_active FROM patient_assignments pa
       JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
       WHERE cr.caregiver_id = $1 AND pa.patient_id = $2`,
      [caregiver.id, patient.id]
    );
    assert.strictEqual(assignRes.rows[0]?.is_active, true);
    console.log(`✓ Caregiver automatically assigned to circle patient`);

    // 5. Test Family Member Join Request & Acceptance
    console.log('\n--- Step 4: Family Member Join Flow ---');
    const inv3 = await invitationsService.generateInvitation(circle.id, owner.id);
    const reqFamily = await invitationsService.submitJoinRequest(inv3.code, familyMember.id);
    await invitationsService.reviewJoinRequest(reqFamily.id, owner.id, { decision: 'ACCEPTED' });
    console.log(`✓ Family member join request accepted`);

    // 6. Test Circle Members and Intrinsic Owner Authority
    console.log('\n--- Step 5: Members & Owner Authority ---');
    const members = await careCirclesService.getCircleMembers(circle.id);
    console.log(`Total circle members returned: ${members.length}`);

    const ownerMember = members.find((m) => m.user_id === owner.id);
    assert(ownerMember, 'Owner member must be present');
    assert.strictEqual(ownerMember.role_in_circle, 'OWNER');
    assert.strictEqual(ownerMember.is_owner, true);
    assert.strictEqual(ownerMember.permissions.length, 4, 'Owner must have all 4 canonical permissions by default');
    console.log(`✓ Owner has all 4 canonical permissions intrinsically:`, ownerMember.permissions);

    const familyMemberRecord = members.find((m) => m.user_id === familyMember.id);
    assert(familyMemberRecord, 'Family member record must be present');
    assert.strictEqual(familyMemberRecord.permissions.length, 0, 'New family member starts with 0 permissions');
    console.log(`✓ Family member starts with 0 permissions`);

    // 7. Test Setting Delegated Permissions
    console.log('\n--- Step 6: Delegated Permissions Delegation ---');
    const permsToGrant: CanonicalPermissionName[] = [
      'Search/Request Caregivers',
      'Manage Patient Memories',
    ];

    await permissionsService.setMemberPermissions(
      circle.id,
      owner.id,
      familyMemberRecord.id,
      permsToGrant
    );
    console.log(`✓ setMemberPermissions executed for member ${familyMemberRecord.id}`);

    const membersAfterPerms = await careCirclesService.getCircleMembers(circle.id);
    const updatedFamily = membersAfterPerms.find((m) => m.user_id === familyMember.id);
    assert(updatedFamily, 'Updated family member must be present');
    assert.strictEqual(updatedFamily.permissions.length, 2);
    assert(updatedFamily.permissions.includes('Search/Request Caregivers'));
    assert(updatedFamily.permissions.includes('Manage Patient Memories'));
    console.log(`✓ Updated family member permissions confirmed:`, updatedFamily.permissions);

    // Update again to change (remove one, add another)
    const permsUpdate: CanonicalPermissionName[] = [
      'Manage Caregiver Relationships',
    ];
    await permissionsService.setMemberPermissions(
      circle.id,
      owner.id,
      familyMemberRecord.id,
      permsUpdate
    );
    const membersFinal = await careCirclesService.getCircleMembers(circle.id);
    const finalFamily = membersFinal.find((m) => m.user_id === familyMember.id);
    assert.strictEqual(finalFamily?.permissions.length, 1);
    assert.strictEqual(finalFamily?.permissions[0], 'Manage Caregiver Relationships');
    console.log(`✓ Atomic permissions update confirmed:`, finalFamily?.permissions);

    console.log('\n======================================================================');
    console.log('✓ ALL END-TO-END TESTS PASSED SUCCESSFULLY');
    console.log('======================================================================');
  } finally {
    // Cleanup in foreign key dependency order
    if (circleId) {
      await pool.query('DELETE FROM patient_assignments WHERE relationship_id IN (SELECT id FROM caregiver_relationships WHERE circle_id = $1)', [circleId]).catch(() => {});
      await pool.query('DELETE FROM caregiver_relationships WHERE circle_id = $1', [circleId]).catch(() => {});
      await pool.query('DELETE FROM patient_circle_associations WHERE circle_id = $1', [circleId]).catch(() => {});
      await pool.query('DELETE FROM circle_join_requests WHERE circle_id = $1', [circleId]).catch(() => {});
      await pool.query('DELETE FROM circle_invitations WHERE circle_id = $1', [circleId]).catch(() => {});
      await pool.query('DELETE FROM circle_permissions WHERE member_id IN (SELECT id FROM care_circle_members WHERE circle_id = $1)', [circleId]).catch(() => {});
      await pool.query('DELETE FROM care_circle_members WHERE circle_id = $1', [circleId]).catch(() => {});
      await pool.query('DELETE FROM care_circles WHERE id = $1', [circleId]).catch(() => {});
    }
    for (const uid of createdUserIds) {
      await pool.query('DELETE FROM users WHERE id = $1', [uid]).catch(() => {});
    }
    await pool.end();
  }
}

runE2ETest().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
