/**
 * SureStep — modules/care-circles/care-circles.controller.ts
 *
 * Controller handlers for the Care Circle domain foundation.
 */

import { Request, Response, NextFunction } from 'express';
import '../../shared/types';
import { careCirclesService } from './care-circles.service';
import { invitationsService } from './invitations.service';
import { permissionsService } from './permissions.service';
import { caregiverRelationshipsService } from './caregiver-relationships.service';
import { patientAssignmentsService } from './patient-assignments.service';
import { CanonicalPermissionName } from './care-circles.types';

export class CareCirclesController {
  async createCircle(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.user!.id;
      const { name } = req.body;
      const circle = await careCirclesService.createCareCircle(ownerId, name);
      res.status(201).json({ success: true, data: circle });
    } catch (err) {
      next(err);
    }
  }

  async getMyCircle(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const circle = await careCirclesService.getUserActiveCircle(userId);
      res.json({
        success: true,
        data: circle,
        circle,
        circles: circle ? [circle] : [],
      });
    } catch (err) {
      next(err);
    }
  }

  async getCircle(req: Request, res: Response, next: NextFunction) {
    try {
      const circleId = req.params.circleId;
      const userId = req.user!.id;
      const circle = await careCirclesService.getCareCircle(circleId, userId);
      res.json({ success: true, data: circle });
    } catch (err) {
      next(err);
    }
  }

  async updateCircleName(req: Request, res: Response, next: NextFunction) {
    try {
      const circleId = req.params.circleId;
      const userId = req.user!.id;
      const { name } = req.body;
      const updated = await careCirclesService.updateCareCircleName(circleId, userId, name);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  async terminateCircle(req: Request, res: Response, next: NextFunction) {
    try {
      const circleId = req.params.circleId;
      const userId = req.user!.id;
      const terminated = await careCirclesService.terminateCareCircle(circleId, userId);
      res.json({ success: true, data: terminated });
    } catch (err) {
      next(err);
    }
  }

  async getMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const circleId = req.params.circleId;
      const members = await careCirclesService.getCircleMembers(circleId);
      res.json({ success: true, data: members });
    } catch (err) {
      next(err);
    }
  }

  async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      const { circleId, memberId } = req.params;
      const actorId = req.user!.id;
      const result = await careCirclesService.removeCircleMember(circleId, actorId, memberId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getPatients(req: Request, res: Response, next: NextFunction) {
    try {
      const circleId = req.params.circleId;
      const patients = await careCirclesService.getCirclePatients(circleId);
      res.json({ success: true, data: patients });
    } catch (err) {
      next(err);
    }
  }

  async createInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const circleId = req.params.circleId;
      const actorId = req.user!.id;
      const invitation = await invitationsService.generateInvitation(circleId, actorId);
      res.status(201).json({ success: true, data: { invitation }, invitation });
    } catch (err) {
      next(err);
    }
  }

  async getActiveInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const circleId = req.params.circleId;
      const actorId = req.user!.id;
      const invitation = await invitationsService.getActiveInvitation(circleId, actorId);
      res.json({ success: true, data: { invitation }, invitation });
    } catch (err) {
      next(err);
    }
  }

  async revokeActiveInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const circleId = req.params.circleId;
      const actorId = req.user!.id;
      const result = await invitationsService.revokeActiveInvitation(circleId, actorId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const code = req.params.code;
      const invitation = await invitationsService.getInvitationByCode(code);
      res.json({ success: true, data: invitation });
    } catch (err) {
      next(err);
    }
  }

  async submitJoinRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const code = req.params.code;
      const applicantId = req.user!.id;
      const joinRequest = await invitationsService.submitJoinRequest(code, applicantId);
      res.status(201).json({ success: true, data: joinRequest });
    } catch (err) {
      next(err);
    }
  }

  async listJoinRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const circleId = req.params.circleId;
      const actorId = req.user!.id;
      const requests = await invitationsService.listPendingJoinRequests(circleId, actorId);
      res.json({ success: true, data: requests });
    } catch (err) {
      next(err);
    }
  }

  async reviewJoinRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const { circleId, requestId } = req.params;
      const reviewerId = req.user!.id;
      const { decision } = req.body;
      const result = await invitationsService.reviewJoinRequest(
        requestId,
        reviewerId,
        { decision },
        circleId
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async grantPermission(req: Request, res: Response, next: NextFunction) {
    try {
      const { circleId, memberId } = req.params;
      const actorId = req.user!.id;
      const { permissionName } = req.body as { permissionName: CanonicalPermissionName };
      const granted = await permissionsService.grantPermission(circleId, actorId, memberId, permissionName);
      res.status(201).json({ success: true, data: granted });
    } catch (err) {
      next(err);
    }
  }

  async revokePermission(req: Request, res: Response, next: NextFunction) {
    try {
      const { circleId, memberId } = req.params;
      const actorId = req.user!.id;
      const permissionName = (req.query.permissionName ||
        req.body?.permissionName ||
        req.params.permissionName) as CanonicalPermissionName;
      const result = await permissionsService.revokePermission(
        circleId,
        actorId,
        memberId,
        permissionName
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async setMemberPermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const { circleId, memberId } = req.params;
      const actorId = req.user!.id;
      const { permissions } = req.body as { permissions: CanonicalPermissionName[] };
      const updated = await permissionsService.setMemberPermissions(
        circleId,
        actorId,
        memberId,
        permissions || []
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  async redeemInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const code = req.body?.code || req.params?.code;
      const applicantId = req.user!.id;
      const joinRequest = await invitationsService.submitJoinRequest(code, applicantId);
      res.status(201).json({ success: true, data: joinRequest });
    } catch (err) {
      next(err);
    }
  }

  async listCaregivers(req: Request, res: Response, next: NextFunction) {
    try {
      const circleId = req.params.circleId;
      const caregivers = await caregiverRelationshipsService.listCircleCaregivers(circleId);
      res.json({ success: true, data: caregivers });
    } catch (err) {
      next(err);
    }
  }

  async establishCaregiverRelationship(req: Request, res: Response, next: NextFunction) {
    try {
      const circleId = req.params.circleId;
      const actorId = req.user!.id;
      const { caregiverId } = req.body;
      const rel = await caregiverRelationshipsService.establishRelationship(circleId, actorId, caregiverId);
      res.status(201).json({ success: true, data: rel });
    } catch (err) {
      next(err);
    }
  }

  async suspendCaregiverRelationship(req: Request, res: Response, next: NextFunction) {
    try {
      const { relationshipId } = req.params;
      const actorId = req.user!.id;
      const rel = await caregiverRelationshipsService.suspendRelationship(relationshipId, actorId);
      res.json({ success: true, data: rel });
    } catch (err) {
      next(err);
    }
  }

  async restoreCaregiverRelationship(req: Request, res: Response, next: NextFunction) {
    try {
      const { relationshipId } = req.params;
      const actorId = req.user!.id;
      const rel = await caregiverRelationshipsService.restoreRelationship(relationshipId, actorId);
      res.json({ success: true, data: rel });
    } catch (err) {
      next(err);
    }
  }

  async submitCaregiverNotice(req: Request, res: Response, next: NextFunction) {
    try {
      const { relationshipId } = req.params;
      const caregiverUserId = req.user!.id;
      const { reason, isSafetyException } = req.body;
      const rel = await caregiverRelationshipsService.submitNotice(relationshipId, caregiverUserId, {
        reason,
        isSafetyException,
      });
      res.json({ success: true, data: rel });
    } catch (err) {
      next(err);
    }
  }

  async terminateCaregiverRelationship(req: Request, res: Response, next: NextFunction) {
    try {
      const { relationshipId } = req.params;
      const actorId = req.user!.id;
      const { reason, notes } = req.body;
      const rel = await caregiverRelationshipsService.terminateImmediate(relationshipId, actorId, {
        reason,
        notes,
      });
      res.json({ success: true, data: rel });
    } catch (err) {
      next(err);
    }
  }

  async assignCaregiverToPatient(req: Request, res: Response, next: NextFunction) {
    try {
      const { relationshipId } = req.params;
      const actorId = req.user!.id;
      const { patientId } = req.body;
      const assignment = await patientAssignmentsService.assignCaregiverToPatient(relationshipId, patientId, actorId);
      res.status(201).json({ success: true, data: assignment });
    } catch (err) {
      next(err);
    }
  }

  async revokeCaregiverAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      const { relationshipId, patientId } = req.params;
      const actorId = req.user!.id;
      const assignment = await patientAssignmentsService.revokePatientAssignment(relationshipId, patientId, actorId);
      res.json({ success: true, data: assignment });
    } catch (err) {
      next(err);
    }
  }

  // ─── 9. Safe Zones (Circle Owner only CRUD) ───────────────────────────────────

  async createSafeZone(req: Request, res: Response, next: NextFunction) {
    try {
      const { circleId } = req.params;
      const actorId = req.user!.id;
      const { authoritativeSafeZonesService } = await import('../location/authoritative-safe-zones.service');
      const zone = await authoritativeSafeZonesService.createSafeZone(circleId, actorId, req.body);
      res.status(201).json({ success: true, data: zone });
    } catch (err) {
      next(err);
    }
  }

  async updateSafeZone(req: Request, res: Response, next: NextFunction) {
    try {
      const { circleId, zoneId } = req.params;
      const actorId = req.user!.id;
      const { authoritativeSafeZonesService } = await import('../location/authoritative-safe-zones.service');
      const zone = await authoritativeSafeZonesService.updateSafeZone(circleId, zoneId, actorId, req.body);
      res.json({ success: true, data: zone });
    } catch (err) {
      next(err);
    }
  }

  async deleteSafeZone(req: Request, res: Response, next: NextFunction) {
    try {
      const { circleId, zoneId } = req.params;
      const actorId = req.user!.id;
      const { authoritativeSafeZonesService } = await import('../location/authoritative-safe-zones.service');
      const result = await authoritativeSafeZonesService.deleteSafeZone(circleId, zoneId, actorId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async listSafeZones(req: Request, res: Response, next: NextFunction) {
    try {
      const { circleId } = req.params;
      const { authoritativeSafeZonesService } = await import('../location/authoritative-safe-zones.service');
      const zones = await authoritativeSafeZonesService.listCircleSafeZones(circleId);
      res.json({ success: true, data: zones });
    } catch (err) {
      next(err);
    }
  }

  async attachPatientToSafeZone(req: Request, res: Response, next: NextFunction) {
    try {
      const { circleId, zoneId, patientId } = req.params;
      const actorId = req.user!.id;
      const { authoritativeSafeZonesService } = await import('../location/authoritative-safe-zones.service');
      const result = await authoritativeSafeZonesService.attachPatient(circleId, zoneId, patientId, actorId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async detachPatientFromSafeZone(req: Request, res: Response, next: NextFunction) {
    try {
      const { circleId, zoneId, patientId } = req.params;
      const actorId = req.user!.id;
      const { authoritativeSafeZonesService } = await import('../location/authoritative-safe-zones.service');
      const result = await authoritativeSafeZonesService.detachPatient(circleId, zoneId, patientId, actorId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // ─── 10. Safety Alerts ────────────────────────────────────────────────────────

  async listAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const { circleId } = req.params;
      const { authoritativeSafetyService } = await import('../alerts/authoritative-safety.service');
      const alerts = await authoritativeSafetyService.listCircleAlerts(circleId, req.query.status as string);
      res.json({ success: true, data: alerts });
    } catch (err) {
      next(err);
    }
  }

  async respondToAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const { alertId } = req.params;
      const { authoritativeSafetyService } = await import('../alerts/authoritative-safety.service');
      const result = await authoritativeSafetyService.respondToAlert(alertId, req.user!, req.body.notes);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async resolveAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const { alertId } = req.params;
      const { authoritativeSafetyService } = await import('../alerts/authoritative-safety.service');
      const result = await authoritativeSafetyService.resolveAlert(alertId, req.user!, req.body.notes);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async transferOwnership(req: Request, res: Response, next: NextFunction) {
    try {
      const circleId = req.params.circleId;
      const currentOwnerId = req.user!.id;
      const { newOwnerId } = req.body;
      const result = await careCirclesService.transferOwnership(circleId, currentOwnerId, newOwnerId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async leaveCircle(req: Request, res: Response, next: NextFunction) {
    try {
      const circleId = req.params.circleId;
      const userId = req.user!.id;
      const result = await careCirclesService.leaveCircle(circleId, userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const careCirclesController = new CareCirclesController();
