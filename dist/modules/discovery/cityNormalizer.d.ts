/**
 * SureStep — cityNormalizer.ts
 *
 * Normalizes Indian city names, aliases, and descriptive service areas.
 * Distinguishes relevance/ranking from hard exclusion and prevents unsafe substring matching.
 */
/**
 * Mapping of lowercase alias / variation to canonical city key.
 */
export declare const CANONICAL_CITY_MAP: Record<string, string>;
/**
 * Mapping of canonical city key to all known equivalent alias strings.
 */
export declare const CANONICAL_ALIASES_MAP: Record<string, string[]>;
/**
 * Extract canonical city aliases from an input string (e.g. user search, patient city, or filter).
 * Returns array of unique lowercase alias strings.
 */
export declare function getCityAliases(input?: string | null): string[];
/**
 * Builds a safe word-boundary POSIX regex pattern for PostgreSQL (~*) or JS RegExp.
 * Enforces boundaries with non-alphanumeric chars or string start/end to avoid
 * equating unrelated cities (e.g. "Dhar" vs "Dharwad", "Ur" vs "Jaipur").
 *
 * Example output: '(^|[^a-zA-Z])(bengaluru|bangalore)([^a-zA-Z]|$)'
 */
export declare function buildCityRegexPattern(aliases: string[]): string;
/**
 * Pure helper to test if a candidate city matches a target city or aliases list.
 * Useful for in-memory / unit test verification without database connection.
 */
export declare function isCityMatch(candidateCity?: string | null, targetCityOrAliases?: string | string[] | null): boolean;
//# sourceMappingURL=cityNormalizer.d.ts.map