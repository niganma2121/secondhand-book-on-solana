ALTER TABLE users
    ADD COLUMN IF NOT EXISTS enc_pubkey TEXT;

CREATE INDEX IF NOT EXISTS idx_users_enc_pubkey_not_null
    ON users (pubkey)
    WHERE enc_pubkey IS NOT NULL;
