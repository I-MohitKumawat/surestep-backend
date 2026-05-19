import { Router } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './location.controller';

const router = Router();
router.use(authenticate);

// Location pings
router.post('/ping', requireRoles('PATIENT'), asyncHandler(ctrl.ping));
router.get('/patient/:patientId/current',
  requireRelationship('patientId'),
  asyncHandler(ctrl.getCurrentLocation),
);
router.get('/patient/:patientId/trail',
  requireRelationship('patientId', ['CAREGIVER','GUARDIAN','FAMILY_CLOSE']),
  asyncHandler(ctrl.getTrail),
);

// Geofence zones
router.get('/geofences/patient/:patientId',  requireRelationship('patientId'), asyncHandler(ctrl.listZones));
router.post('/geofences/patient/:patientId',
  requireRelationship('patientId', ['CAREGIVER','GUARDIAN']),
  asyncHandler(ctrl.createZone),
);
router.patch('/geofences/:id',  asyncHandler(ctrl.updateZone));
router.delete('/geofences/:id', asyncHandler(ctrl.deleteZone));

// Geofence alerts
router.get('/geofences/alerts/patient/:patientId', requireRelationship('patientId'), asyncHandler(ctrl.listAlerts));
router.post('/geofences/alerts/:id/acknowledge', asyncHandler(ctrl.acknowledgeAlert));

export default router;
