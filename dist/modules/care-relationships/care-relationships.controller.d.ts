/**
 * SureStep — modules/care-relationships/care-relationships.controller.ts
 *
 * Express controller handlers for Care Relationship termination & history.
 */
import { Request, Response } from 'express';
export declare function endCareRelationship(req: Request, res: Response): Promise<void>;
export declare function getCareRelationshipHistory(req: Request, res: Response): Promise<void>;
export declare function createResignation(req: Request, res: Response): Promise<void>;
export declare function getResignation(req: Request, res: Response): Promise<void>;
export declare function getPendingResignations(req: Request, res: Response): Promise<void>;
export declare function acceptResignation(req: Request, res: Response): Promise<void>;
export declare function declineResignation(req: Request, res: Response): Promise<void>;
export declare function withdrawResignation(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=care-relationships.controller.d.ts.map