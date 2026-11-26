import { z } from 'zod';
export type SupportedLanguageCode = 'en' | 'hi' | 'kn' | 'ta' | 'te' | 'ml' | 'mr' | 'bn';
export interface LanguageDefinition {
    code: SupportedLanguageCode;
    name: string;
    nativeName: string;
}
export declare const DEFAULT_LANGUAGE_CODE: SupportedLanguageCode;
export declare const SUPPORTED_LANGUAGES: readonly LanguageDefinition[];
export declare const SUPPORTED_LANGUAGE_CODES: SupportedLanguageCode[];
/**
 * Normalizes an ISO language code or legacy display name to a canonical code.
 * Returns null for empty or unsupported values.
 */
export declare function normalizePreferredLanguage(value: unknown): SupportedLanguageCode | null;
/**
 * Normalizes a persisted language value for API responses, falling back to 'en'
 * only when no valid language preference exists.
 */
export declare function resolvePreferredLanguage(value: unknown): SupportedLanguageCode;
/**
 * Strict validator for user preferred_language inputs.
 * Accepts canonical codes ('en', 'hi', 'kn', 'ta', 'te', 'ml', 'mr', 'bn')
 * as well as legacy English/native names mapped to canonical codes, and rejects
 * unsupported languages.
 */
export declare const PreferredLanguageSchema: z.ZodPipe<z.ZodString, z.ZodTransform<"en" | "hi" | "kn" | "ta" | "te" | "ml" | "mr" | "bn", string>>;
//# sourceMappingURL=languages.d.ts.map