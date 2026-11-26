-- =============================================================================
-- SureStep — Migration 025: Normalize users.preferred_language to ISO 639-1 codes
-- =============================================================================
-- Previously, some UI flows sent display names (e.g. 'Kannada', 'English')
-- directly to PATCH /users/me or PUT /profiles/patient. Normalize historical
-- values to canonical ISO codes without disturbing already-valid codes.

UPDATE users
SET preferred_language = CASE LOWER(TRIM(preferred_language))
  WHEN 'english' THEN 'en'
  WHEN 'hindi' THEN 'hi'
  WHEN 'kannada' THEN 'kn'
  WHEN 'tamil' THEN 'ta'
  WHEN 'telugu' THEN 'te'
  WHEN 'malayalam' THEN 'ml'
  WHEN 'marathi' THEN 'mr'
  WHEN 'bengali' THEN 'bn'
  ELSE LOWER(TRIM(preferred_language))
END
WHERE preferred_language IS NOT NULL
  AND (
    LOWER(TRIM(preferred_language)) IN (
      'english', 'hindi', 'kannada', 'tamil', 'telugu', 'malayalam', 'marathi', 'bengali'
    )
    OR preferred_language <> LOWER(TRIM(preferred_language))
  );
