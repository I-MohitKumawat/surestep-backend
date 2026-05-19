/**
 * Haversine formula — returns distance in metres between two GPS coordinates.
 */
export function haversineMetres(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Cursor-based pagination helper — returns `{ data, next_cursor, has_more }`
 */
export function paginate<T extends { created_at: string }>(
  rows: T[],
  limit: number,
): { data: T[]; next_cursor: string | null; has_more: boolean } {
  const has_more = rows.length > limit;
  const data = has_more ? rows.slice(0, limit) : rows;
  const next_cursor = has_more ? data[data.length - 1].created_at : null;
  return { data, next_cursor, has_more };
}

/**
 * Generate a random invite token (hex string).
 */
export function generateToken(bytes = 32): string {
  const { randomBytes } = require('crypto');
  return randomBytes(bytes).toString('hex');
}
