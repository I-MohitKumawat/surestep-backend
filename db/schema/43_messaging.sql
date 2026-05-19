-- SECTION 13: MESSAGING
-- ============================================================
 
-- Patient-scoped threads between caregivers and family members.
-- Not a general chat. Every message is attached to a specific patient.
CREATE TABLE message_threads (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by  UUID          NOT NULL REFERENCES users(id),
  title       VARCHAR(200),
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_threads_patient ON message_threads (patient_id);
 
 
CREATE TABLE messages (
  id          UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID                  NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id   UUID                  NOT NULL REFERENCES users(id),
  body        TEXT,
  media_url   TEXT,                 -- S3 path for voice note or photo
  media_type  message_media_type    NOT NULL DEFAULT 'TEXT',
  is_read     BOOLEAN               NOT NULL DEFAULT FALSE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_messages_thread ON messages (thread_id, created_at DESC);
CREATE INDEX idx_messages_unread ON messages (thread_id) WHERE is_read = FALSE;
 
 
-- ============================================================
