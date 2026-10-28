/**
 * SureStep — modules/care-relationships/care-relationships.controller.ts
 *
 * Express controller handlers for Care Relationship termination & history.
 */
import { Request, Response } from 'express';
export declare function endCareRelationship(req: Request, res: Response): Promise<void>;
export declare function getCareRelationshipHistory(req: Request, res: Response): Promise<void>;
export declare function submitNotice(req: Request, res: Response): Promise<void>;
export declare function terminateRelationship(req: Request, res: Response): Promise<void>;
export declare function assignPatient(req: Request, res: Response): Promise<void>;
export declare function unassignPatient(req: Request, res: Response): Promise<void>;
export declare function getRelationshipById(req: Request, res: Response): Promise<void>;
export declare function createResignation(_req: Request, _res: Response): Promise<void>;
export declare function getResignation(_req: Request, _res: Response): Promise<void>;
export declare function getPendingResignations(_req: Request, _res: Response): Promise<void>;
export declare function acceptResignation(_req: Request, _res: Response): Promise<void>;
export declare function declineResignation(_req: Request, _res: Response): Promise<void>;
export declare function withdrawResignation(_req: Request, _res: Response): Promise<void>;
//# sourceMappingURL=care-relationships.controller.d.ts.map