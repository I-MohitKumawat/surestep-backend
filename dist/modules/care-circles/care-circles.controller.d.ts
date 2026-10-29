/**
 * SureStep — modules/care-circles/care-circles.controller.ts
 *
 * Controller handlers for the Care Circle domain foundation.
 */
import { Request, Response, NextFunction } from 'express';
import '../../shared/types';
export declare class CareCirclesController {
    createCircle(req: Request, res: Response, next: NextFunction): Promise<void>;
    getMyCircle(req: Request, res: Response, next: NextFunction): Promise<void>;
    getCircle(req: Request, res: Response, next: NextFunction): Promise<void>;
    updateCircleName(req: Request, res: Response, next: NextFunction): Promise<void>;
    terminateCircle(req: Request, res: Response, next: NextFunction): Promise<void>;
    getMembers(req: Request, res: Response, next: NextFunction): Promise<void>;
    removeMember(req: Request, res: Response, next: NextFunction): Promise<void>;
    getPatients(req: Request, res: Response, next: NextFunction): Promise<void>;
    createInvitation(req: Request, res: Response, next: NextFunction): Promise<void>;
    getActiveInvitation(req: Request, res: Response, next: NextFunction): Promise<void>;
    revokeActiveInvitation(req: Request, res: Response, next: NextFunction): Promise<void>;
    getInvitation(req: Request, res: Response, next: NextFunction): Promise<void>;
    submitJoinRequest(req: Request, res: Response, next: NextFunction): Promise<void>;
    listJoinRequests(req: Request, res: Response, next: NextFunction): Promise<void>;
    reviewJoinRequest(req: Request, res: Response, next: NextFunction): Promise<void>;
    grantPermission(req: Request, res: Response, next: NextFunction): Promise<void>;
    revokePermission(req: Request, res: Response, next: NextFunction): Promise<void>;
    setMemberPermissions(req: Request, res: Response, next: NextFunction): Promise<void>;
    redeemInvitation(req: Request, res: Response, next: NextFunction): Promise<void>;
    listCaregivers(req: Request, res: Response, next: NextFunction): Promise<void>;
    establishCaregiverRelationship(req: Request, res: Response, next: NextFunction): Promise<void>;
    suspendCaregiverRelationship(req: Request, res: Response, next: NextFunction): Promise<void>;
    restoreCaregiverRelationship(req: Request, res: Response, next: NextFunction): Promise<void>;
    submitCaregiverNotice(req: Request, res: Response, next: NextFunction): Promise<void>;
    terminateCaregiverRelationship(req: Request, res: Response, next: NextFunction): Promise<void>;
    assignCaregiverToPatient(req: Request, res: Response, next: NextFunction): Promise<void>;
    revokeCaregiverAssignment(req: Request, res: Response, next: NextFunction): Promise<void>;
    createSafeZone(req: Request, res: Response, next: NextFunction): Promise<void>;
    updateSafeZone(req: Request, res: Response, next: NextFunction): Promise<void>;
    deleteSafeZone(req: Request, res: Response, next: NextFunction): Promise<void>;
    listSafeZones(req: Request, res: Response, next: NextFunction): Promise<void>;
    attachPatientToSafeZone(req: Request, res: Response, next: NextFunction): Promise<void>;
    detachPatientFromSafeZone(req: Request, res: Response, next: NextFunction): Promise<void>;
    listAlerts(req: Request, res: Response, next: NextFunction): Promise<void>;
    respondToAlert(req: Request, res: Response, next: NextFunction): Promise<void>;
    resolveAlert(req: Request, res: Response, next: NextFunction): Promise<void>;
    transferOwnership(req: Request, res: Response, next: NextFunction): Promise<void>;
    leaveCircle(req: Request, res: Response, next: NextFunction): Promise<void>;
}
export declare const careCirclesController: CareCirclesController;
//# sourceMappingURL=care-circles.controller.d.ts.map