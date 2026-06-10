"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Errors = exports.AppError = void 0;
class AppError extends Error {
    constructor(code, message, statusCode = 400) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        Object.setPrototypeOf(this, AppError.prototype);
    }
    toJSON() {
        return {
            success: false,
            data: null,
            error: { code: this.code, message: this.message },
        };
    }
}
exports.AppError = AppError;
// Common errors
exports.Errors = {
    UNAUTHORIZED: new AppError('UNAUTHORIZED', 'Authentication required', 401),
    FORBIDDEN: new AppError('ROLE_NOT_PERMITTED', 'You do not have permission to perform this action', 403),
    RELATIONSHIP_REQUIRED: new AppError('RELATIONSHIP_REQUIRED', 'No active relationship with this patient', 403),
    INSUFFICIENT_TIER: new AppError('INSUFFICIENT_RELATIONSHIP_TIER', 'Your relationship tier does not permit this action', 403),
    NOT_FOUND: new AppError('NOT_FOUND', 'Resource not found', 404),
    CONFLICT: new AppError('CONFLICT', 'Resource already exists', 409),
    VALIDATION: (msg) => new AppError('VALIDATION_ERROR', msg, 422),
    INTERNAL: new AppError('INTERNAL_ERROR', 'An unexpected error occurred', 500),
};
//# sourceMappingURL=AppError.js.map