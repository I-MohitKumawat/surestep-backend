import { Router } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './location.controller';

const router = Router();
router.use(authenticate);

// Location pings & observations
router.post('/ping',   requireRoles('PATIENT', 'CAREGIVER', 'FAMILY'), asyncHandler(ctrl.ping));
router.post('/pings/sync', requireRoles('PATIENT', 'CAREGIVER', 'FAMILY'), asyncHandler(ctrl.batchSync));

// Location observations are Patient device telemetry. V1 has no documented
// workflow that permits a Family member or Professional Caregiver to inject
// location observations on a Patient's behalf, and allowing it would let a
// caller manufacture Safe Zone breaches. Both endpoints are therefore
// Patient-self only; the controller re-checks the identity invariant.
router.post('/observations', requireRoles('PATIENT'), asyncHandler(ctrl.recordObservation));
router.post('/patient/:patientId/observations', requireRoles('PATIENT'), asyncHandler(ctrl.recordObservation));

import { AppError } from '../../shared/errors/AppError';

router.get('/patient/:patientId/current',
  requireRelationship('patientId'),
  asyncHandler(ctrl.getCurrentLocation),
);
router.get('/patient/:patientId/care-circle-map',
  requireRelationship('patientId'),
  asyncHandler(ctrl.getCareCircleMap),
);
router.post('/patient/:patientId/refresh-request',
  requireRelationship('patientId'),
  asyncHandler(ctrl.requestLocationRefresh),
);
router.get('/patient/:patientId/trail',
  requireRelationship('patientId'),
  asyncHandler(ctrl.getTrail),
);

// ─── Legacy Geofence CRUD & Alerts (Decommissioned) ──────────────────────────
const deprecatedGeofenceHandler = (_req: any, _res: any, next: any) => {
  next(new AppError('DEPRECATED_ENDPOINT', 'Legacy geofence endpoints are deprecated. Canonical Safe Zones are owned by Care Circles and managed via /api/v1/care-circles/:circleId/safe-zones.', 410));
};

router.all('/geofences', deprecatedGeofenceHandler);
router.all('/geofences/*', deprecatedGeofenceHandler);

export default router;
