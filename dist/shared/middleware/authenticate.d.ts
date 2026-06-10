import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types';
export declare const authenticate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const requireRoles: (...roles: UserRole[]) => (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=authenticate.d.ts.map