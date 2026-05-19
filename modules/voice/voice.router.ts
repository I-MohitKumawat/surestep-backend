import { Router } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './voice.controller';

const router = Router();
router.use(authenticate);

// Voice samples
router.post('/samples/patient/:patientId',
  requireRoles('FAMILY'),
  requireRelationship('patientId'),
  asyncHandler(ctrl.uploadSample),
);
router.get('/samples/patient/:patientId',
  requireRelationship('patientId'),
  asyncHandler(ctrl.listSamples),
);
router.delete('/samples/:id', requireRoles('FAMILY'), asyncHandler(ctrl.removeSample));

// Voice messages
router.post('/messages/manual/patient/:patientId',
  requireRoles('FAMILY'),
  requireRelationship('patientId'),
  asyncHandler(ctrl.sendManualMessage),
);
router.get('/messages/patient/:patientId',
  requireRelationship('patientId'),
  asyncHandler(ctrl.listMessages),
);

// Familiarity — Faces
router.post('/faces/patient/:patientId',
  requireRoles('FAMILY'),
  requireRelationship('patientId'),
  asyncHandler(ctrl.addFace),
);
router.get('/faces/patient/:patientId',
  requireRelationship('patientId'),
  asyncHandler(ctrl.listFaces),
);

// Stories
router.post('/stories/patient/:patientId',
  requireRoles('FAMILY'),
  requireRelationship('patientId', ['FAMILY_CLOSE','GUARDIAN']),
  asyncHandler(ctrl.postStory),
);
router.get('/stories/patient/:patientId',
  asyncHandler(ctrl.listStories),
);
router.post('/stories/:id/react',
  requireRoles('PATIENT'),
  asyncHandler(ctrl.reactStory),
);

// Memories
router.post('/memories/patient/:patientId',
  requireRoles('FAMILY'),
  requireRelationship('patientId'),
  asyncHandler(ctrl.addMemory),
);
router.get('/memories/patient/:patientId/daily',
  asyncHandler(ctrl.getDailyMemory),
);

export default router;
