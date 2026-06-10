/**
 * Haversine formula — returns distance in metres between two GPS coordinates.
 */
export declare function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number;
/**
 * Cursor-based pagination helper — returns `{ data, next_cursor, has_more }`
 */
export declare function paginate<T extends {
    created_at: string;
}>(rows: T[], limit: number): {
    data: T[];
    next_cursor: string | null;
    has_more: boolean;
};
/**
 * Generate a random invite token (hex string).
 */
export declare function generateToken(bytes?: number): string;
//# sourceMappingURL=helpers.d.ts.map