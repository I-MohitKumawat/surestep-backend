import { Request, Response, NextFunction } from 'express';
/**
 * Standard API response helper
 */
export declare function ok<T>(res: Response, data: T, status?: number): void;
export declare function created<T>(res: Response, data: T): void;
/**
 * Global error handler middleware — must be last in chain
 */
export declare function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void;
/**
 * Async wrapper — eliminates try/catch boilerplate in route handlers
 */
export declare function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=response.d.ts.map