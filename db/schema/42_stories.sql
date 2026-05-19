-- SECTION 12: FAMILY STORIES FEED
-- ============================================================
 
-- Family posts content that the patient views as a daily feed.
-- Primary family-to-patient communication channel.
-- moderation_status prevents distressing content reaching patient.
CREATE TABLE family_stories (
  id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  posted_by           UUID              NOT NULL REFERENCES users(id),
  media_type          story_media_type  NOT NULL,
  text_content        TEXT,
  media_url           TEXT,             -- S3 path for photo, voice note, or video memo
  media_duration_s    INTEGER,          -- for voice note and video
  thumbnail_url       TEXT,             -- for video memo
  caption             TEXT,
  is_birthday         BOOLEAN           NOT NULL DEFAULT FALSE,
  is_pinned           BOOLEAN           NOT NULL DEFAULT FALSE,
  -- moderation_status: APPROVED | FLAGGED | REJECTED
  moderation_status   VARCHAR(20)       NOT NULL DEFAULT 'APPROVED',
  flagged_reason      TEXT,
  shown_at            TIMESTAMPTZ,      -- when patient viewed this story
  -- patient_reaction: 'HEART' | 'SMILE' | 'WAVE'
  patient_reaction    VARCHAR(20),
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_stories_patient ON family_stories (patient_id, created_at DESC);
CREATE INDEX idx_stories_unshown ON family_stories (patient_id, shown_at)
  WHERE shown_at IS NULL;
 
 
-- ============================================================
