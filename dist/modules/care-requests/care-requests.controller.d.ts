import { Request, Response } from 'express';
export declare function createCareRequest(req: Request, res: Response): Promise<void>;
export declare function getIncomingCareRequests(req: Request, res: Response): Promise<void>;
export declare function getOutgoingCareRequests(req: Request, res: Response): Promise<void>;
export declare function getCareRequestById(req: Request, res: Response): Promise<void>;
export declare function acceptCareRequest(req: Request, res: Response): Promise<void>;
export declare function declineCareRequest(req: Request, res: Response): Promise<void>;
export declare function withdrawCareRequest(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=care-requests.controller.d.ts.map