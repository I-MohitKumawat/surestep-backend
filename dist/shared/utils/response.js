"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.created = created;
exports.errorHandler = errorHandler;
exports.asyncHandler = asyncHandler;
/**
 * Standard API response helper
 */
function ok(res, data, status = 200) {
    const body = { success: true, data };
    res.status(status).json(body);
}
function created(res, data) {
    ok(res, data, 201);
}
/**
 * Global error handler middleware — must be last in chain
 */
function errorHandler(err, req, res, _next) {
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
            error: { code: 'VALIDATION_ERROR', message: err.errors?.map((e) => e.message).join(', ') || 'Validation failed' },
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
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
//# sourceMappingURL=response.js.map