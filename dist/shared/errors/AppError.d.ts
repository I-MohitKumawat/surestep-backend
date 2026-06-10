export declare class AppError extends Error {
    readonly code: string;
    readonly statusCode: number;
    constructor(code: string, message: string, statusCode?: number);
    toJSON(): {
        success: boolean;
        data: null;
        error: {
            code: string;
            message: string;
        };
    };
}
export declare const Errors: {
    UNAUTHORIZED: AppError;
    FORBIDDEN: AppError;
    RELATIONSHIP_REQUIRED: AppError;
    INSUFFICIENT_TIER: AppError;
    NOT_FOUND: AppError;
    CONFLICT: AppError;
    VALIDATION: (msg: string) => AppError;
    INTERNAL: AppError;
};
//# sourceMappingURL=AppError.d.ts.map