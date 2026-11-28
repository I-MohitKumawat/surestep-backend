/**
 * Verification Suite: Routine Permissions & Universal Module Invariants (Phase H)
 *
 * Exercises actual Express authorization guards (`requireRoutineDefinitionCRUDAuthority`,
 * `requireRoutineSignOffAuthority`, `requireOccurrenceSignOffAuthority`,
 * `requireRoutineReadAuthority`) and `PermissionsService` against an in-memory
 * relational state store, plus frontend universal module structure invariants.
 *
 * Run: npx tsx scripts/test_routine_permissions_and_module.ts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';

import pool from '../db/config';
import { PermissionsService } from '../modules/care-circles/permissions.service';
import {
  requireActivePatientAssignment,
  requireOccurrenceSignOffAuthority,
  requireRoutineDefinitionCRUDAuthority,
  requireRoutineSignOffAuthority,
} from '../shared/middleware/careCircleGuards';

interface MockState {
  users: Map<string, { id: string; role: 'PATIENT' | 'FAMILY' | 'CAREGIVER' }>;
  patientProfiles: Map<string, { user_id: string; onboarding_source: 'SELF' | 'FAMILY' }>;
  circles: Map<string, { id: string; owner_id: string; terminated_at: string | null }>;
  patientCircleAssociations: Array<{ patient_id: string; circle_id: string }>;
  circleMembers: Array<{ id: string; circle_id: string; user_id: string; role_in_circle: string }>;
  circlePermissions: Array<{
    id: string;
    member_id: string;
    permission_name: string;
    patient_id: string | null;
    granted_by: string;
  }>;
  relationships: Array<{ id: string; circle_id: string; caregiver_id: string; status: string }>;
  patientAssignments: Array<{ id: string; relationship_id: string; patient_id: string; is_active: boolean }>;
  occurrences: Array<{ id: string; routine_id: string; patient_id: string }>;
}

function createBaselineState(): MockState {
  return {
    users: new Map([
      ['patient-self', { id: 'patient-self', role: 'PATIENT' }],
      ['patient-assisted-a', { id: 'patient-assisted-a', role: 'PATIENT' }],
      ['patient-assisted-b', { id: 'patient-assisted-b', role: 'PATIENT' }],
      ['family-owner', { id: 'family-owner', role: 'FAMILY' }],
      ['family-delegate', { id: 'family-delegate', role: 'FAMILY' }],
      ['family-outsider', { id: 'family-outsider', role: 'FAMILY' }],
      ['caregiver-main', { id: 'caregiver-main', role: 'CAREGIVER' }],
      ['caregiver-owner-bypass', { id: 'caregiver-owner-bypass', role: 'CAREGIVER' }],
    ]),
    patientProfiles: new Map([
      ['patient-self', { user_id: 'patient-self', onboarding_source: 'SELF' }],
      ['patient-assisted-a', { user_id: 'patient-assisted-a', onboarding_source: 'FAMILY' }],
      ['patient-assisted-b', { user_id: 'patient-assisted-b', onboarding_source: 'FAMILY' }],
    ]),
    circles: new Map([
      ['circle-1', { id: 'circle-1', owner_id: 'family-owner', terminated_at: null }],
      ['circle-cg-owner', { id: 'circle-cg-owner', owner_id: 'caregiver-owner-bypass', terminated_at: null }],
    ]),
    patientCircleAssociations: [
      { patient_id: 'patient-assisted-a', circle_id: 'circle-1' },
      { patient_id: 'patient-assisted-b', circle_id: 'circle-1' },
      { patient_id: 'patient-assisted-a', circle_id: 'circle-cg-owner' },
    ],
    circleMembers: [
      { id: 'mem-owner', circle_id: 'circle-1', user_id: 'family-owner', role_in_circle: 'OWNER' },
      { id: 'mem-fam', circle_id: 'circle-1', user_id: 'family-delegate', role_in_circle: 'MEMBER' },
      { id: 'mem-cg', circle_id: 'circle-1', user_id: 'caregiver-main', role_in_circle: 'CAREGIVER' },
      { id: 'mem-cg-owner', circle_id: 'circle-cg-owner', user_id: 'caregiver-owner-bypass', role_in_circle: 'OWNER' },
    ],
    circlePermissions: [],
    relationships: [
      { id: 'rel-cg-1', circle_id: 'circle-1', caregiver_id: 'caregiver-main', status: 'ACTIVE' },
      { id: 'rel-cg-own', circle_id: 'circle-cg-owner', caregiver_id: 'caregiver-owner-bypass', status: 'ACTIVE' },
    ],
    patientAssignments: [
      { id: 'pa-cg-a', relationship_id: 'rel-cg-1', patient_id: 'patient-assisted-a', is_active: true },
      { id: 'pa-cg-b', relationship_id: 'rel-cg-1', patient_id: 'patient-assisted-b', is_active: true },
      { id: 'pa-cg-own-a', relationship_id: 'rel-cg-own', patient_id: 'patient-assisted-a', is_active: true },
    ],
    occurrences: [
      { id: 'occ-a-1', routine_id: 'rtn-a-1', patient_id: 'patient-assisted-a' },
      { id: 'occ-self-1', routine_id: 'rtn-self-1', patient_id: 'patient-self' },
    ],
  };
}

let state = createBaselineState();
let permCounter = 1;

(pool as any).query = async (sqlRaw: string, params: any[] = []) => {
  const sql = sqlRaw.replace(/\s+/g, ' ').trim();

  // Caregiver 5-condition routine definition CRUD guard
  if (sql.includes("FROM patient_circle_associations pca") && sql.includes("JOIN circle_permissions p")) {
    const [caregiverId, patientId] = params;
    const rows = state.patientCircleAssociations
      .filter((pca) => pca.patient_id === patientId)
      .flatMap((pca) => {
        const circle = state.circles.get(pca.circle_id);
        if (!circle || circle.terminated_at) return [];
        const rels = state.relationships.filter(
          (r) => r.circle_id === circle.id && r.caregiver_id === caregiverId && (r.status === 'ACTIVE' || r.status === 'NOTICE_PERIOD'),
        );
        const hasAssign = rels.some((r) =>
          state.patientAssignments.some((pa) => pa.relationship_id === r.id && pa.patient_id === patientId && pa.is_active),
        );
        if (!hasAssign) return [];
        const mems = state.circleMembers.filter((m) => m.circle_id === circle.id && m.user_id === caregiverId);
        return mems.flatMap((m) =>
          state.circlePermissions.filter(
            (p) =>
              p.member_id === m.id &&
              p.permission_name === 'Manage Routines' &&
              p.granted_by !== caregiverId &&
              (p.patient_id === null || p.patient_id === patientId),
          ),
        );
      });
    return { rows: rows.slice(0, 1).map((r) => ({ id: r.id })) };
  }

  // Patient onboarding_source check
  if (sql.includes("SELECT onboarding_source FROM patient_profiles")) {
    const [patientId] = params;
    const row = state.patientProfiles.get(patientId);
    return { rows: row ? [{ onboarding_source: row.onboarding_source }] : [] };
  }

  // Family member routine definition CRUD guard
  if (sql.includes("FROM patient_circle_associations pca") && sql.includes("role_in_circle != 'CAREGIVER'")) {
    const [patientId, userId] = params;
    const rows = state.patientCircleAssociations
      .filter((pca) => pca.patient_id === patientId)
      .flatMap((pca) => {
        const circle = state.circles.get(pca.circle_id);
        if (!circle || circle.terminated_at) return [];
        const isAuth =
          circle.owner_id === userId ||
          state.circleMembers.some(
            (m) => m.circle_id === circle.id && m.user_id === userId && m.role_in_circle !== 'CAREGIVER',
          );
        return isAuth ? [{ id: circle.id }] : [];
      });
    return { rows };
  }

  // Routine read / sign-off family check
  if (sql.includes("FROM patient_circle_associations pca") && sql.includes("m.user_id = $2")) {
    const [patientId, userId] = params;
    const rows = state.patientCircleAssociations
      .filter((pca) => pca.patient_id === patientId)
      .flatMap((pca) => {
        const circle = state.circles.get(pca.circle_id);
        if (!circle || circle.terminated_at) return [];
        const isMember =
          circle.owner_id === userId ||
          state.circleMembers.some((m) => m.circle_id === circle.id && m.user_id === userId);
        return isMember ? [{ id: circle.id }] : [];
      });
    return { rows };
  }

  // Active caregiver assignment check (read & sign-off)
  if (sql.includes("FROM patient_assignments pa") && sql.includes("JOIN caregiver_relationships cr")) {
    const [caregiverId, patientId] = params;
    const rows = state.patientAssignments
      .filter((pa) => {
        if (!pa.is_active || pa.patient_id !== patientId) return false;
        const rel = state.relationships.find((r) => r.id === pa.relationship_id);
        if (!rel || rel.caregiver_id !== caregiverId) return false;
        if (rel.status !== 'ACTIVE' && rel.status !== 'NOTICE_PERIOD') return false;
        const circle = state.circles.get(rel.circle_id);
        return Boolean(circle && !circle.terminated_at);
      })
      .map((pa) => ({ id: pa.id }));
    return { rows };
  }

  // Occurrence lookup
  if (sql.includes("SELECT id, routine_id, patient_id FROM routine_occurrences")) {
    const [occurrenceId] = params;
    const occ = state.occurrences.find((o) => o.id === occurrenceId);
    return { rows: occ ? [occ] : [] };
  }

  // PermissionsService queries
  if (sql.includes("SELECT owner_id, terminated_at FROM care_circles WHERE id = $1")) {
    const c = state.circles.get(params[0]);
    return { rows: c ? [{ owner_id: c.owner_id, terminated_at: c.terminated_at }] : [] };
  }

  if (sql.includes("SELECT patient_id FROM patient_circle_associations WHERE circle_id = $1")) {
    const [circleId, patientIds] = params;
    const rows = state.patientCircleAssociations
      .filter((p) => p.circle_id === circleId && patientIds.includes(p.patient_id))
      .map((p) => ({ patient_id: p.patient_id }));
    return { rows };
  }

  if (sql.includes("FROM care_circle_members m JOIN users u ON u.id = m.user_id WHERE m.id = $1 AND m.circle_id = $2")) {
    const [memberId, circleId] = params;
    const m = state.circleMembers.find((item) => item.id === memberId && item.circle_id === circleId);
    if (!m) return { rows: [] };
    const u = state.users.get(m.user_id);
    return { rows: [{ ...m, user_role: u?.role }] };
  }

  if (sql.includes("SELECT id, user_id, role_in_circle FROM care_circle_members WHERE id = $1 AND circle_id = $2")) {
    const [memberId, circleId] = params;
    const m = state.circleMembers.find((item) => item.id === memberId && item.circle_id === circleId);
    return { rows: m ? [m] : [] };
  }

  if (sql.includes("SELECT role FROM users WHERE id = $1")) {
    const u = state.users.get(params[0]);
    return { rows: u ? [{ role: u.role }] : [] };
  }

  if (sql.includes("SELECT p.permission_name FROM circle_permissions p")) {
    const [circleId, actorId] = params;
    const mem = state.circleMembers.find((m) => m.circle_id === circleId && m.user_id === actorId);
    if (!mem) return { rows: [] };
    return {
      rows: state.circlePermissions
        .filter((p) => p.member_id === mem.id)
        .map((p) => ({ permission_name: p.permission_name })),
    };
  }

  if (sql.startsWith("INSERT INTO circle_permissions")) {
    const [memberId, permissionName, maybePatientOrActor, maybeActor] = params;
    const isScoped = sql.includes("VALUES ($1, $2, $3, $4)");
    const patientId = isScoped ? maybePatientOrActor : null;
    const grantedBy = isScoped ? maybeActor : maybePatientOrActor;

    const existing = state.circlePermissions.find(
      (p) => p.member_id === memberId && p.permission_name === permissionName && p.patient_id === patientId,
    );
    if (existing) {
      existing.granted_by = grantedBy;
      return { rows: [existing] };
    }
    const created = {
      id: `perm-${permCounter++}`,
      member_id: memberId,
      permission_name: permissionName,
      patient_id: patientId,
      granted_by: grantedBy,
    };
    state.circlePermissions.push(created);
    return { rows: [created] };
  }

  if (sql.startsWith("DELETE FROM circle_permissions")) {
    const [memberId, permissionName, patientId] = params;
    const removed: typeof state.circlePermissions = [];
    state.circlePermissions = state.circlePermissions.filter((p) => {
      const match =
        p.member_id === memberId &&
        p.permission_name === permissionName &&
        (patientId ? p.patient_id === patientId : true);
      if (match) removed.push(p);
      return !match;
    });
    return { rows: removed.map((r) => ({ id: r.id })) };
  }

  if (sql.includes("SELECT p.id FROM circle_permissions p")) {
    const [circleId, userId, permissionName, patientId] = params;
    const user = state.users.get(userId);
    if (!user || user.role === 'PATIENT') return { rows: [] };
    const memIds = state.circleMembers
      .filter((m) => m.circle_id === circleId && m.user_id === userId)
      .map((m) => m.id);
    const rows = state.circlePermissions.filter(
      (p) =>
        memIds.includes(p.member_id) &&
        p.permission_name === permissionName &&
        (!patientId || p.patient_id === null || p.patient_id === patientId),
    );
    return { rows: rows.map((r) => ({ id: r.id })) };
  }

  // CareCircle notification lookups inside notifyPermissionsChanged
  if (sql.includes("SELECT user_id FROM care_circle_members WHERE circle_id = $1") || sql.includes("INSERT INTO notifications")) {
    return { rows: [] };
  }

  throw new Error(`Unexpected SQL in mock pool: ${sql}`);
};

async function runGuard(
  mw: (req: Request, res: Response, next: NextFunction) => Promise<void> | void,
  user: { id: string; role: 'PATIENT' | 'FAMILY' | 'CAREGIVER' },
  params: Record<string, string>,
): Promise<{ allowed: boolean; error?: any }> {
  let caught: any;
  let calledNext = false;
  const req = { user, params, body: {} } as unknown as Request;
  const res = {} as Response;
  await mw(req, res, (err?: any) => {
    if (err) caught = err;
    else calledNext = true;
  });
  return { allowed: calledNext && !caught, error: caught };
}

async function runTests() {
  const permissionsService = new PermissionsService();
  const crudGuard = requireRoutineDefinitionCRUDAuthority('patientId');
  const readGuard = requireActivePatientAssignment('patientId');
  const signOffPatientGuard = requireRoutineSignOffAuthority('patientId');
  const signOffOccGuard = requireOccurrenceSignOffAuthority('occurrenceId');

  // 1. Self-managed Patient can create/edit/delete own routines
  {
    const r = await runGuard(crudGuard, { id: 'patient-self', role: 'PATIENT' }, { patientId: 'patient-self' });
    assert.equal(r.allowed, true, 'Self-managed Patient should pass routine CRUD guard');
  }

  // 2. Assisted Patient cannot create/edit/delete own routines
  {
    const r = await runGuard(crudGuard, { id: 'patient-assisted-a', role: 'PATIENT' }, { patientId: 'patient-assisted-a' });
    assert.equal(r.allowed, false);
    assert.equal(r.error.code, 'ASSISTED_PATIENT_ROUTINE_CRUD_FORBIDDEN');
  }

  // 3. Family member in Patient's Care Circle can create/edit/delete Patient routines
  {
    const r = await runGuard(crudGuard, { id: 'family-delegate', role: 'FAMILY' }, { patientId: 'patient-assisted-a' });
    assert.equal(r.allowed, true, 'Family Circle member should pass routine CRUD guard');

    const outsider = await runGuard(crudGuard, { id: 'family-outsider', role: 'FAMILY' }, { patientId: 'patient-assisted-a' });
    assert.equal(outsider.allowed, false);
  }

  // 4 & 6. Caregiver WITH 'Manage Routines' scoped to Patient A passes for A and fails for B
  {
    state = createBaselineState();
    await permissionsService.grantPermission('circle-1', 'family-owner', 'mem-cg', 'Manage Routines', 'patient-assisted-a');

    const resA = await runGuard(crudGuard, { id: 'caregiver-main', role: 'CAREGIVER' }, { patientId: 'patient-assisted-a' });
    assert.equal(resA.allowed, true, 'Caregiver granted Manage Routines for Patient A must be allowed on A');

    const resB = await runGuard(crudGuard, { id: 'caregiver-main', role: 'CAREGIVER' }, { patientId: 'patient-assisted-b' });
    assert.equal(resB.allowed, false, 'Caregiver granted Manage Routines only for Patient A must be denied on Patient B');
    assert.equal(resB.error.code, 'CAREGIVER_ROUTINE_CRUD_FORBIDDEN');
  }

  // 5. Caregiver WITHOUT 'Manage Routines' is denied CRUD
  {
    state = createBaselineState();
    const res = await runGuard(crudGuard, { id: 'caregiver-main', role: 'CAREGIVER' }, { patientId: 'patient-assisted-a' });
    assert.equal(res.allowed, false);
    assert.equal(res.error.code, 'CAREGIVER_ROUTINE_CRUD_FORBIDDEN');
  }

  // 7. Caregiver WITH revoked 'Manage Routines' is immediately denied
  {
    state = createBaselineState();
    await permissionsService.grantPermission('circle-1', 'family-owner', 'mem-cg', 'Manage Routines', 'patient-assisted-a');
    await permissionsService.revokePermission('circle-1', 'family-owner', 'mem-cg', 'Manage Routines', 'patient-assisted-a');
    const res = await runGuard(crudGuard, { id: 'caregiver-main', role: 'CAREGIVER' }, { patientId: 'patient-assisted-a' });
    assert.equal(res.allowed, false);
    assert.equal(res.error.code, 'CAREGIVER_ROUTINE_CRUD_FORBIDDEN');
  }

  // 8. Caregiver removed from Care Circle membership is denied even if permission row remained
  {
    state = createBaselineState();
    await permissionsService.grantPermission('circle-1', 'family-owner', 'mem-cg', 'Manage Routines', 'patient-assisted-a');
    state.circleMembers = state.circleMembers.filter((m) => m.id !== 'mem-cg');
    const res = await runGuard(crudGuard, { id: 'caregiver-main', role: 'CAREGIVER' }, { patientId: 'patient-assisted-a' });
    assert.equal(res.allowed, false);
    assert.equal(res.error.code, 'CAREGIVER_ROUTINE_CRUD_FORBIDDEN');
  }

  // 9. Caregiver whose patient assignment / relationship ends is denied
  {
    state = createBaselineState();
    await permissionsService.grantPermission('circle-1', 'family-owner', 'mem-cg', 'Manage Routines', 'patient-assisted-a');
    state.patientAssignments[0].is_active = false;
    const res = await runGuard(crudGuard, { id: 'caregiver-main', role: 'CAREGIVER' }, { patientId: 'patient-assisted-a' });
    assert.equal(res.allowed, false);
    assert.equal(res.error.code, 'CAREGIVER_ROUTINE_CRUD_FORBIDDEN');
  }

  // 10. Self-granted permission neither succeeds via API nor bypasses SQL guard
  {
    state = createBaselineState();
    state.circlePermissions.push({
      id: 'perm-mem-cg-mgr',
      member_id: 'mem-cg',
      permission_name: 'Manage Member Permissions',
      patient_id: null,
      granted_by: 'family-owner',
    });
    state.circlePermissions.push({
      id: 'perm-self-grant',
      member_id: 'mem-cg',
      permission_name: 'Manage Routines',
      patient_id: 'patient-assisted-a',
      granted_by: 'caregiver-main', // self-granted row must fail `p.granted_by <> $1`
    });

    await assert.rejects(
      () => permissionsService.grantPermission('circle-1', 'caregiver-main', 'mem-cg', 'Manage Routines', 'patient-assisted-a'),
      (err: any) => err?.code === 'SELF_GRANT_FORBIDDEN',
    );
    const guardRes = await runGuard(crudGuard, { id: 'caregiver-main', role: 'CAREGIVER' }, { patientId: 'patient-assisted-a' });
    assert.equal(guardRes.allowed, false);
    assert.equal(guardRes.error.code, 'CAREGIVER_ROUTINE_CRUD_FORBIDDEN');
  }

  // 11. Caregiver who happens to be Circle Owner cannot bypass missing Manage Routines
  {
    state = createBaselineState();
    const hasPerm = await permissionsService.hasPermission('circle-cg-owner', 'caregiver-owner-bypass', 'Manage Routines', 'patient-assisted-a');
    assert.equal(hasPerm, false, 'hasPermission must return false for CAREGIVER Owner without explicit Manage Routines');
    const guardRes = await runGuard(crudGuard, { id: 'caregiver-owner-bypass', role: 'CAREGIVER' }, { patientId: 'patient-assisted-a' });
    assert.equal(guardRes.allowed, false);
    assert.equal(guardRes.error.code, 'CAREGIVER_ROUTINE_CRUD_FORBIDDEN');
  }

  // 12 & 13. Caregiver WITHOUT Manage Routines CAN read + sign off while assigned; removed assignment fails
  {
    state = createBaselineState();
    const readRes = await runGuard(readGuard, { id: 'caregiver-main', role: 'CAREGIVER' }, { patientId: 'patient-assisted-a' });
    assert.equal(readRes.allowed, true);

    const signPatientRes = await runGuard(signOffPatientGuard, { id: 'caregiver-main', role: 'CAREGIVER' }, { patientId: 'patient-assisted-a' });
    assert.equal(signPatientRes.allowed, true);

    const signOccRes = await runGuard(signOffOccGuard, { id: 'caregiver-main', role: 'CAREGIVER' }, { occurrenceId: 'occ-a-1' });
    assert.equal(signOccRes.allowed, true);

    // Revoke assignment -> sign off fails
    state.patientAssignments[0].is_active = false;
    const revokedSign = await runGuard(signOffOccGuard, { id: 'caregiver-main', role: 'CAREGIVER' }, { occurrenceId: 'occ-a-1' });
    assert.equal(revokedSign.allowed, false);
    assert.equal(revokedSign.error.code, 'CAREGIVER_NOT_ASSIGNED');
  }

  // 14. Existing sign-off boundaries intact for Patient and Family
  {
    state = createBaselineState();
    const pSelf = await runGuard(signOffOccGuard, { id: 'patient-self', role: 'PATIENT' }, { occurrenceId: 'occ-self-1' });
    assert.equal(pSelf.allowed, true);

    const pCross = await runGuard(signOffOccGuard, { id: 'patient-self', role: 'PATIENT' }, { occurrenceId: 'occ-a-1' });
    assert.equal(pCross.allowed, false);

    const famMember = await runGuard(signOffOccGuard, { id: 'family-delegate', role: 'FAMILY' }, { occurrenceId: 'occ-a-1' });
    assert.equal(famMember.allowed, true);

    const famOutsider = await runGuard(signOffOccGuard, { id: 'family-outsider', role: 'FAMILY' }, { occurrenceId: 'occ-a-1' });
    assert.equal(famOutsider.allowed, false);
  }

  // 15. Frontend universal module & guard cleanliness checks
  {
    const feRoot = path.resolve(__dirname, '../../SureStep/src');
    const sharedScreen = fs.readFileSync(path.join(feRoot, 'screens/shared/SharedPatientRoutinesScreen.tsx'), 'utf8');
    assert.ok(!sharedScreen.includes("user?.role === 'PATIENT';\n"), 'SharedPatientRoutinesScreen must use useRoutinePermissions instead of hardcoded role gate');
    assert.ok(sharedScreen.includes('useRoutinePermissions'), 'SharedPatientRoutinesScreen must consume useRoutinePermissions');
    assert.ok(sharedScreen.includes('CaregiverRoutineEditorScreen'), 'SharedPatientRoutinesScreen must navigate Caregivers to CaregiverRoutineEditorScreen');

    const compDir = path.join(feRoot, 'components/routines');
    for (const file of fs.readdirSync(compDir)) {
      const src = fs.readFileSync(path.join(compDir, file), 'utf8');
      assert.ok(!src.includes('createRoutineDefinition') && !src.includes('updateRoutineDefinition') && !src.includes('deleteRoutineDefinition'),
        `Shared UI component ${file} must remain free of direct routine API mutations`);
    }
  }

  console.log('✅ All 15 routine authorization & universal module checks passed!');
}

runTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
