import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './auth.controller';

const router = Router();

// Public — no authenticate (user doesn't exist in DB yet)
router.post('/provision', asyncHandler(ctrl.provision));

// Protected — user must exist in DB
router.post('/devices', authenticate, asyncHandler(ctrl.addDevice));
router.get('/devices', authenticate, asyncHandler(ctrl.listDevices));
router.delete('/devices/:deviceId', authenticate, asyncHandler(ctrl.removeDevice));

export default router;
