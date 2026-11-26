"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreferredLanguageSchema = exports.SUPPORTED_LANGUAGE_CODES = exports.SUPPORTED_LANGUAGES = exports.DEFAULT_LANGUAGE_CODE = void 0;
exports.normalizePreferredLanguage = normalizePreferredLanguage;
exports.resolvePreferredLanguage = resolvePreferredLanguage;
const zod_1 = require("zod");
exports.DEFAULT_LANGUAGE_CODE = 'en';
exports.SUPPORTED_LANGUAGES = [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
    { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
    { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
    { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
    { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
    { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
    { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
];
exports.SUPPORTED_LANGUAGE_CODES = exports.SUPPORTED_LANGUAGES.map((lang) => lang.code);
const LOOKUP_BY_KEY = new Map();
for (const lang of exports.SUPPORTED_LANGUAGES) {
    LOOKUP_BY_KEY.set(lang.code.toLowerCase(), lang.code);
    LOOKUP_BY_KEY.set(lang.name.toLowerCase(), lang.code);
    LOOKUP_BY_KEY.set(lang.nativeName.toLowerCase(), lang.code);
}
/**
 * Normalizes an ISO language code or legacy display name to a canonical code.
 * Returns null for empty or unsupported values.
 */
function normalizePreferredLanguage(value) {
    if (typeof value !== 'string')
        return null;
    const key = value.trim().toLowerCase();
    if (!key)
        return null;
    return LOOKUP_BY_KEY.get(key) ?? null;
}
/**
 * Normalizes a persisted language value for API responses, falling back to 'en'
 * only when no valid language preference exists.
 */
function resolvePreferredLanguage(value) {
    return normalizePreferredLanguage(value) ?? exports.DEFAULT_LANGUAGE_CODE;
}
/**
 * Strict validator for user preferred_language inputs.
 * Accepts canonical codes ('en', 'hi', 'kn', 'ta', 'te', 'ml', 'mr', 'bn')
 * as well as legacy English/native names mapped to canonical codes, and rejects
 * unsupported languages.
 */
exports.PreferredLanguageSchema = zod_1.z
    .string()
    .trim()
    .min(1, 'Preferred language cannot be empty')
    .max(30, 'Preferred language is too long')
    .transform((val, ctx) => {
    const code = normalizePreferredLanguage(val);
    if (!code) {
        ctx.addIssue({
            code: 'custom',
            message: `Unsupported preferred_language "${val}". Supported codes: ${exports.SUPPORTED_LANGUAGE_CODES.join(', ')}`,
        });
        return zod_1.z.NEVER;
    }
    return code;
});
//# sourceMappingURL=languages.js.map