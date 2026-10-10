"use strict";
/**
 * SureStep — cityNormalizer.ts
 *
 * Normalizes Indian city names, aliases, and descriptive service areas.
 * Distinguishes relevance/ranking from hard exclusion and prevents unsafe substring matching.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CANONICAL_ALIASES_MAP = exports.CANONICAL_CITY_MAP = void 0;
exports.getCityAliases = getCityAliases;
exports.buildCityRegexPattern = buildCityRegexPattern;
exports.isCityMatch = isCityMatch;
/**
 * Mapping of lowercase alias / variation to canonical city key.
 */
exports.CANONICAL_CITY_MAP = {
    // Karnataka
    bangalore: 'bengaluru',
    bengaluru: 'bengaluru',
    mysore: 'mysuru',
    mysuru: 'mysuru',
    mangalore: 'mangaluru',
    mangaluru: 'mangaluru',
    hubli: 'hubballi',
    hubballi: 'hubballi',
    belgaum: 'belagavi',
    belagavi: 'belagavi',
    gulbarga: 'kalaburagi',
    kalaburagi: 'kalaburagi',
    // Maharashtra
    bombay: 'mumbai',
    mumbai: 'mumbai',
    poona: 'pune',
    pune: 'pune',
    // Tamil Nadu
    madras: 'chennai',
    chennai: 'chennai',
    // West Bengal
    calcutta: 'kolkata',
    kolkata: 'kolkata',
    // Delhi NCR
    delhi: 'delhi',
    'new delhi': 'delhi',
    gurgaon: 'gurugram',
    gurugram: 'gurugram',
    // Kerala
    trivandrum: 'thiruvananthapuram',
    thiruvananthapuram: 'thiruvananthapuram',
    cochin: 'kochi',
    kochi: 'kochi',
    calicut: 'kozhikode',
    kozhikode: 'kozhikode',
    // Andhra Pradesh
    vizag: 'visakhapatnam',
    visakhapatnam: 'visakhapatnam',
    bezawada: 'vijayawada',
    vijayawada: 'vijayawada',
    // Gujarat
    baroda: 'vadodara',
    vadodara: 'vadodara',
    // Puducherry
    pondicherry: 'puducherry',
    puducherry: 'puducherry',
    // Uttar Pradesh
    allahabad: 'prayagraj',
    prayagraj: 'prayagraj',
    banaras: 'varanasi',
    kashi: 'varanasi',
    varanasi: 'varanasi',
};
/**
 * Mapping of canonical city key to all known equivalent alias strings.
 */
exports.CANONICAL_ALIASES_MAP = {
    bengaluru: ['bengaluru', 'bangalore'],
    mysuru: ['mysuru', 'mysore'],
    mangaluru: ['mangaluru', 'mangalore'],
    hubballi: ['hubballi', 'hubli'],
    belagavi: ['belagavi', 'belgaum'],
    kalaburagi: ['kalaburagi', 'gulbarga'],
    mumbai: ['mumbai', 'bombay'],
    pune: ['pune', 'poona'],
    chennai: ['chennai', 'madras'],
    kolkata: ['kolkata', 'calcutta'],
    delhi: ['delhi', 'new delhi'],
    gurugram: ['gurugram', 'gurgaon'],
    thiruvananthapuram: ['thiruvananthapuram', 'trivandrum'],
    kochi: ['kochi', 'cochin'],
    kozhikode: ['kozhikode', 'calicut'],
    visakhapatnam: ['visakhapatnam', 'vizag'],
    vijayawada: ['vijayawada', 'bezawada'],
    vadodara: ['vadodara', 'baroda'],
    puducherry: ['puducherry', 'pondicherry'],
    prayagraj: ['prayagraj', 'allahabad'],
    varanasi: ['varanasi', 'banaras', 'kashi'],
};
/**
 * Common zone/direction modifiers and noise words in Indian service area descriptions.
 * e.g. "Bengaluru - South", "Bangalore Urban", "South Bangalore", "Delhi NCR".
 */
const QUALIFIER_WORDS = new Set([
    'north',
    'south',
    'east',
    'west',
    'central',
    'urban',
    'rural',
    'zone',
    'suburb',
    'suburbs',
    'district',
    'city',
    'greater',
    'ncr',
    'metropolitan',
    'cantt',
    'cantonment',
]);
/**
 * Extract canonical city aliases from an input string (e.g. user search, patient city, or filter).
 * Returns array of unique lowercase alias strings.
 */
function getCityAliases(input) {
    if (!input || typeof input !== 'string')
        return [];
    // Normalize delimiters (replace hyphens, commas, slashes, pipes with space)
    const cleaned = input
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (cleaned.length === 0)
        return [];
    // 1. Direct match on full cleaned string
    if (exports.CANONICAL_CITY_MAP[cleaned]) {
        const canonical = exports.CANONICAL_CITY_MAP[cleaned];
        return exports.CANONICAL_ALIASES_MAP[canonical] || [canonical];
    }
    // 2. Tokenize and inspect word components
    const tokens = cleaned.split(' ').filter(Boolean);
    if (tokens.length === 0)
        return [];
    // Check if any multi-word substring matches (e.g. "new delhi")
    for (let i = 0; i < tokens.length - 1; i++) {
        const bigram = `${tokens[i]} ${tokens[i + 1]}`;
        if (exports.CANONICAL_CITY_MAP[bigram]) {
            const canonical = exports.CANONICAL_CITY_MAP[bigram];
            return exports.CANONICAL_ALIASES_MAP[canonical] || [canonical];
        }
    }
    // Remove qualifier words to extract core city name
    const filteredTokens = tokens.filter((t) => !QUALIFIER_WORDS.has(t));
    const baseCity = filteredTokens.join(' ');
    if (baseCity.length > 0 && exports.CANONICAL_CITY_MAP[baseCity]) {
        const canonical = exports.CANONICAL_CITY_MAP[baseCity];
        return exports.CANONICAL_ALIASES_MAP[canonical] || [canonical];
    }
    // Check individual non-qualifier tokens against canonical map
    for (const token of filteredTokens) {
        if (exports.CANONICAL_CITY_MAP[token]) {
            const canonical = exports.CANONICAL_CITY_MAP[token];
            return exports.CANONICAL_ALIASES_MAP[canonical] || [canonical];
        }
    }
    // If not in canonical dictionary, return the cleaned base city if sufficiently long (>= 2 chars)
    if (baseCity.length >= 2) {
        return [baseCity];
    }
    // Fallback to original cleaned string if >= 2 chars
    if (cleaned.length >= 2 && !QUALIFIER_WORDS.has(cleaned)) {
        return [cleaned];
    }
    return [];
}
/**
 * Escape regex special characters in a string.
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Builds a safe word-boundary POSIX regex pattern for PostgreSQL (~*) or JS RegExp.
 * Enforces boundaries with non-alphanumeric chars or string start/end to avoid
 * equating unrelated cities (e.g. "Dhar" vs "Dharwad", "Ur" vs "Jaipur").
 *
 * Example output: '(^|[^a-zA-Z])(bengaluru|bangalore)([^a-zA-Z]|$)'
 */
function buildCityRegexPattern(aliases) {
    if (aliases.length === 0)
        return '';
    const escaped = aliases.map((a) => escapeRegex(a.trim())).filter(Boolean);
    if (escaped.length === 0)
        return '';
    return `(^|[^a-zA-Z])(${escaped.join('|')})([^a-zA-Z]|$)`;
}
/**
 * Pure helper to test if a candidate city matches a target city or aliases list.
 * Useful for in-memory / unit test verification without database connection.
 */
function isCityMatch(candidateCity, targetCityOrAliases) {
    if (!candidateCity || !targetCityOrAliases)
        return false;
    const aliases = Array.isArray(targetCityOrAliases)
        ? targetCityOrAliases
        : getCityAliases(targetCityOrAliases);
    if (aliases.length === 0)
        return false;
    const pattern = buildCityRegexPattern(aliases);
    if (!pattern)
        return false;
    const regex = new RegExp(pattern, 'i');
    return regex.test(candidateCity.trim());
}
//# sourceMappingURL=cityNormalizer.js.map