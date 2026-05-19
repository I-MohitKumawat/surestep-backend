export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
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

// Common errors
export const Errors = {
  UNAUTHORIZED:     new AppError('UNAUTHORIZED', 'Authentication required', 401),
  FORBIDDEN:        new AppError('ROLE_NOT_PERMITTED', 'You do not have permission to perform this action', 403),
  RELATIONSHIP_REQUIRED: new AppError('RELATIONSHIP_REQUIRED', 'No active relationship with this patient', 403),
  INSUFFICIENT_TIER: new AppError('INSUFFICIENT_RELATIONSHIP_TIER', 'Your relationship tier does not permit this action', 403),
  NOT_FOUND:        new AppError('NOT_FOUND', 'Resource not found', 404),
  CONFLICT:         new AppError('CONFLICT', 'Resource already exists', 409),
  VALIDATION:       (msg: string) => new AppError('VALIDATION_ERROR', msg, 422),
  INTERNAL:         new AppError('INTERNAL_ERROR', 'An unexpected error occurred', 500),
};
