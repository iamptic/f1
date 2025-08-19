-- 2025-08-19: create reservations table
CREATE TABLE IF NOT EXISTS reservations (
  id BIGSERIAL PRIMARY KEY,
  offer_id BIGINT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  name TEXT DEFAULT '' NOT NULL,
  phone TEXT DEFAULT '' NOT NULL,
  status TEXT DEFAULT 'active' NOT NULL, -- active/cancelled/expired/used
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservations_expires ON reservations(expires_at);
CREATE INDEX IF NOT EXISTS idx_reservations_offer ON reservations(offer_id);
