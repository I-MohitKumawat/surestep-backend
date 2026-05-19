-- SECTION 20: PAYMENTS & SUBSCRIPTIONS
-- ============================================================
 
CREATE TABLE subscriptions (
  id                    UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id            UUID                  NOT NULL REFERENCES users(id),
  subscribed_by         UUID                  NOT NULL REFERENCES users(id),  -- family guardian
  plan_name             VARCHAR(50)           NOT NULL,   -- 'BASIC' | 'STANDARD' | 'PREMIUM'
  status                subscription_status   NOT NULL DEFAULT 'TRIAL',
  amount_inr            DECIMAL(10,2)         NOT NULL,
  billing_cycle         VARCHAR(20)           NOT NULL DEFAULT 'MONTHLY',
  razorpay_sub_id       VARCHAR(100),
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  trial_ends_at         TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_subscriptions_patient ON subscriptions (patient_id, status);
 
 
CREATE TABLE caregiver_payments (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id            UUID            NOT NULL REFERENCES users(id),
  caregiver_id          UUID            NOT NULL REFERENCES users(id),
  paid_by               UUID            NOT NULL REFERENCES users(id),   -- family guardian
  amount_inr            DECIMAL(10,2)   NOT NULL,
  platform_fee_inr      DECIMAL(10,2)   NOT NULL DEFAULT 0,
  net_to_caregiver_inr  DECIMAL(10,2)   NOT NULL,
  for_period_start      DATE            NOT NULL,
  for_period_end        DATE            NOT NULL,
  status                payment_status  NOT NULL DEFAULT 'PENDING',
  razorpay_order_id     VARCHAR(100),
  razorpay_payment_id   VARCHAR(100),
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_payments_caregiver ON caregiver_payments (caregiver_id, created_at DESC);
CREATE INDEX idx_payments_patient   ON caregiver_payments (patient_id, created_at DESC);
 
 
-- ============================================================
