-- SECTION 18: SHARED DOCUMENTS
-- ============================================================
 
CREATE TABLE shared_documents (
  id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  uploaded_by      UUID            NOT NULL REFERENCES users(id),
  document_type    document_type   NOT NULL,
  title            VARCHAR(200)    NOT NULL,
  storage_path     TEXT            NOT NULL,    -- S3 key
  file_size_bytes  INTEGER,
  mime_type        VARCHAR(100),
  notes            TEXT,
  issue_date       DATE,
  expiry_date      DATE,
  is_active        BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_docs_patient ON shared_documents (patient_id) WHERE is_active = TRUE;
 
 
-- ============================================================
