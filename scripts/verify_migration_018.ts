import pool from '../db/config';

async function verify() {
  console.log('--- 1. Verifying Table Existence ---');
  const tables = [
    'care_circles',
    'care_circle_members',
    'circle_permissions',
    'patient_circle_associations',
    'circle_invitations',
    'circle_join_requests',
    'caregiver_relationships',
    'patient_assignments',
  ];

  for (const table of tables) {
    const res = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    if (res.rows.length === 1) {
      console.log(`  ✓ Table exists: ${table}`);
    } else {
      throw new Error(`Missing table: ${table}`);
    }
  }

  console.log('\n--- 2. Verifying Constraints, Keys & Invariants ---');

  // Insert test users with unique identifiers
  const runId = Date.now();
  const u1 = await pool.query(
    `INSERT INTO users (firebase_uid, email, phone, name, role)
     VALUES ($1, $2, $3, 'Alice Owner', 'FAMILY')
     RETURNING id`,
    [`fb-owner-${runId}`, `owner-${runId}@test.com`, `+91987${String(runId).slice(-7)}`]
  );
  const ownerId = u1.rows[0].id;

  const u2 = await pool.query(
    `INSERT INTO users (firebase_uid, email, phone, name, role)
     VALUES ($1, $2, $3, 'Bob Patient', 'PATIENT')
     RETURNING id`,
    [`fb-patient-${runId}`, `patient-${runId}@test.com`, `+91986${String(runId).slice(-7)}`]
  );
  const patientId = u2.rows[0].id;

  const u3 = await pool.query(
    `INSERT INTO users (firebase_uid, email, phone, name, role)
     VALUES ($1, $2, $3, 'Carol Caregiver', 'CAREGIVER')
     RETURNING id`,
    [`fb-cg-${runId}`, `cg-${runId}@test.com`, `+91985${String(runId).slice(-7)}`]
  );
  const cgId = u3.rows[0].id;
  console.log('  ✓ Test seed users created (FAMILY, PATIENT, CAREGIVER)');

  // 1. care_circles
  const c1 = await pool.query(
    `INSERT INTO care_circles (name, owner_id) VALUES ('Greenwood Family Circle', $1) RETURNING id`,
    [ownerId]
  );
  const circleId = c1.rows[0].id;
  console.log(`  ✓ Inserted care_circle (id: ${circleId})`);

  // Test single active circle owner invariant (partial unique index)
  try {
    await pool.query(
      `INSERT INTO care_circles (name, owner_id) VALUES ('Second Active Circle', $1)`,
      [ownerId]
    );
    throw new Error('FAILED: Should have rejected duplicate active circle for same owner');
  } catch (err: any) {
    if (err.message.includes('idx_uq_active_care_circle_owner')) {
      console.log('  ✓ Enforced idx_uq_active_care_circle_owner (single active circle per owner)');
    } else throw err;
  }

  // 2. care_circle_members
  const m1 = await pool.query(
    `INSERT INTO care_circle_members (circle_id, user_id, role_in_circle)
     VALUES ($1, $2, 'OWNER') RETURNING id`,
    [circleId, ownerId]
  );
  const memberId = m1.rows[0].id;
  console.log(`  ✓ Inserted care_circle_members row for Owner (id: ${memberId})`);

  // Test invalid role_in_circle check constraint
  try {
    await pool.query(
      `INSERT INTO care_circle_members (circle_id, user_id, role_in_circle)
       VALUES ($1, $2, 'UNAUTHORIZED_ROLE')`,
      [circleId, cgId]
    );
    throw new Error('FAILED: Should have rejected invalid role_in_circle');
  } catch (err: any) {
    if (err.message.includes('chk_role_in_circle')) {
      console.log('  ✓ Enforced chk_role_in_circle check constraint (OWNER, MEMBER, CAREGIVER)');
    } else throw err;
  }

  // 3. circle_permissions
  const p1 = await pool.query(
    `INSERT INTO circle_permissions (member_id, permission_name, granted_by)
     VALUES ($1, 'Manage Member Permissions', $2) RETURNING id`,
    [memberId, ownerId]
  );
  console.log(`  ✓ Inserted canonical delegated permission (id: ${p1.rows[0].id})`);

  // Test unratified permission name rejection
  try {
    await pool.query(
      `INSERT INTO circle_permissions (member_id, permission_name, granted_by)
       VALUES ($1, 'Routine Management Authority', $2)`,
      [memberId, ownerId]
    );
    throw new Error('FAILED: Should have rejected non-canonical permission name');
  } catch (err: any) {
    if (err.message.includes('chk_canonical_permission_name')) {
      console.log('  ✓ Enforced chk_canonical_permission_name (strictly 4 canonical permissions)');
    } else throw err;
  }

  // 4. patient_circle_associations
  const pca = await pool.query(
    `INSERT INTO patient_circle_associations (circle_id, patient_id, associated_by)
     VALUES ($1, $2, $3) RETURNING id`,
    [circleId, patientId, ownerId]
  );
  console.log(`  ✓ Inserted patient_circle_association (id: ${pca.rows[0].id})`);

  // Test duplicate patient association rejection
  try {
    await pool.query(
      `INSERT INTO patient_circle_associations (circle_id, patient_id, associated_by)
       VALUES ($1, $2, $3)`,
      [circleId, patientId, ownerId]
    );
    throw new Error('FAILED: Should have rejected duplicate patient association');
  } catch (err: any) {
    if (err.message.includes('uq_patient_circle_association')) {
      console.log('  ✓ Enforced uq_patient_circle_association unique constraint');
    } else throw err;
  }

  // 5. circle_invitations
  const testCode = String(100000 + Math.floor(Math.random() * 900000));
  const inv = await pool.query(
    `INSERT INTO circle_invitations (circle_id, code, created_by, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '72 hours') RETURNING id`,
    [circleId, testCode, ownerId]
  );
  const invId = inv.rows[0].id;
  console.log(`  ✓ Inserted 6-digit numeric circle_invitation (id: ${invId}, code: ${testCode})`);

  // Test non-digit / alphanumeric code rejection
  try {
    await pool.query(
      `INSERT INTO circle_invitations (circle_id, code, created_by, expires_at)
       VALUES ($1, 'ABC123', $2, NOW() + INTERVAL '72 hours')`,
      [circleId, ownerId]
    );
    throw new Error('FAILED: Should have rejected alphanumeric invitation code');
  } catch (err: any) {
    if (err.message.includes('chk_circle_invitation_code_format')) {
      console.log('  ✓ Enforced chk_circle_invitation_code_format (strictly 6 numeric digits ^[0-9]{6}$)');
    } else throw err;
  }

  // 6. circle_join_requests
  const jr = await pool.query(
    `INSERT INTO circle_join_requests (circle_id, user_id, invitation_id)
     VALUES ($1, $2, $3) RETURNING id`,
    [circleId, patientId, invId]
  );
  console.log(`  ✓ Inserted circle_join_request (id: ${jr.rows[0].id})`);

  // Test duplicate pending join request rejection
  try {
    await pool.query(
      `INSERT INTO circle_join_requests (circle_id, user_id, invitation_id)
       VALUES ($1, $2, $3)`,
      [circleId, patientId, invId]
    );
    throw new Error('FAILED: Should have rejected duplicate pending join request');
  } catch (err: any) {
    if (err.message.includes('idx_uq_pending_circle_join_request')) {
      console.log('  ✓ Enforced idx_uq_pending_circle_join_request partial unique index');
    } else throw err;
  }

  // 7. caregiver_relationships
  const cr = await pool.query(
    `INSERT INTO caregiver_relationships (circle_id, caregiver_id, status)
     VALUES ($1, $2, 'ACTIVE') RETURNING id`,
    [circleId, cgId]
  );
  const crId = cr.rows[0].id;
  console.log(`  ✓ Inserted caregiver_relationship (id: ${crId})`);

  // Test invalid caregiver relationship status
  try {
    await pool.query(
      `INSERT INTO caregiver_relationships (circle_id, caregiver_id, status)
       VALUES ($1, $2, 'RESIGNED')`,
      [circleId, cgId]
    );
    throw new Error('FAILED: Should have rejected invalid relationship status');
  } catch (err: any) {
    if (err.message.includes('chk_caregiver_relationship_status')) {
      console.log('  ✓ Enforced chk_caregiver_relationship_status (canonical lifecycles only)');
    } else throw err;
  }

  // 8. patient_assignments
  const pa = await pool.query(
    `INSERT INTO patient_assignments (relationship_id, patient_id, assigned_by)
     VALUES ($1, $2, $3) RETURNING id`,
    [crId, patientId, ownerId]
  );
  console.log(`  ✓ Inserted patient_assignment (id: ${pa.rows[0].id})`);

  // Test duplicate patient assignment rejection
  try {
    await pool.query(
      `INSERT INTO patient_assignments (relationship_id, patient_id, assigned_by)
       VALUES ($1, $2, $3)`,
      [crId, patientId, ownerId]
    );
    throw new Error('FAILED: Should have rejected duplicate patient assignment');
  } catch (err: any) {
    if (err.message.includes('uq_relationship_patient_assignment')) {
      console.log('  ✓ Enforced uq_relationship_patient_assignment unique constraint');
    } else throw err;
  }

  console.log('\n--- 3. Verifying Account Deletion Restrictive Behavior (Zero Silent Cascades) ---');

  // Test 1: Deleting circle owner is blocked by ON DELETE RESTRICT
  try {
    await pool.query(`DELETE FROM users WHERE id = $1`, [ownerId]);
    throw new Error('FAILED: Should have blocked deleting circle owner');
  } catch (err: any) {
    if (err.code === '23001' || err.code === '23503') {
      console.log('  ✓ Enforced ON DELETE RESTRICT on care_circles.owner_id (blocks silent owner deletion)');
    } else throw err;
  }

  // Test 2: Deleting patient is blocked by ON DELETE RESTRICT on associations / assignments
  try {
    await pool.query(`DELETE FROM users WHERE id = $1`, [patientId]);
    throw new Error('FAILED: Should have blocked deleting patient with active dependencies');
  } catch (err: any) {
    if (err.code === '23001' || err.code === '23503') {
      console.log('  ✓ Enforced ON DELETE RESTRICT on patient_id (blocks silent patient care de-association/assignment wipe)');
    } else throw err;
  }

  // Test 3: Deleting caregiver is blocked by ON DELETE RESTRICT on caregiver_relationships
  try {
    await pool.query(`DELETE FROM users WHERE id = $1`, [cgId]);
    throw new Error('FAILED: Should have blocked deleting caregiver with active contract');
  } catch (err: any) {
    if (err.code === '23001' || err.code === '23503') {
      console.log('  ✓ Enforced ON DELETE RESTRICT on caregiver_id (blocks silent caregiver relationship wipe)');
    } else throw err;
  }

  console.log('\n======================================================================');
  console.log('ALL 8 TABLES, CONSTRAINTS, FOREIGN KEYS & RESTRICT BEHAVIORS VERIFIED!');
  console.log('======================================================================');
}

verify()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Verification failed:', err);
    pool.end();
    process.exit(1);
  });

