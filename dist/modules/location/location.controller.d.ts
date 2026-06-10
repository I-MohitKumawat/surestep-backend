import { Request, Response } from 'express';
export declare function ping(req: Request, res: Response): Promise<void>;
export declare function batchSync(req: Request, res: Response): Promise<void>;
export declare function getCurrentLocation(req: Request, res: Response): Promise<void>;
export declare function requestLocationRefresh(req: Request, res: Response): Promise<void>;
export declare function getTrail(req: Request, res: Response): Promise<void>;
export declare function listZones(req: Request, res: Response): Promise<void>;
export declare function createZone(req: Request, res: Response): Promise<void>;
export declare function updateZone(req: Request, res: Response): Promise<void>;
export declare function deleteZone(req: Request, res: Response): Promise<void>;
export declare function listAlerts(req: Request, res: Response): Promise<void>;
export declare function acknowledgeAlert(req: Request, res: Response): Promise<void>;
export declare function getCareCircleMap(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=location.controller.d.ts.map