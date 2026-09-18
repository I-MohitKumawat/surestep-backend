import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

/**
 * Standard API response helper
 */
export function ok<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { success: true, data };
  res.status(status).json(body);
}

export function created<T>(res: Response, data: T): void {
  ok(res, data, 201);
}

/**
 * Global error handler middleware — must be last in chain
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  console.error('[Error]', err);

  if (err?.code && err?.statusCode) {
    // AppError
    res.status(err.statusCode).json({ success: false, data: null, error: { code: err.code, message: err.message } });
    return;
  }

  // Zod validation errors
  if (err?.name === 'ZodError') {
    res.status(422).json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: err.errors?.map((e: any) => e.message).join(', ') || 'Validation failed' },
    });
    return;
  }

  res.status(500).json({
    success: false,
    data: null,
    error: {
      code: 'INTERNAL_ERROR',
      message: err?.message || 'An unexpected error occurred',
      detail: err?.stack,
    },
  });
}

/**
 * Async wrapper — eliminates try/catch boilerplate in route handlers
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
