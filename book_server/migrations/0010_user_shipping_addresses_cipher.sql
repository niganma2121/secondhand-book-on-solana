CREATE TABLE IF NOT EXISTS user_shipping_ciphertexts
(
    id                      BIGSERIAL PRIMARY KEY,
    user_pubkey             VARCHAR(44) NOT NULL REFERENCES users (pubkey) ON DELETE CASCADE,
    buyer_ciphertext        TEXT        NOT NULL,
    buyer_nonce             TEXT        NOT NULL,
    buyer_alg               VARCHAR(64) NOT NULL,
    encryption_key_version  VARCHAR(32) NOT NULL,
    is_default              BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at              BIGINT      NOT NULL,
    updated_at              BIGINT      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_shipping_ciphertexts_user
    ON user_shipping_ciphertexts (user_pubkey, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_shipping_ciphertexts_default
    ON user_shipping_ciphertexts (user_pubkey)
    WHERE is_default = TRUE;
