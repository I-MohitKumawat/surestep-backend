import { Request, Response, NextFunction } from 'express';
import { RelationshipType } from '../types';
/**
 * requireRelationship — verifies the authenticated user has an active
 * canonical relationship with the patient identified by req.params.patientId
 * (or a custom param name).
 *
 * Canonical authorization model:
 *   - Patient: self-access only.
 *   - Professional Caregiver: ACTIVE/NOTICE_PERIOD caregiver_relationships row
 *     plus an active patient_assignments row for the patient.
 *   - Family / Circle actor: active Care Circle ownership or membership for a
 *     Circle that coordinates the patient.
 *
 * `allowedTypes` is enforced for every actor branch. Legacy relationship tiers
 * are mapped to canonical Circle participation as follows:
 *   - Circle Owner / OWNER member -> GUARDIAN
 *   - Circle MEMBER               -> FAMILY_CLOSE
 *   - Assigned Professional Caregiver -> CAREGIVER
 *
 * The mapping exists only to preserve the documented tier restrictions on
 * routes that still accept them. No tier is inferred from UUID knowledge or
 * from a client-supplied relationship claim.
 *
 * Usage:
 *   router.get('/patient/:patientId/trail',
 *     authenticate,
 *     requireRelationship('patientId', ['CAREGIVER','FAMILY_CLOSE','GUARDIAN']),
 *     controller.getTrail,
 *   );
 */
export declare function requireRelationship(paramName?: string, allowedTypes?: RelationshipType[]): (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=requireRelationship.d.ts.map