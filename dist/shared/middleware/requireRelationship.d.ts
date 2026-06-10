import { Request, Response, NextFunction } from 'express';
import { RelationshipType } from '../types';
/**
 * requireRelationship — verifies the authenticated user has an active
 * CONFIRMED relationship with the patient identified by req.params.patientId
 * (or a custom param name).
 *
 * Optionally restrict to specific relationship types (tiers).
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