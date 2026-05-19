import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './users.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Own user
router.get('/me', asyncHandler(ctrl.getMe));
router.patch('/me', asyncHandler(ctrl.updateMe));

// Patient profile
router.put('/patient', asyncHandler(ctrl.upsertPatientProfile));
router.get('/patient/:id', requireRelationship('id'), asyncHandler(ctrl.getPatientProfile));

// Caregiver profile (public fields available, full profile requires relationship)
router.put('/caregiver', asyncHandler(ctrl.upsertCaregiverProfile));
router.get('/caregiver/:id', asyncHandler(ctrl.getCaregiverProfile));

// Family profile
router.put('/family', asyncHandler(ctrl.upsertFamilyProfile));

export default router;
