import { z } from 'zod';

export type SupportedLanguageCode =
  | 'en'
  | 'hi'
  | 'kn'
  | 'ta'
  | 'te'
  | 'ml'
  | 'mr'
  | 'bn';

export interface LanguageDefinition {
  code: SupportedLanguageCode;
  name: string;
  nativeName: string;
}

export const DEFAULT_LANGUAGE_CODE: SupportedLanguageCode = 'en';

export const SUPPORTED_LANGUAGES: readonly LanguageDefinition[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
] as const;

export const SUPPORTED_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map(
  (lang) => lang.code,
) as SupportedLanguageCode[];

const LOOKUP_BY_KEY = new Map<string, SupportedLanguageCode>();
for (const lang of SUPPORTED_LANGUAGES) {
  LOOKUP_BY_KEY.set(lang.code.toLowerCase(), lang.code);
  LOOKUP_BY_KEY.set(lang.name.toLowerCase(), lang.code);
  LOOKUP_BY_KEY.set(lang.nativeName.toLowerCase(), lang.code);
}

/**
 * Normalizes an ISO language code or legacy display name to a canonical code.
 * Returns null for empty or unsupported values.
 */
export function normalizePreferredLanguage(
  value: unknown,
): SupportedLanguageCode | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return LOOKUP_BY_KEY.get(key) ?? null;
}

/**
 * Normalizes a persisted language value for API responses, falling back to 'en'
 * only when no valid language preference exists.
 */
export function resolvePreferredLanguage(
  value: unknown,
): SupportedLanguageCode {
  return normalizePreferredLanguage(value) ?? DEFAULT_LANGUAGE_CODE;
}

/**
 * Strict validator for user preferred_language inputs.
 * Accepts canonical codes ('en', 'hi', 'kn', 'ta', 'te', 'ml', 'mr', 'bn')
 * as well as legacy English/native names mapped to canonical codes, and rejects
 * unsupported languages.
 */
export const PreferredLanguageSchema = z
  .string()
  .trim()
  .min(1, 'Preferred language cannot be empty')
  .max(30, 'Preferred language is too long')
  .transform((val, ctx) => {
    const code = normalizePreferredLanguage(val);
    if (!code) {
      ctx.addIssue({
        code: 'custom',
        message: `Unsupported preferred_language "${val}". Supported codes: ${SUPPORTED_LANGUAGE_CODES.join(', ')}`,
      });
      return z.NEVER;
    }
    return code;
  });
