import { Request, Response } from 'express';
export declare function caregiverRequest(req: Request, res: Response): Promise<void>;
export declare function familyInvite(req: Request, res: Response): Promise<void>;
export declare function acceptInvite(req: Request, res: Response): Promise<void>;
export declare function myPatients(req: Request, res: Response): Promise<void>;
export declare function myCaregivers(req: Request, res: Response): Promise<void>;
export declare function myFamily(req: Request, res: Response): Promise<void>;
export declare function updateStatus(req: Request, res: Response): Promise<void>;
export declare function removeRelationship(req: Request, res: Response): Promise<void>;
export declare function getConfirmedCaregiver(req: Request, res: Response): Promise<void>;
export declare function confirmCaregiver(req: Request, res: Response): Promise<void>;
export declare function removeCaregiver(req: Request, res: Response): Promise<void>;
export declare function getPendingRequests(req: Request, res: Response): Promise<void>;
export declare function respondToRequest(req: Request, res: Response): Promise<void>;
export declare function searchCaregivers(req: Request, res: Response): Promise<void>;
export declare function completeMeeting(req: Request, res: Response): Promise<void>;
export declare function getPatientRelationship(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=relationships.controller.d.ts.map