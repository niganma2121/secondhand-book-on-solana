ALTER TABLE escrows
    ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(44) REFERENCES users(pubkey);

CREATE INDEX IF NOT EXISTS idx_escrows_cancelled_by ON escrows (cancelled_by);
