"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRelationship = requireRelationship;
const config_1 = __importDefault(require("../../db/config"));
const AppError_1 = require("../errors/AppError");
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
function requireRelationship(paramName = 'patientId', allowedTypes) {
    return async (req, res, next) => {
        try {
            const patientId = req.params[paramName];
            const userId = req.user.id;
            const userRole = req.user.role;
            // Patients can always access their own data
            if (userRole === 'PATIENT' && userId === patientId) {
                next();
                return;
            }
            // Check Care Circle domain foundation
            if (userRole === 'CAREGIVER') {
                const cgCheck = await config_1.default.query(`SELECT pa.id
           FROM patient_assignments pa
           JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
           JOIN care_circles c ON cr.circle_id = c.id
           WHERE cr.caregiver_id = $1
             AND pa.patient_id = $2
             AND pa.is_active = TRUE
             AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
             AND c.terminated_at IS NULL`, [userId, patientId]);
                if (cgCheck.rows.length > 0 && (!allowedTypes || allowedTypes.includes('CAREGIVER'))) {
                    next();
                    return;
                }
            }
            else {
                // Family / Member / Owner
                const circleCheck = await config_1.default.query(`SELECT pca.circle_id
           FROM patient_circle_associations pca
           JOIN care_circles c ON pca.circle_id = c.id
           WHERE pca.patient_id = $1 AND c.terminated_at IS NULL
             AND (
               c.owner_id = $2
               OR EXISTS (
                 SELECT 1 FROM care_circle_members m
                 WHERE m.circle_id = c.id AND m.user_id = $2
               )
             )`, [patientId, userId]);
                if (circleCheck.rows.length > 0) {
                    next();
                    return;
                }
            }
            if (allowedTypes && allowedTypes.length > 0) {
                throw new AppError_1.AppError('INSUFFICIENT_RELATIONSHIP_TIER', 'Your relationship tier does not permit this action', 403);
            }
            throw new AppError_1.AppError('RELATIONSHIP_REQUIRED', 'No active Care Circle relationship or assignment for this patient', 403);
        }
        catch (err) {
            next(err);
        }
    };
}
//# sourceMappingURL=requireRelationship.js.map